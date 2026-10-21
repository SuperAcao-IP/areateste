#!/usr/bin/env node
/* Atualização semanal dos dados das CAMADAS do mapa (cursos presenciais por unidade e
   computador/internet).

   Fontes (cada uma isolada: se uma falhar, mantém a versão anterior só dela):
     - Senac-SP:  cadastro manual (scripts/fontes/unidades-senac-cadastro.json). A coleta no site do Senac
                    está desligada (COLETAR_SENAC), por causa dos termos de uso do site
     - Senai-SP:  páginas de unidade (endereço; coordenadas calculadas pelo endereço)
     - Bibliotecas: levantamento do cadastro estadual em scripts/fontes/bibliotecas-siseb.json
                    (só geocodifica; o levantamento é refeito à mão uma vez por ano)
     - Aba "pontos_digitais" da planilha (se PLANILHA_PONTOS_CSV_URL estiver preenchida): calcula a
                    coordenada das linhas que a equipe deixou sem latitude/longitude
   Também confere a aba "cursos" da planilha: quais cursos presenciais do Senai/Senac se ligam a uma
   unidade e quais ficam de fora (para a equipe preencher). Esse relatório não altera nenhum dado.

   Escreve: dados/unidades.js, dados/pontos-computador.js, dados/pontos-geocodificados.js,
            dados/geocache.json e o relatório (relatorio-mapa.md).
   Uso: node scripts/atualizar-mapa.js [--simular] [--ignorar senac,senai,bibliotecas,pontos] [--relatorio arq.md] */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { carregarCidades, km, RAIZ } = require("./lib/cidades");
const { carregarCache, salvarCache, geocodificar, enderecoParaExibir } = require("./lib/geocodificar");
const { coletarSenac, coletarSenacUnidades, coletarSenai } = require("./lib/coletores-mapa");
const { buscar } = require("./lib/util");

const DADOS = path.join(RAIZ, "dados");
const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const iIgn = args.indexOf("--ignorar");
const IGNORAR = new Set(iIgn >= 0 ? String(args[iIgn + 1] || "").split(",").map(s => s.trim()).filter(Boolean) : []);
const iRel = args.indexOf("--relatorio");
const ARQ_RELATORIO = path.resolve(iRel >= 0 ? args[iRel + 1] : path.join(RAIZ, "relatorio-mapa.md"));
const HOJE = new Date().toISOString().slice(0, 10);
const QUEDA_MAXIMA = 0.30;
/* Coleta automática do site do Senac-SP: DESLIGADA. Os termos de uso do site proíbem acesso automatizado e
   cópia dos dados sem consentimento. Só ligue (COLETAR_SENAC=1 ou --coletar-senac) com autorização por escrito do Senac.
   Desligada, as unidades vêm do cadastro manual scripts/fontes/unidades-senac-cadastro.json (nome e endereço, sem cursos);
   os cursos do Senac vêm da aba "cursos" da planilha. */
const COLETAR_SENAC = process.env.COLETAR_SENAC === "1" || args.includes("--coletar-senac");

/* ---------- o site como biblioteca: mesmas regras do navegador ---------- */
function carregarSite(){
  const ctx = { console: { log(){}, warn(){}, error(){} } };
  vm.createContext(ctx);
  const ler = rel => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  vm.runInContext(["js/areas.js", "js/config.js", "js/conectores.js", "js/mapa-camadas.js"].map(ler).join("\n") +
    `\nglobalThis.__s = { vincularCursoAUnidade, chaveEnderecoPonto, separarEndereco, tipoDePonto, csvParaObjetos, parseCSV,
       cursosUrl: PLANILHA_CSV_URL, pontosUrl: PLANILHA_PONTOS_CSV_URL, servicosUrl: PLANILHA_SERVICOS_CSV_URL, numeroDecimal, statusFechado };`, ctx);
  return ctx.__s;
}

