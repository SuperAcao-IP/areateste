#!/usr/bin/env node
/* Gera dados/servicos-oficiais.js: CRAS e CREAS dos municípios do mapa, a partir dos microdados abertos do
   Censo SUAS (MDS/SNAS). Não é semanal: o Censo SUAS sai uma vez por ano. Rodar à mão quando o MDS publicar o
   censo novo (confira a página https://aplicacoes.mds.gov.br/sagi/snas/vigilancia/index2.php e troque ANO).

   Uso: node scripts/gerar-servicos-oficiais.js [ANO] [--simular]

   Cuidados com a fonte (ver ATUALIZACAO-CATALOGOS.md):
     - o censo NÃO traz o nome da unidade: o rótulo vira "CRAS – Rua X, 123 (Bairro)";
     - latitude/longitude vêm em notação científica corrompida ("-1.35E+16" = -13,5…): reconstruídas e CONFERIDAS:
       coordenada a mais de 20 km do município é descartada (a unidade fica fora do mapa e entra no relatório);
     - e-mails e dados de pessoal do arquivo bruto NÃO são lidos. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { carregarCidades, km, RAIZ } = require("./lib/cidades");
const { enderecoParaExibir } = require("./lib/geocodificar");

const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const ANO = args.find(a => /^\d{4}$/.test(a)) || "2025";
const BASE = `https://aplicacoes.mds.gov.br/snas/defeso/censosuas/${ANO}/`;
const ARQUIVOS = [["CRAS", "1_CRAS.zip", /Dados_Gerais\.csv$/i], ["CREAS", "2_CREAS.zip", /Dados_Gerais\.csv$/i]];
const RAIO_MAXIMO_KM = 20;

/* leitor mínimo de ZIP (diretório central + inflate): sem dependências */
function lerZip(buf){
  let fim = buf.length - 22;
  while(fim >= 0 && buf.readUInt32LE(fim) !== 0x06054b50) fim--;
  if(fim < 0) throw new Error("zip inválido");
  const n = buf.readUInt16LE(fim + 10); let p = buf.readUInt32LE(fim + 16);
  const entradas = [];
  for(let i = 0; i < n; i++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip inválido (diretório central)");
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), nomeLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), comLen = buf.readUInt16LE(p + 32), ini = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + nomeLen);
    entradas.push({ nome, metodo, tam, ini });
    p += 46 + nomeLen + extraLen + comLen;
  }
  return { entradas, ler(e){
    const nomeLen = buf.readUInt16LE(e.ini + 26), extraLen = buf.readUInt16LE(e.ini + 28), d = e.ini + 30 + nomeLen + extraLen;
    const dados = buf.subarray(d, d + e.tam);
    return e.metodo === 0 ? dados : zlib.inflateRawSync(dados);
  } };
}
function csvPontoVirgula(txt){
  const rows = []; let r = [], f = "", q = false;
  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    if(q){ if(c === '"'){ if(txt[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if(c === '"') q = true;
    else if(c === ";"){ r.push(f); f = ""; }
    else if(c === "\n"){ r.push(f.replace(/\r$/, "")); rows.push(r); r = []; f = ""; }
    else f += c;
  }
  if(f || r.length){ r.push(f); rows.push(r); }
  return rows;
}
/* "-2.33E+16" (corrompido) -> -23.3...: os dois primeiros dígitos são o grau */
function coordenada(v){
  v = String(v || "").trim(); if(!v) return null;
  const neg = v.startsWith("-"), d = v.replace(/^-/, "");
  const m = d.match(/^(\d)\.?(\d*)E\+(\d+)$/i);
  const digitos = (m ? m[1] + m[2] : d.replace(".", "")).replace(/^0+/, "");
  if(!digitos) return null;
  const n = parseFloat(digitos.slice(0, 2) + "." + digitos.slice(2));
  return isNaN(n) ? null : (neg ? -n : n);
}
const titulo = t => { const L = t.replace(/[^A-Za-zÀ-ÿ]/g, ""); return (!L || L !== L.toUpperCase()) ? t : t.toLowerCase().replace(/(^|[\s.(/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, x => x.toLowerCase()); };
const telefone = t => { const d = String(t || "").replace(/\D/g, ""); return d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : ""; };
const tipoLogradouro = t => ({ AV: "Avenida", "AV.": "Avenida", R: "Rua", "R.": "Rua" }[String(t).toUpperCase()] || titulo(String(t)));

(async () => {
  const { municipios, centros, norm } = carregarCidades();
  const porNome = new Map(municipios.map(m => [norm(m), m]));
  const lista = [], semCoord = [], contagem = {};
  for(const [tipo, arq, padrao] of ARQUIVOS){
    console.log(`Baixando ${BASE}${arq} …`);
    const resp = await fetch(BASE + arq, { headers: { "user-agent": "SuperAcaoSP-mapa/1.0 (+https://superacao-ip.github.io/areateste/)" } });
    if(!resp.ok) throw new Error(`${arq}: HTTP ${resp.status} (o MDS pode ter mudado o endereço; confira a página do Censo SUAS)`);
    const zip = lerZip(Buffer.from(await resp.arrayBuffer()));
    const entrada = zip.entradas.find(e => padrao.test(e.nome));
    if(!entrada) throw new Error(`${arq}: não achei o arquivo Dados_Gerais.csv dentro do zip`);
    const rows = csvPontoVirgula(zip.ler(entrada).toString("latin1"));
    const h = rows[0], ix = n => h.indexOf(n);
    for(const c of ["q0_2", "q0_3", "q0_4", "q0_6", "q0_9", "q0_10", "q0_12", "q0_13", "latitude", "longitude", "NU_IDENTIFICADOR"]) if(ix(c) < 0) throw new Error(`${arq}: coluna ${c} não existe mais (o layout do censo mudou)`);
    for(const r of rows.slice(1)){
      if(r.length < 10 || !["SP", "35"].includes((r[ix("q0_10")] || "").trim())) continue;
      const municipio = porNome.get(norm(r[ix("q0_9")] || "")); if(!municipio) continue;
      const rua = [tipoLogradouro((r[ix("q0_2")] || "").trim()), titulo((r[ix("q0_3")] || "").trim())].filter(Boolean).join(" ");
      const endereco = enderecoParaExibir(rua, (r[ix("q0_4")] || "").trim());
      const bairro = titulo((r[ix("q0_6")] || "").trim());
      const lat = coordenada(r[ix("latitude")]), lon = coordenada(r[ix("longitude")]);
      const centro = centros[norm(municipio)];
      const item = { id: `svc-oficial-${r[ix("NU_IDENTIFICADOR")]}`, tipo, nome: `${tipo} – ${endereco}${bairro ? " (" + bairro + ")" : ""}`, endereco, bairro, cidade: municipio,
        lat: null, lon: null, telefone: telefone(r[ix("q0_13")] || r[ix("q0_12")]), fonte: `Censo SUAS ${ANO} (MDS)` };
      if(lat != null && lon != null && centro && km({ lat, lon }, centro) <= RAIO_MAXIMO_KM){ item.lat = +lat.toFixed(6); item.lon = +lon.toFixed(6); }
      else semCoord.push(`${tipo} · ${municipio}: ${endereco}${bairro ? " – " + bairro : ""}`);
      lista.push(item);
      contagem[municipio] = contagem[municipio] || { CRAS: 0, CREAS: 0 }; contagem[municipio][tipo]++;
    }
  }
  if(lista.length < 150) throw new Error(`só ${lista.length} unidades nos ${municipios.length} municípios (esperado ~280): o layout do censo pode ter mudado; nada foi gravado`);
  lista.sort((a, b) => a.cidade.localeCompare(b.cidade, "pt") || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, "pt"));
  const linhas = lista.map(x => " " + JSON.stringify(x)).join(",\n");
  const texto = `/* CRAS e CREAS dos municípios do mapa. Fonte: microdados abertos do Censo SUAS ${ANO} (MDS/SNAS), ${BASE}.\n` +
    `   Gerado por scripts/gerar-servicos-oficiais.js · ${new Date().toISOString().slice(0, 10)}. Não edite à mão. O censo não traz o nome da unidade (o rótulo é o endereço).\n` +
    `   Quem está sem lat/lon (coordenada ausente ou inválida) não aparece no mapa. */\nconst SERVICOS_OFICIAIS = [\n${linhas}\n];\n`;
  if(!SIMULAR) fs.writeFileSync(path.join(RAIZ, "dados", "servicos-oficiais.js"), texto, "utf8");
  console.log(`${lista.length} unidades (${lista.filter(x => x.lat != null).length} com coordenada válida)${SIMULAR ? " [simulação: nada gravado]" : ""}`);
  if(semCoord.length) console.log("Sem coordenada válida (fora do mapa):\n - " + semCoord.join("\n - "));
  console.log("município | CRAS | CREAS"); municipios.forEach(m => console.log(`${m} | ${(contagem[m] || {}).CRAS || 0} | ${(contagem[m] || {}).CREAS || 0}`));
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
