/* Endereço -> coordenadas, sem custo, com cache em arquivo.
   Usa o Nominatim (OpenStreetMap), respeitando a política de uso: no máximo 1 consulta por
   segundo, User-Agent identificado e cache (cada endereço é consultado uma vez; os que falham
   só são tentados de novo depois de 30 dias). O navegador NUNCA chama o Nominatim: lê só
   o arquivo gerado.
   Teste com 12 endereços reais: rua + número acertou 12/12 (erro mediano ~340 m). Piora em
   rodovia/km e com CEP sozinho, por isso rodovias são recusadas e todo resultado precisa cair
   perto do município. Coordenadas derivadas do OSM: atribuição "© OpenStreetMap contributors". */
const fs = require("fs");
const path = require("path");
const { km, RAIZ } = require("./cidades");
const { normalizarTitulo, espera } = require("./util");

const CACHE = path.join(RAIZ, "dados", "geocache.json");
const UA = "SuperAcaoSP-mapa/1.0 (https://github.com/SuperAcao-IP/areateste)";
const RAIO_MAX_KM = 12;          // resultado a mais que isso do centro do município = recusado
const REPETIR_FALHA_DIAS = 30;
const VERSAO = 2;                // sobe quando a estratégia de busca melhora: falhas antigas são tentadas de novo
let ultimaConsulta = 0;

function carregarCache(){
  try{ return JSON.parse(fs.readFileSync(CACHE, "utf8")); }catch(_){ return {}; }
}
function salvarCache(c){
  const ordenado = Object.fromEntries(Object.entries(c).sort((a, b) => a[0].localeCompare(b[0])));
  fs.writeFileSync(CACHE, JSON.stringify(ordenado, null, 1) + "\n", "utf8");
}

/* Endereços de cadastro vêm sujos: "R. DAS PRIMEVERAS", "Rua X, , 70", número "0" ou "s/nº",
   "Praça, R. Dr. Fulano". Limpa antes de consultar; a chave do cache usa o texto ORIGINAL. */
function limparEndereco({ rua, numero }){
  let r = String(rua || "").replace(/\s+/g, " ").trim();
  r = r.replace(/\bs\/n(?:[º°]|o\b)?\.?/gi, "").replace(/\bsem n[úu]mero\b/gi, "")
       .replace(/,\s*,/g, ",").replace(/[,\s]+$/g, "").trim();
  r = r.replace(/^(Pra[çc]a|Pç\.?|Pça\.?),\s*/i, "");                       // "Praça, R. Dr. Fulano" -> "R. Dr. Fulano"
  r = r.replace(/^R\.\s*/i, "Rua ").replace(/^Av\.?\s+/i, "Avenida ").replace(/^Al\.\s*/i, "Alameda ")
       .replace(/^(Pç|Pça|Pca)\.?\s+/i, "Praça ").replace(/^Estr\.\s*/i, "Estrada ").replace(/^Rod\.\s*/i, "Rodovia ")
       .replace(/\bN\.\s?Sra\.?\s*/gi, "Nossa Senhora ").replace(/\bDr\.\s*/gi, "Doutor ").replace(/\bProf\.\s*/gi, "Professor ").replace(/\bProfª\.?\s*/gi, "Professora ")
       .replace(/\bMal\.\s*/gi, "Marechal ").replace(/\bCel\.\s*/gi, "Coronel ").replace(/\bS\.\s+/g, "São ").replace(/\.$/, "");
  let n = String(numero || "").replace(/\D/g, "").replace(/^0+$/, "");
  const doTexto = r.match(/^(.*?),\s*(\d{1,5})$/);                          // "Rua X, 70" já embutido na rua
  if(!n && doTexto){ r = doTexto[1].trim(); n = doTexto[2]; }
  return { rua: r.trim(), numero: n };
}

/* texto para exibir ("R. DAS PRIMEVERAS, 450" -> "R. das Primeveras, 450"; número 0/vazio some) */
function enderecoParaExibir(rua, numero){
  const bonito = t => {
    const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if(!letras || letras !== letras.toUpperCase()) return t;               // já está em caixa mista: não mexe
    return t.toLowerCase().replace(/(^|[\s.(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
            .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, x => x.toLowerCase());
  };
  const n = String(numero || "").replace(/\D/g, "").replace(/^0+$/, "");
  const r = String(rua || "").replace(/\s+/g, " ").replace(/,\s*,/g, ",").replace(/[,\s]+$/g, "").replace(/\bs\/n(?:[º°]|o\b)?\.?/gi, "").trim();
  return bonito(r) + (n ? ", " + n : "");
}

/* chave estável do endereço (rua, número, cidade) */
function chave({ rua, numero, cidade }){
  const n = String(numero || "").replace(/\D/g, "");
  return normalizarTitulo([rua, n, cidade].filter(Boolean).join(", "));
}

async function nominatim(params){
  const espereMs = 1100 - (Date.now() - ultimaConsulta);
  if(espereMs > 0) await espera(espereMs);
  ultimaConsulta = Date.now();
  const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "br", addressdetails: "0", ...params });
  for(let i = 1; i <= 3; i++){
    try{
      const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "pt-BR" }, signal: AbortSignal.timeout(30000) });
      if(r.status === 429 || r.status >= 500){ await espera(5000 * i); ultimaConsulta = Date.now(); continue; }
      if(!r.ok) return null;
      const j = await r.json();
      return j[0] || null;
    }catch(_){ await espera(3000 * i); ultimaConsulta = Date.now(); }
  }
  return null;
}

/* item: {rua, numero, bairro, cidade, cep}; centro: {lat, lon} do município.
   Devolve {lat, lon, confianca:"alta"|"media"} ou null. Usa e atualiza o cache. */
async function geocodificar(item, centro, cache){
  const k = chave(item);
  if(!k) return null;
  const guardado = cache[k];
  if(guardado){
    if(!guardado.falhou) return guardado;
    const dias = (Date.now() - new Date(guardado.em).getTime()) / 86400000;
    if(dias < REPETIR_FALHA_DIAS && (guardado.v || 1) >= VERSAO) return null;
  }
  const agora = new Date().toISOString().slice(0, 10);
  const limpo = limparEndereco(item);
  const tentativas = [];
  if(limpo.rua && limpo.numero) tentativas.push({ params: { street: limpo.numero + " " + limpo.rua, city: item.cidade, state: "São Paulo", country: "Brasil" }, confianca: "alta" });
  if(limpo.rua) tentativas.push({ params: { street: limpo.rua, city: item.cidade, state: "São Paulo", country: "Brasil" }, confianca: "media" });
  if(item.nome) tentativas.push({ params: { q: item.nome + ", " + item.cidade + ", São Paulo, Brasil" }, confianca: "media" });   // pelo nome do lugar
  for(const t of tentativas){
    const achou = await nominatim(t.params);
    if(!achou) continue;
    const ponto = { lat: +(+achou.lat).toFixed(6), lon: +(+achou.lon).toFixed(6) };
    const rodovia = /^(motorway|trunk)/.test(achou.type || "") || /rodovia|km\s*\d/i.test(item.rua || "");
    if(rodovia) continue;
    if(centro && km(ponto, centro) > RAIO_MAX_KM) continue;
    const r = { ...ponto, confianca: t.confianca, fonte: "nominatim", em: agora };
    cache[k] = r;
    return r;
  }
  cache[k] = { falhou: true, em: agora, v: VERSAO };
  return null;
}

module.exports = { carregarCache, salvarCache, geocodificar, chave, limparEndereco, enderecoParaExibir };