/* ---------- arquivos de dados ---------- */
function lerConstante(arquivo, nome){
  const arq = path.join(DADOS, arquivo);
  if(!fs.existsSync(arq)) return null;
  const ctx = {}; vm.createContext(ctx);
  try{ vm.runInContext(fs.readFileSync(arq, "utf8") + `\nglobalThis.__v = ${nome};`, ctx); return ctx.__v; }catch(_){ return null; }
}
const comparavel = t => String(t).replace(/atualizado em \d{4}-\d{2}-\d{2}/, "atualizado em -").replace(/\r\n/g, "\n");
function gravarSeMudou(arquivo, texto, mudancas){
  const arq = path.join(DADOS, arquivo);
  const antigo = fs.existsSync(arq) ? fs.readFileSync(arq, "utf8") : "";
  if(comparavel(antigo) === comparavel(texto)) return false;
  if(!SIMULAR) fs.writeFileSync(arq, texto, "utf8");
  mudancas.push(arquivo);
  return true;
}
const linhasJson = lista => lista.map(x => " " + JSON.stringify(x)).join(",\n");

async function main(){
  const cid = carregarCidades();
  const site = carregarSite();
  const cache = carregarCache();
  const centro = nomeCidade => cid.centros[cid.norm(nomeCidade)] || null;
  const relatorio = { falhas: [], notas: [], mudancas: [] };

  const unidadesAnt = lerConstante("unidades.js", "UNIDADES") || [];
  const pontosAnt = lerConstante("pontos-computador.js", "PONTOS_COMPUTADOR") || [];
  const geoAnt = lerConstante("pontos-geocodificados.js", "PONTOS_GEOCODIFICADOS") || {};

  const ctxFonte = { interessam: cid.interessam, norm: cid.norm };
  const semCoordenada = [];
  const geocodificarUnidade = async u => {
    if(u.lat != null && u.lon != null) return u;
    const g = await geocodificar({ rua: u.rua, numero: u.numero, cidade: u.cidade, nome: u.nome }, centro(u.cidade), cache);
    if(!g){ semCoordenada.push(`${u.nome} (${u.cidade}): ${u.rua}, ${u.numero}`); return null; }
    return { ...u, lat: g.lat, lon: g.lon, confianca: g.confianca };
  };

  /* ===== Senac ===== */
  let senac = unidadesAnt.filter(u => u.inst === "Senac"), senacRes = "mantido";
  if(!COLETAR_SENAC && !IGNORAR.has("senac")){
    try{
      const cad = JSON.parse(fs.readFileSync(path.join(__dirname, "fontes", "unidades-senac-cadastro.json"), "utf8")).unidades || [];
      if(!cad.length) throw new Error("cadastro manual de unidades do Senac vazio");
      console.log("Senac: cadastro manual (" + cad.length + " unidades; coleta automática desligada)…");
      const lista = [];
      for(const u of cad){
        const m = String(u.endereco).split(" – ")[0].split(",");
        const g = await geocodificarUnidade({ ...u, rua: m[0].trim(), numero: (m[1] || "").trim() });
        if(g) lista.push({ id: u.id, inst: "Senac", nome: u.nome, endereco: u.endereco, cidade: u.cidade, lat: g.lat, lon: g.lon, link: "", psg: false, cursos: [] });
      }
      if(senac.length >= 5 && lista.length < senac.length * (1 - QUEDA_MAXIMA)) throw new Error(`só ${lista.length} unidades do Senac com coordenada contra ${senac.length} da versão anterior`);
      if(!lista.length) throw new Error("nenhuma unidade do Senac com coordenada");
      senac = lista; senacRes = `${lista.length} unidades do cadastro manual (coleta automática desligada)`;
    }catch(e){ relatorio.falhas.push({ nome: "Senac (cadastro manual)", motivo: e.message }); senacRes = "FALHOU, mantida a versão anterior (" + senac.length + " unidades)"; console.error("  FALHOU:", e.message); }
  }
  if(COLETAR_SENAC && !IGNORAR.has("senac")){
    try{
      console.log("Senac: lista de unidades…");
      const paginas = await coletarSenacUnidades(ctxFonte);
      console.log("  " + paginas.detalhe);
      console.log("Senac: cursos com bolsa (API)…");
      const api = await coletarSenac(ctxFonte);
      console.log("  " + api.detalhe);
      const porId = new Map(paginas.unidades.map(u => [u.id, u]));
      for(const a of api.unidades){
        if(porId.has(a.id)){ const p = porId.get(a.id); p.cursos = a.cursos; p.psg = true; if(p.lat == null){ p.lat = a.lat; p.lon = a.lon; } }
        else porId.set(a.id, a);
      }
      const lista = [];
      for(const u of porId.values()){
        const g = await geocodificarUnidade({ ...u, rua: String(u.endereco).split(" – ")[0].split(",")[0], numero: (String(u.endereco).split(" – ")[0].split(",")[1] || "").trim() });
        if(g) lista.push({ id: u.id, inst: "Senac", nome: u.nome, endereco: u.endereco, cidade: u.cidade, lat: g.lat, lon: g.lon, link: u.link, psg: !!u.psg, cursos: u.cursos || [] });
      }
      if(senac.length >= 5 && lista.length < senac.length * (1 - QUEDA_MAXIMA)) throw new Error(`só ${lista.length} unidades do Senac contra ${senac.length} da versão anterior (queda de mais de 30%)`);
      if(!lista.length) throw new Error("nenhuma unidade do Senac");
      senac = lista; senacRes = `${lista.length} unidades, ${lista.reduce((a, u) => a + u.cursos.length, 0)} ofertas de curso`;
    }catch(e){ relatorio.falhas.push({ nome: "Senac", motivo: e.message }); senacRes = "FALHOU, mantida a versão anterior (" + senac.length + " unidades)"; console.error("  FALHOU:", e.message); }
  }

  /* ===== Senai ===== */
  let senai = unidadesAnt.filter(u => u.inst === "Senai"), senaiRes = "mantido";
  if(!IGNORAR.has("senai")){
    try{
      console.log("Senai: páginas de unidade…");
      const r = await coletarSenai(ctxFonte);
      console.log("  " + r.detalhe);
      const lista = [];
      for(const u of r.unidades){
        const g = await geocodificarUnidade(u);
        if(g) lista.push({ id: u.id, inst: "Senai", nome: u.nome, endereco: [u.rua, u.numero].filter(Boolean).join(", ") + (u.bairro ? " – " + u.bairro : ""), cidade: u.cidade, lat: g.lat, lon: g.lon, link: u.link, psg: false, cursos: [] });
      }
      if(senai.length >= 5 && lista.length < senai.length * (1 - QUEDA_MAXIMA)) throw new Error(`só ${lista.length} unidades do Senai contra ${senai.length} da versão anterior (queda de mais de 30%)`);
      if(!lista.length) throw new Error("nenhuma unidade do Senai");
      senai = lista; senaiRes = `${lista.length} unidades`;
    }catch(e){ relatorio.falhas.push({ nome: "Senai", motivo: e.message }); senaiRes = "FALHOU, mantida a versão anterior (" + senai.length + " unidades)"; console.error("  FALHOU:", e.message); }
  }

  /* ===== Bibliotecas (levantamento do SisEB) ===== */
  let bibl = pontosAnt.filter(p => p.tipo === "biblioteca"), biblRes = "mantido";
  if(!IGNORAR.has("bibliotecas")){
    try{
      const snap = JSON.parse(fs.readFileSync(path.join(__dirname, "fontes", "bibliotecas-siseb.json"), "utf8"));
      if(!(snap.bibliotecas || []).length) throw new Error("levantamento de bibliotecas vazio");
      console.log("Bibliotecas: geocodificando " + snap.bibliotecas.length + " endereços (só os novos consultam a internet)…");
      const lista = [], sem = [];
      for(const b of snap.bibliotecas){
        const e = site.separarEndereco(b.endereco);
        if(!e.rua){ sem.push(b.nome + " (sem endereço)"); continue; }
        const g = await geocodificar({ rua: e.rua, numero: e.numero, cidade: b.municipio, nome: b.nome }, centro(b.municipio), cache);
        if(!g){ sem.push(`${b.nome} (${b.municipio}): ${b.endereco}`); continue; }
        lista.push({ id: "bib-" + site.chaveEnderecoPonto(b.endereco, b.municipio), tipo: "biblioteca", nome: b.nome, endereco: enderecoParaExibir(e.rua, e.numero) + (b.bairro ? " – " + b.bairro : ""),
          cidade: b.municipio, lat: g.lat, lon: g.lon, computador: !!b.computador, wifi: !!b.wifi, ano: b.ano, fonte: "Cadastro Estadual de Bibliotecas (SisEB)" });
      }
      semCoordenada.push(...sem);
      if(bibl.length >= 10 && lista.length < bibl.length * (1 - QUEDA_MAXIMA)) throw new Error(`só ${lista.length} bibliotecas com coordenada contra ${bibl.length} da versão anterior`);
      bibl = lista; biblRes = `${lista.length} de ${snap.bibliotecas.length} com coordenada (${lista.filter(x => x.computador).length} com computador, ${lista.filter(x => !x.computador).length} só Wi-Fi)`;
    }catch(e){ relatorio.falhas.push({ nome: "Bibliotecas", motivo: e.message }); biblRes = "FALHOU, mantida a versão anterior"; console.error("  FALHOU:", e.message); }
  }

  /* ===== Aba "pontos_digitais": só calcula coordenada do que a equipe deixou sem lat/lon ===== */
  let geo = geoAnt, pontosRes = "abas não configuradas (PLANILHA_PONTOS_CSV_URL e PLANILHA_SERVICOS_CSV_URL vazias)";
  if((site.pontosUrl || site.servicosUrl) && !IGNORAR.has("pontos")){
    try{
      const linhas = [];
      for(const [aba, url] of [["pontos_digitais", site.pontosUrl], ["servicos", site.servicosUrl]]){
        if(!url) continue;
        const r = await buscar(url, { tentativas: 3 });
        if(r.status !== 200) throw new Error("a aba " + aba + " respondeu HTTP " + r.status);
        site.csvParaObjetos(r.texto, "nome").filter(l => !site.statusFechado(l.status)).forEach(l => linhas.push(l));
      }
      const novo = {}; let calculadas = 0, semEnd = [];
      for(const l of linhas){
        if(site.numeroDecimal(l.lat) != null && site.numeroDecimal(l.lon) != null) continue;
        if(!l.endereco || !l.municipio){ semEnd.push(l.nome); continue; }
        const e = site.separarEndereco(l.endereco);
        const g = await geocodificar({ rua: e.rua, numero: e.numero, cidade: l.municipio, nome: l.nome }, centro(l.municipio), cache);
        if(g){ novo[site.chaveEnderecoPonto(l.endereco, l.municipio)] = { lat: g.lat, lon: g.lon }; calculadas++; }
        else semCoordenada.push(`${l.nome} (${l.municipio}): ${l.endereco}`);
      }
      geo = novo; pontosRes = `${linhas.length} linhas ativas (pontos_digitais + servicos), ${calculadas} coordenadas calculadas pelo endereço`;
      if(semEnd.length) relatorio.notas.push("Linhas das abas pontos_digitais/servicos sem endereço ou município (não entram no mapa): " + semEnd.join("; "));
    }catch(e){ relatorio.falhas.push({ nome: "Abas pontos_digitais e servicos", motivo: e.message }); pontosRes = "FALHOU, mantida a versão anterior"; console.error("  FALHOU:", e.message); }
  }

  /* ===== relatório da aba "cursos": que cursos presenciais se ligam a uma unidade ===== */
  const unidades = senac.concat(senai);
  let vinculos = null;
  try{
    const r = await buscar(site.cursosUrl, { tentativas: 3 });
    if(r.status !== 200) throw new Error("HTTP " + r.status);
    const rows = site.csvParaObjetos(r.texto, "curso", { apelidos: { nome: "curso", insituicao: "instituicao", carga_horaria: "carga", data_de_abertura: "inscricoes_de", validade: "inscricoes_ate" }, posicoes: { 0: "municipio", 6: "area" } })
      .filter(x => /presencial/i.test(x.modalidade || "") && x.municipio && !site.statusFechado(x.status));
    vinculos = { total: rows.length, ok: 0, ambiguos: new Map(), semUnidade: new Map(), outras: new Map() };
    for(const x of rows){
      const v = site.vincularCursoAUnidade(x.instituicao, x.municipio, unidades, x.unidade);
      if(v.unidade){ vinculos.ok++; continue; }
      const k = `${x.instituicao} | ${x.municipio}`;
      const alvo = v.motivo === "ambigua" ? vinculos.ambiguos : v.motivo === "sem_unidade_na_cidade" ? vinculos.semUnidade : vinculos.outras;
      const reg = alvo.get(k) || { n: 0, candidatos: v.candidatos ? v.candidatos.map(c => c.nome) : [] };
      reg.n++; alvo.set(k, reg);
    }
  }catch(e){ relatorio.notas.push("Não consegui conferir a aba cursos da planilha: " + e.message); }

  /* ===== gravação ===== */
  const nada = relatorio.falhas.length && !senac.length && !senai.length && !bibl.length;
  if(nada){
    escrever(relatorio, { senacRes, senaiRes, biblRes, pontosRes }, semCoordenada, vinculos, unidades, bibl);
    saida("publicar", "false"); saida("falhou", "true"); saida("parcial", "false"); saida("fontes_com_falha", "");
    console.error("Nenhuma fonte produziu dados: nada foi alterado.");
    process.exit(1);
  }
  const cab = (titulo, extra) => `/* ${titulo}\n   Gerado por scripts/atualizar-mapa.js · atualizado em ${HOJE}. Não edite à mão: a próxima execução sobrescreve.\n   ${extra} */\n`;
  gravarSeMudou("unidades.js",
    cab("Unidades de ensino presencial (Senac e Senai) para o mapa, com os cursos de cada uma.", "Senac e Senai: só a unidade (cadastro manual do Senac); os cursos vêm da planilha.") +
    "const UNIDADES = [\n" + linhasJson(unidades) + "\n];\n", relatorio.mudancas);
  gravarSeMudou("pontos-computador.js",
    cab("Lugares com computador e/ou Wi-Fi para o público (bibliotecas do cadastro estadual).", "Os pontos cadastrados à mão na aba pontos_digitais da planilha são lidos ao vivo pelo navegador.") +
    "const PONTOS_COMPUTADOR = [\n" + linhasJson(bibl) + "\n];\n", relatorio.mudancas);
  gravarSeMudou("pontos-geocodificados.js",
    cab("Coordenadas calculadas pelo endereço para linhas das abas pontos_digitais e servicos sem latitude/longitude.", "Chave = \"rua, número, cidade\" normalizados (mesma regra de js/mapa-camadas.js).") +
    "const PONTOS_GEOCODIFICADOS = " + JSON.stringify(geo, null, 1) + ";\n", relatorio.mudancas);
  if(!SIMULAR) salvarCache(cache);
  const parcial = relatorio.falhas.length > 0;
  escrever(relatorio, { senacRes, senaiRes, biblRes, pontosRes }, semCoordenada, vinculos, unidades, bibl);
  saida("publicar", relatorio.mudancas.length ? "true" : "false"); saida("falhou", "false");
  saida("parcial", parcial ? "true" : "false"); saida("fontes_com_falha", relatorio.falhas.map(f => f.nome).join(", "));
  console.log(`\n${relatorio.mudancas.length ? "Alterados: " + relatorio.mudancas.join(", ") : "Nenhuma mudança."}${SIMULAR ? " (simulação: nada gravado)" : ""}\nRelatório: ${ARQ_RELATORIO}`);
}

