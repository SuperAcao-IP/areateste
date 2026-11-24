#!/usr/bin/env node
/* Local aproximado das vagas do Gupy.
   A página de cada vaga do Gupy traz o endereço do local de trabalho (JSON-LD "jobLocation"). Este script lê esse endereço,
   converte em coordenadas (Nominatim/OpenStreetMap, 1 consulta por segundo, mesma lógica dos pontos do mapa) e grava
   dados/vagas-local.json: { atualizado, locais: { "<id da vaga>": {lat, lon, em} }, falhas: { "<id>": "<data>" } }.
   O portal usa esse arquivo para pôr a vaga num pino de verdade; sem ele, a vaga fica no pino do centro do município.
   - só vagas que ainda estão em dados/vagas-robo.json (as fechadas saem do arquivo);
   - cada vaga é consultada uma vez; as que falham são tentadas de novo depois de 30 dias;
   - no máximo LIMITE vagas novas por rodada (padrão 400), o resto fica para a semana seguinte;
   - coordenadas com 2 casas (≈ 1 km), como as do Trampolim: a posição é sempre APROXIMADA, nunca a rua exata.
   Uso: node scripts/geocodificar-vagas.js            (LIMITE=2000 para uma carga inicial grande) */
const fs = require("fs");
const path = require("path");
const { carregarCidades, RAIZ } = require("./lib/cidades");
const { geocodificar } = require("./lib/geocodificar");
const { espera } = require("./lib/util");

const ARQ_VAGAS = path.join(RAIZ, "dados", "vagas-robo.json");
const ARQ_SAIDA = path.join(RAIZ, "dados", "vagas-local.json");
const LIMITE = +process.env.LIMITE || 400;
const REPETIR_FALHA_DIAS = 30;
const UA_PAGINA = "Mozilla/5.0 (compatible; leitor-de-vagas/1.0)";

function lerJson(f, padrao){ try{ return JSON.parse(fs.readFileSync(f, "utf8")); }catch(_){ return padrao; } }
function arred(n){ return +(+n).toFixed(2); }

/* "Rua X, 123, Cidade, São Paulo, Brasil, 07700-135" -> {rua, numero} (ou null se só vier cidade e CEP) */
function separarEndereco(linha, cidade){
  const partes = String(linha || "").split(",").map(s => s.trim()).filter(Boolean);
  if(partes.length < 3) return null;
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if(norm(partes[0]) === norm(cidade || "")) return null;                  // só cidade e CEP
  const rua = partes[0];
  let numero = "";
  for(const p of partes.slice(1, 3)){
    if(/^\d{1,5}$/.test(p)){ numero = p; break; }
    if(/^s\/?n/i.test(p)) break;
  }
  return { rua, numero };
}

async function enderecoDaVaga(link){
  const r = await fetch(link, { headers: { "user-agent": UA_PAGINA }, signal: AbortSignal.timeout(30000) });
  if(!r.ok) return null;
  const html = (await r.text()).replace(/&quot;/g, '"');
  const linha = (html.match(/"streetAddress":"([^"]*)"/) || html.match(/"addressLine":"([^"]*)"/) || [])[1];
  const cidade = (html.match(/"addressLocality":"([^"]*)"/) || html.match(/"addressCity":"([^"]*)"/) || [])[1];
  return linha ? { linha, cidade } : null;
}

(async () => {
  const { centros, norm } = carregarCidades();
  const vagas = (lerJson(ARQ_VAGAS, { vagas: [] }).vagas || []).filter(v => /gupy\.io\//.test(String(v.link || "")));
  const ids = new Set(vagas.map(v => String(v.id)));
  const antes = lerJson(ARQ_SAIDA, {});
  const saida = { atualizado: "", locais: {}, falhas: {} };
  for(const [id, p] of Object.entries(antes.locais || {})) if(ids.has(id)) saida.locais[id] = p;                 // some quem fechou
  const hoje = new Date().toISOString().slice(0, 10);
  for(const [id, em] of Object.entries(antes.falhas || {})){
    if(!ids.has(id)) continue;
    const dias = (Date.now() - new Date(em).getTime()) / 86400000;
    if(dias < REPETIR_FALHA_DIAS) saida.falhas[id] = em;                                                      // falha recente: espera
  }
  const pendentes = vagas.filter(v => !saida.locais[String(v.id)] && !saida.falhas[String(v.id)]).slice(0, LIMITE);
  console.log(`Gupy: ${vagas.length} vagas | já localizadas: ${Object.keys(saida.locais).length} | a consultar agora: ${pendentes.length}`);

  const salvar = () => {
    saida.atualizado = hoje;
    fs.writeFileSync(ARQ_SAIDA, JSON.stringify(saida, null, 1) + "\n", "utf8");
  };
  const cacheMemoria = {};      // não mexe em dados/geocache.json (do robô do mapa)
  let ok = 0, falhou = 0, i = 0;
  for(const v of pendentes){
    i++;
    const id = String(v.id);
    try{
      const e = await enderecoDaVaga(v.link);
      await espera(500);
      const cidade = (e && e.cidade) || v.cidade || v.municipio;
      const sep = e ? separarEndereco(e.linha, cidade) : null;
      if(!sep){ saida.falhas[id] = hoje; falhou++; continue; }
      const centro = centros[norm(v.municipio)] || null;
      const r = await geocodificar({ rua: sep.rua, numero: sep.numero, cidade }, centro, cacheMemoria);
      if(r){ saida.locais[id] = { lat: arred(r.lat), lon: arred(r.lon), em: hoje }; ok++; }
      else { saida.falhas[id] = hoje; falhou++; }
    }catch(err){
      saida.falhas[id] = hoje; falhou++;
    }
    if(i % 25 === 0){ salvar(); console.log(`  ${i}/${pendentes.length} (com ponto: ${ok}, sem: ${falhou})`); }
  }
  salvar();
  console.log(`Feito: ${ok} vagas ganharam ponto, ${falhou} ficam no centro do município. Total com ponto: ${Object.keys(saida.locais).length}.`);
})();
