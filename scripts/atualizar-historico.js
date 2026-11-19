#!/usr/bin/env node
/* Histórico de TODOS os cursos que já passaram pelo portal (aba "Histórico de cursos" do painel).

   Toda semana (GitHub Actions, segunda) monta o retrato do que o portal mostra, com as MESMAS funções do site
   (js/conectores.js, js/config.js, filtros de público), igual ao "Catálogo completo" do painel:
     - catálogos online fixos (Aprenda Mais, EVG, Bradesco, +IFMG, Mundi), já com o filtro de público;
     - Sebrae SP (online);
     - Trampolim SP em cada município do programa (e o catálogo do estado), com o filtro de perfil do Trampolim;
     - planilha da equipe (aba "cursos") e dados.json;
     - cursos presenciais das unidades do Senai e do Senac (dados/unidades.js).
   Cada curso vira UM registro (origem + título + online/presencial), com os municípios onde aparece, a primeira
   e a última semana em que esteve no portal e em quantas semanas apareceu. Grava dados/historico-cursos.json
   (só o painel lê esse arquivo; o portal não).

   Uso:
     node scripts/atualizar-historico.js [--simular] [--relatorio arq.md]          retrato desta semana
     node scripts/atualizar-historico.js --importar <pasta> [--simular]            importa CSVs do "Catálogo completo"
                                                                                  (primeira linha "Pesquisa realizada em DD/MM/AAAA")
   Os CSVs semanais antigos ficam em scripts/fontes/historico-importado/. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const ARQ = path.join(RAIZ, "dados", "historico-cursos.json");
const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const iImp = args.indexOf("--importar");
const PASTA_IMPORTAR = iImp >= 0 ? path.resolve(args[iImp + 1] || "") : "";
const iRel = args.indexOf("--relatorio");
const ARQ_RELATORIO = iRel >= 0 ? path.resolve(args[iRel + 1]) : "";
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // data de Brasília

/* ---------- chave e registro ---------- */
const semAcento = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/* mesmo critério do painel (classeModalidade): presencial ou híbrido = presencial; o resto = online */
const classe = mod => { const m = semAcento(mod); return (m.includes("presencial") || m.includes("hibrid")) ? "presencial" : "online"; };
const titulo = t => semAcento(t).replace(/\s+-\s+turmas?\s+\d{4}[ab]\s*$/i, "");
const chave = r => [semAcento(r.fonte), titulo(r.curso), classe(r.modalidade)].join("|");
function cargaH(c){ const m = String(c || "").match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; }

function lerHistorico(){
  if(!fs.existsSync(ARQ)) return { atualizado: "", semanas: [], cursos: [] };
  return JSON.parse(fs.readFileSync(ARQ, "utf8"));
}

/* Junta as linhas de UMA semana (data) ao histórico. Linha = {municipio, curso, inst, modalidade, carga, area, fonte, link}. */
function acrescentarSemana(hist, data, linhas){
  const porChave = new Map(hist.cursos.map(c => [c.k, c]));
  const vistosNaSemana = new Set();
  let novos = 0;
  for(const l of linhas){
    if(!l.curso || !l.fonte) continue;
    const k = chave(l);
    let c = porChave.get(k);
    if(!c){
      c = { k, curso: l.curso.trim(), inst: (l.inst || "").trim(), fonte: l.fonte, modalidade: l.modalidade || "", classe: classe(l.modalidade),
            carga: l.carga || "", carga_h: cargaH(l.carga), area: l.area || "Outros", municipios: [], link: l.link || "",
            primeira: data, ultima: data, semanas: 0 };
      porChave.set(k, c); hist.cursos.push(c);
      novos++;
    }
    if(data < c.primeira) c.primeira = data;
    if(data >= c.ultima){            // o retrato mais recente atualiza os dados do curso
      c.ultima = data;
      if(l.link) c.link = l.link;
      if(l.carga){ c.carga = l.carga; c.carga_h = cargaH(l.carga); }
      if(l.inst) c.inst = l.inst.trim();
      if(l.area) c.area = l.area;
      if(l.modalidade) c.modalidade = l.modalidade;
    }
    const mun = (l.municipio || "").trim() || "Online";
    if(!c.municipios.includes(mun)) c.municipios.push(mun);
    if(!vistosNaSemana.has(k)){ vistosNaSemana.add(k); c._semana = (c._semana || new Set()); c._semana.add(data); }
  }
  for(const c of hist.cursos) if(c._semana){ c._datas = new Set([...(c._datas || []), ...c._semana]); delete c._semana; }
  if(!hist.semanas.includes(data)) hist.semanas.push(data);
  hist.semanas.sort();
  return novos;
}