function saida(k, v){ if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); }

function escrever(rel, res, semCoord, vinc, unidades, bibl){
  const L = [`# Mapa: unidades e pontos de computador · ${HOJE}${SIMULAR ? " (simulação)" : ""}\n`];
  if(rel.falhas.length){
    L.push(`## ⚠️ ${rel.falhas.length === 1 ? "Uma fonte falhou" : rel.falhas.length + " fontes falharam"}: ${rel.falhas.map(f => f.nome).join(", ")}\n\n${rel.falhas.length === 1 ? "A versão anterior dela continua no ar" : "A versão anterior de cada uma continua no ar"}; o resto foi atualizado.\n`);
    rel.falhas.forEach(f => L.push(`- **${f.nome}**: ${f.motivo}`));
    L.push("");
  }
  L.push(rel.mudancas.length ? `**Arquivos ${SIMULAR ? "que seriam alterados" : "alterados"}:** ${rel.mudancas.map(a => "`dados/" + a + "`").join(", ")}\n` : "**Nenhum arquivo precisou mudar.**\n");
  L.push("| Fonte | Resultado |\n|---|---|");
  L.push(`| Senac-SP | ${res.senacRes} |`, `| Senai-SP | ${res.senaiRes} |`, `| Bibliotecas (SisEB) | ${res.biblRes} |`, `| Abas pontos_digitais e servicos | ${res.pontosRes} |\n`);
  const porCidade = {};
  unidades.forEach(u => { (porCidade[u.cidade] = porCidade[u.cidade] || []).push(`${u.nome}${u.cursos.length ? " (" + u.cursos.length + " cursos)" : ""}`); });
  L.push(`## Unidades no mapa (${unidades.length})\n`);
  Object.keys(porCidade).sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(c => L.push(`- **${c}:** ${porCidade[c].join("; ")}`));
  L.push("");
  if(semCoord.length){
    L.push(`## Endereços que não viraram ponto (${semCoord.length})\n\nO Nominatim não achou, achou em rodovia ou achou longe do município. Para entrar no mapa, a equipe pode informar latitude e longitude (aba pontos_digitais) ou corrigir o endereço.\n`);
    semCoord.slice(0, 80).forEach(x => L.push("- " + x));
    L.push("");
  }
  if(vinc){
    L.push(`## Cursos presenciais da planilha × unidades\n`);
    L.push(`${vinc.total} cursos presenciais abertos na aba "cursos": **${vinc.ok}** se ligam a uma unidade; ${[...vinc.ambiguos.values()].reduce((a, x) => a + x.n, 0)} ficam de fora por **mais de uma unidade na cidade**; ${[...vinc.semUnidade.values()].reduce((a, x) => a + x.n, 0)} por **não haver unidade dessa instituição na cidade na lista**; ${[...vinc.outras.values()].reduce((a, x) => a + x.n, 0)} são de **outras instituições** (CIEE, Nube etc.).\n`);
    const tab = (titulo, mapa, comCand) => {
      if(!mapa.size) return;
      L.push(`### ${titulo}\n`);
      [...mapa.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => L.push(`- ${k}: ${v.n} curso${v.n > 1 ? "s" : ""}${comCand && v.candidatos.length ? " — unidades possíveis: " + v.candidatos.join(" / ") : ""}`));
      L.push("");
    };
    tab("Para a equipe preencher a coluna \"unidade\" da aba cursos (mais de uma unidade na cidade)", vinc.ambiguos, true);
    tab("Instituição da planilha sem unidade na cidade (conferir o município ou o nome da instituição)", vinc.semUnidade, false);
    tab("Instituições sem lista de unidades (precisam de endereço na planilha para virar ponto)", vinc.outras, false);
  }
  rel.notas.forEach(n => L.push("- " + n));
  fs.writeFileSync(ARQ_RELATORIO, L.join("\n") + "\n", "utf8");
}

main().catch(e => {
  console.error("Erro inesperado:", e);
  try{ fs.writeFileSync(ARQ_RELATORIO, "# Mapa: erro inesperado\n\n" + e.message + "\n", "utf8"); }catch(_){}
  saida("publicar", "false"); saida("falhou", "true"); saida("parcial", "false");
  process.exit(1);
});