function gravar(hist){
  hist.atualizado = hist.semanas[hist.semanas.length - 1] || HOJE;
  for(const c of hist.cursos){
    if(c._datas){ c.semanas = Math.max(c.semanas || 0, 0) + c._datas.size; delete c._datas; }
    c.municipios.sort((a, b) => (a === "Online" ? -1 : b === "Online" ? 1 : a.localeCompare(b, "pt-BR")));
  }
  hist.cursos.sort((a, b) => a.fonte.localeCompare(b.fonte, "pt-BR") || a.curso.localeCompare(b.curso, "pt-BR"));
  // uma linha por curso: o arquivo fica legível e o diff semanal mostra só o que mudou
  const texto = "{\n" +
    ` "atualizado": ${JSON.stringify(hist.atualizado)},\n` +
    ` "explicacao": "Histórico dos cursos que passaram pelo portal. Gerado por scripts/atualizar-historico.js: não edite à mão. primeira/ultima = semanas em que o curso apareceu; semanas = em quantos retratos semanais ele estava.",\n` +
    ` "semanas": ${JSON.stringify(hist.semanas)},\n` +
    ` "cursos": [\n` + hist.cursos.map(c => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n";
  if(!SIMULAR) fs.writeFileSync(ARQ, texto, "utf8");
  return texto.length;
}

/* ---------- importação dos CSVs do "Catálogo completo" ---------- */
function lerCsvPontoEVirgula(texto){
  const linhas = []; let campo = "", linha = [], aspas = false;
  for(let i = 0; i < texto.length; i++){
    const ch = texto[i];
    if(aspas){ if(ch === '"' && texto[i + 1] === '"'){ campo += '"'; i++; } else if(ch === '"') aspas = false; else campo += ch; }
    else if(ch === '"') aspas = true;
    else if(ch === ";"){ linha.push(campo); campo = ""; }
    else if(ch === "\n" || ch === "\r"){ if(ch === "\r" && texto[i + 1] === "\n") i++; linha.push(campo); campo = ""; linhas.push(linha); linha = []; }
    else campo += ch;
  }
  if(campo || linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas;
}
function importar(pasta){
  const arquivos = fs.readdirSync(pasta).filter(f => /\.csv$/i.test(f)).sort();
  if(!arquivos.length) throw new Error("nenhum .csv em " + pasta);
  const porData = new Map();
  for(const f of arquivos){
    const texto = fs.readFileSync(path.join(pasta, f), "utf8").replace(/^﻿/, "");
    const linhas = lerCsvPontoEVirgula(texto);
    const m = (linhas[0] || []).join(" ").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if(!m){ console.warn(`  ${f}: sem "Pesquisa realizada em DD/MM/AAAA" na primeira linha; pulado`); continue; }
    const data = `${m[3]}-${m[2]}-${m[1]}`;
    const iCab = linhas.findIndex(l => semAcento(l[0]) === "municipio" && semAcento(l[1]) === "curso");
    if(iCab < 0){ console.warn(`  ${f}: cabeçalho Municipio;Curso;... não encontrado; pulado`); continue; }
    const cab = linhas[iCab].map(semAcento);
    const col = n => cab.indexOf(n);
    const rows = linhas.slice(iCab + 1).filter(l => l.length >= 2 && l[1]).map(l => ({
      municipio: l[col("municipio")], curso: l[col("curso")], inst: l[col("instituicao")], modalidade: l[col("modalidade")],
      carga: l[col("carga")], area: l[col("area")], fonte: l[col("origem")], link: l[col("link")] }));
    if(porData.has(data)) console.warn(`  ${f}: data ${data} repetida; as linhas se somam`);
    porData.set(data, (porData.get(data) || []).concat(rows));
    console.log(`  ${f}: ${data}, ${rows.length} linhas`);
  }
  const hist = lerHistorico();
  for(const [data, rows] of [...porData.entries()].sort()){
    const novos = acrescentarSemana(hist, data, rows);
    console.log(`  ${data}: ${novos} cursos novos no histórico`);
  }
  const tam = gravar(hist);
  console.log(`Histórico: ${hist.cursos.length} cursos em ${hist.semanas.length} semanas (${Math.round(tam / 1024)} KB)${SIMULAR ? " · simulação, nada gravado" : ""}`);
}

/* ---------- retrato desta semana, com as funções do portal ---------- */
function carregarPortal(){
  const avisos = [];
  const ctx = {
    console: { log(){}, warn: (...a) => avisos.push(a.join(" ")), error: (...a) => avisos.push(a.join(" ")) },
    fetch, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout, Promise, TextDecoder,
    location: { search: "" },
    document: { getElementById(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){} },
    window: {}
  };
  vm.createContext(ctx);
  const arquivos = ["dados/municipios.js", "dados/cursos-evg.js", "dados/cursos-bradesco.js", "dados/cursos-aprenda-mais.js",
    "dados/cursos-ifmg.js", "dados/cursos-mundi.js", "dados/filtro-publico.js", "dados/unidades.js",
    "js/areas.js", "js/config.js", "scripts/lib/regras.js", "dados/trampolim-decisoes.js", "js/conectores.js"];
  const codigo = arquivos.map(f => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("\n;\n");
  vm.runInContext(codigo + `
    globalThis.__p = {
      municipios: Object.keys(CENTROS_MUNICIPIOS).sort((a,b)=>a.localeCompare(b,"pt-BR")),
      catalogos: [[catalogoPermitido(EVG,"evg"),"Escola Virtual de Governo"], [catalogoPermitido(EV,"bradesco"),"Fundação Bradesco"],
                  [catalogoPermitido(APRENDA_MAIS,"aprendaMais"),"Aprenda Mais · MEC"], [catalogoPermitido(IFMG,"ifmg"),"+IFMG"],
                  [catalogoPermitido(MUNDI,"mundi"),"Mundi · IFSul"]],
      unidades: (typeof UNIDADES !== "undefined" ? UNIDADES : []),
      buscarCursosSebrae, buscarCursosPlanilha, buscarCursosTrampolim, cursoAtingeCargaMinima, trampolimPermitido, decisaoTrampolim,
      areaDoCurso, classificar, todasAreas, normTxt,
      SEBRAE_ATIVO, PLANILHA_ATIVA, TRAMPOLIM_ATIVO
    };`, ctx, { filename: "portal" });
  return { p: ctx.__p, avisos };
}

async function retrato(){
  const { p, avisos } = carregarPortal();
  const nomeArea = id => (p.todasAreas().find(a => a.id === id) || {}).nome || "Outros";
  const linhas = [], fontes = {}, falhas = [];
  const add = (fonte, o) => { linhas.push(Object.assign({ fonte }, o)); fontes[fonte] = (fontes[fonte] || 0) + 1; };

  for(const [lista, nome] of p.catalogos){
    (lista || []).forEach(c => { if(p.cursoAtingeCargaMinima(c.carga)) add(nome, { municipio: "Online", curso: c.titulo, inst: c.inst || nome, modalidade: "Online", carga: c.carga || "", area: nomeArea(p.areaDoCurso(c.titulo, c.area)), link: c.link || "" }); });
  }
  if(p.SEBRAE_ATIVO){
    try{ (await p.buscarCursosSebrae()).forEach(c => add("Sebrae SP", { municipio: "Online", curso: c.nome, inst: c.inst || "Sebrae SP", modalidade: c.modalidade || "Online", carga: c.carga || "", area: nomeArea(p.classificar(c.nome)), link: c.link || "" })); }
    catch(e){ falhas.push("Sebrae SP: " + e.message); }
  }
  if(p.PLANILHA_ATIVA){
    try{
      (await p.buscarCursosPlanilha()).forEach(c => {
        const mun = p.normTxt(c._municipio); const online = !mun || mun.startsWith("online") || mun.startsWith("todos");
        add("Cadastro do programa", { municipio: online ? "Online" : c._municipio, curso: c.nome, inst: c.inst || "", modalidade: c.modalidade || "", carga: c.carga || "", area: nomeArea(c._area ? p.classificar(c._area) : p.classificar(c.nome)), link: c.link || "" });
      });
    }catch(e){ falhas.push("Planilha: " + e.message); }
  }
  try{
    const dj = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados.json"), "utf8"));
    (dj.cursos || []).forEach(c => add("Cadastro do programa", { municipio: c.municipio || "Online", curso: c.curso, inst: c.instituicao || "", modalidade: c.modalidade || "", carga: c.carga || "", area: c.area || nomeArea(p.classificar(c.curso)), link: c.link || "" }));
  }catch(_){ /* sem dados.json */ }
  for(const u of p.unidades){
    (u.cursos || []).forEach(c => add(u.inst, { municipio: u.cidade, curso: c.n, inst: u.nome, modalidade: "Presencial", carga: c.ch ? c.ch + "h" : "", area: nomeArea(p.areaDoCurso(c.n)), link: c.l || u.link || "" }));
  }

  /* Trampolim: catálogo do estado + cada município, com o filtro de perfil do portal (e o relatório do filtro) */
  const tramp = { vistos: new Map(), falhas: 0 };
  if(p.TRAMPOLIM_ATIVO){
    for(const cidade of [""].concat(p.municipios)){
      let cursos;
      try{ cursos = await p.buscarCursosTrampolim(cidade); }
      catch(e){ tramp.falhas++; if(cidade) falhas.push(`Trampolim (${cidade}): ${e.message}`); continue; }
      for(const c of cursos){
        if(!tramp.vistos.has(c.nome)) tramp.vistos.set(c.nome, p.decisaoTrampolim(c.nome));
        if(!cidade) continue;   // o catálogo do estado só entra no relatório; as cidades já trazem os cursos online
        if(!p.cursoAtingeCargaMinima(c.carga) || !p.trampolimPermitido(c)) continue;
        add("Trampolim SP", { municipio: cidade, curso: c.nome, inst: c.inst || "Trampolim SP", modalidade: c.modalidade || "", carga: c.carga || "", area: nomeArea(p.areaDoCurso(c.nome, ...(c._rotulos || []))), link: c.link || "" });
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  return { linhas, fontes, falhas, avisos, tramp };
}

function relatorio(res, novosCursos, sairam, hist){
  const L = [`# Histórico de cursos · ${HOJE}`, ""];
  L.push(`**${novosCursos.length} cursos novos no portal esta semana** · ${sairam.length} saíram · ${hist.cursos.length} cursos no histórico (${hist.semanas.length} semanas)`, "");
  L.push("| Origem | Linhas no retrato |", "|---|---|");
  Object.entries(res.fontes).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => L.push(`| ${f} | ${n} |`));
  L.push("");
  const t = [...res.tramp.vistos.entries()];
  if(t.length){
    const ok = t.filter(([, d]) => d.d === "manter"), fora = t.filter(([, d]) => d.d !== "manter");
    L.push(`## Filtro de perfil do Trampolim`, "", `${t.length} títulos diferentes no Trampolim (estado + municípios): **${ok.length} aparecem**, ${fora.length} ficam de fora.`,
      "Para mudar, edite `dados/trampolim-decisoes.js` (manter / ocultar por título).", "");
    if(fora.length) L.push("<details><summary>Ficam de fora</summary>", "", ...fora.map(([n, d]) => `- ${n} · ${d.m}`), "", "</details>", "");
  }
  if(novosCursos.length){
    L.push("## Entraram esta semana", "");
    novosCursos.slice(0, 120).forEach(c => L.push(`- ${c.curso} · ${c.fonte} · ${c.classe === "online" ? "online" : c.municipios.slice(0, 4).join(", ")}${c.carga ? " · " + c.carga : ""}`));
    if(novosCursos.length > 120) L.push(`- … e mais ${novosCursos.length - 120} (veja a aba Histórico de cursos do painel)`);
    L.push("");
  }
  if(res.falhas.length){ L.push("## Avisos", "", ...res.falhas.slice(0, 30).map(f => "- " + f), ""); }
  return L.join("\n") + "\n";
}

async function main(){
  if(PASTA_IMPORTAR){ console.log("Importando " + PASTA_IMPORTAR); importar(PASTA_IMPORTAR); return; }
  console.log("Montando o retrato desta semana com as funções do portal…");
  const res = await retrato();
  const total = res.linhas.length;
  console.log(`  ${total} linhas · ${Object.entries(res.fontes).map(([f, n]) => f + " " + n).join(" · ")}`);
  if(total < 50) throw new Error(`o retrato veio com só ${total} linhas: provável falha das fontes; o histórico não foi alterado`);
  const hist = lerHistorico();
  const antes = new Set(hist.cursos.map(c => c.k));
  const ultimaAnterior = hist.semanas[hist.semanas.length - 1] || "";
  if(hist.semanas.includes(HOJE)){   // rodou de novo no mesmo dia: o retrato de hoje é refeito, sem contar a semana duas vezes
    hist.cursos.forEach(c => { if(c.ultima === HOJE) c.semanas = Math.max(0, (c.semanas || 0) - 1); });
    hist.semanas = hist.semanas.filter(s => s !== HOJE);
  }
  acrescentarSemana(hist, HOJE, res.linhas);
  const novos = hist.cursos.filter(c => !antes.has(c.k));
  const sairam = ultimaAnterior ? hist.cursos.filter(c => c.ultima === ultimaAnterior && ultimaAnterior !== HOJE) : [];
  const tam = gravar(hist);
  console.log(`Histórico: ${hist.cursos.length} cursos, ${novos.length} novos, ${sairam.length} saíram (${Math.round(tam / 1024)} KB)${SIMULAR ? " · simulação, nada gravado" : ""}`);
  const rel = relatorio(res, novos, sairam, hist);
  if(ARQ_RELATORIO) fs.writeFileSync(ARQ_RELATORIO, rel, "utf8");
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `novos=${novos.length}\nsairam=${sairam.length}\ntotal=${hist.cursos.length}\n`);
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
