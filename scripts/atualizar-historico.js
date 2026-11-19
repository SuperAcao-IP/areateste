#!/usr/bin/env node
/* Histórico de TUDO o que passou pelo portal: cursos e vagas. Alimenta as abas "Histórico", "Vazios do catálogo" e
   "Visão geral" do painel.

   Toda semana (GitHub Actions, segunda) monta o retrato do que o portal mostra, com as MESMAS funções do site
   (js/conectores.js, js/config.js, filtros de público), igual ao "Catálogo completo" do painel:
     CURSOS
     - catálogos online fixos (Aprenda Mais, EVG, Bradesco, +IFMG, Mundi), já com o filtro de público;
     - Sebrae SP (online); planilha da equipe (aba "cursos") e dados.json;
     - Trampolim SP em cada município do programa, com o filtro de perfil do Trampolim;
     - cursos presenciais das unidades do Senai e do Senac (dados/unidades.js).
     VAGAS
     - Trampolim SP em cada município (mesmo raio do portal); planilha (aba "vagas"); robô de vagas (todas as ativas).
   Cada curso/vaga é UM registro, com os municípios onde aparece e as semanas exatas em que esteve no portal ("p":
   índices em "semanas"). Grava:
     dados/historico-cursos.json   dados/historico-vagas.json   dados/cobertura.json (cursos presenciais por município × área)
   Só o painel lê esses arquivos; o portal não.

   Uso:
     node scripts/atualizar-historico.js [--simular] [--relatorio arq.md] [--sem-vagas]   retrato desta semana
     node scripts/atualizar-historico.js --importar <pasta> [--simular]                    importa CSVs do "Catálogo completo"
                                                                                          (primeira linha "Pesquisa realizada em DD/MM/AAAA")
   Os CSVs semanais antigos ficam em scripts/fontes/historico-importado/. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const ARQ_CURSOS = path.join(RAIZ, "dados", "historico-cursos.json");
const ARQ_VAGAS = path.join(RAIZ, "dados", "historico-vagas.json");
const ARQ_COBERTURA = path.join(RAIZ, "dados", "cobertura.json");
const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const SEM_VAGAS = args.includes("--sem-vagas");
const iImp = args.indexOf("--importar");
const PASTA_IMPORTAR = iImp >= 0 ? path.resolve(args[iImp + 1] || "") : "";
const iRel = args.indexOf("--relatorio");
const ARQ_RELATORIO = iRel >= 0 ? path.resolve(args[iRel + 1]) : "";
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);   // data de Brasília
const DIAS_GUARDAR_VAGA = 365;   // vaga que saiu do portal há mais que isso sai do histórico (o arquivo não cresce sem fim)

/* ---------- utilidades ---------- */
const semAcento = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/* mesmo critério do painel (classeModalidade): presencial ou híbrido = presencial; o resto = online */
const classe = mod => { const m = semAcento(mod); return (m.includes("presencial") || m.includes("hibrid")) ? "presencial" : "online"; };
const titulo = t => semAcento(t).replace(/\s+-\s+turmas?\s+\d{4}[ab]\s*$/i, "");
const chaveCurso = r => [semAcento(r.fonte), titulo(r.curso), classe(r.modalidade)].join("|");
const chaveVaga = r => [semAcento(r.fonte), r.id != null && r.id !== "" ? String(r.id) : semAcento([r.cargo, r.empresa, (r.link || "").split("?")[0]].join("|"))].join("|");
function cargaH(c){ const m = String(c || "").match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; }
const kb = n => Math.round(n / 1024) + " KB";

/* ---------- arquivo de histórico (genérico: cursos ou vagas) ----------
   No arquivo, "p" são índices em "semanas"; em memória viram um Set de datas (_d), para semanas novas ou importadas fora
   de ordem não bagunçarem os índices. primeira, ultima e semanas saem sempre de _d. */
function lerHistorico(arq, campo){
  if(!fs.existsSync(arq)) return { atualizado: "", semanas: [], itens: [] };
  const j = JSON.parse(fs.readFileSync(arq, "utf8"));
  const itens = j[campo] || [];
  for(const c of itens){
    if(Array.isArray(c.p)) c._d = new Set(c.p.map(i => j.semanas[i]).filter(Boolean));
    else c._d = new Set(j.semanas.filter(s => s >= c.primeira && s <= c.ultima));   // arquivo antigo, sem "p": estima pelo intervalo
    delete c.p;
  }
  return { atualizado: j.atualizado || "", semanas: j.semanas || [], itens };
}
function gravarHistorico(arq, hist, campo, explicacao, ordenar){
  hist.semanas = [...new Set(hist.semanas)].sort();
  hist.atualizado = hist.semanas[hist.semanas.length - 1] || HOJE;
  const idx = new Map(hist.semanas.map((s, i) => [s, i]));
  const saida = hist.itens.filter(c => c._d && c._d.size).map(c => {
    const datas = [...c._d].sort();
    const o = Object.assign({}, c, { primeira: datas[0], ultima: datas[datas.length - 1], semanas: datas.length, p: datas.map(d => idx.get(d)) });
    delete o._d;
    if(Array.isArray(o.municipios)) o.municipios.sort((a, b) => (a === "Online" ? -1 : b === "Online" ? 1 : a.localeCompare(b, "pt-BR")));
    return o;
  }).sort(ordenar);
  // uma linha por item: o arquivo fica legível e o diff semanal mostra só o que mudou
  const texto = "{\n" +
    ` "atualizado": ${JSON.stringify(hist.atualizado)},\n` +
    ` "explicacao": ${JSON.stringify(explicacao)},\n` +
    ` "semanas": ${JSON.stringify(hist.semanas)},\n` +
    ` "${campo}": [\n` + saida.map(c => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n";
  if(!SIMULAR) fs.writeFileSync(arq, texto, "utf8");
  return { tamanho: texto.length, itens: saida };
}
/* tira a data de todas as presenças (retrato refeito no mesmo dia) */
function desmarcarSemana(hist, data){ hist.itens.forEach(c => c._d && c._d.delete(data)); hist.semanas = hist.semanas.filter(s => s !== data); }

/* Junta os registros de UMA semana ao histórico. montar(l) cria o item novo; atualizar(item, l) refresca os dados
   (só quando esta semana é a mais recente do item). Devolve os itens novos. */
function acrescentar(hist, data, linhas, chave, montar, atualizar){
  const porChave = new Map(hist.itens.map(c => [c.k, c]));
  const novos = [];
  for(const l of linhas){
    const k = chave(l);
    if(!k) continue;
    let c = porChave.get(k);
    if(!c){ c = Object.assign({ k }, montar(l), { municipios: [], _d: new Set() }); porChave.set(k, c); hist.itens.push(c); novos.push(c); }
    const maisRecente = !c._d.size || data >= [...c._d].sort().pop();
    if(maisRecente) atualizar(c, l);
    c._d.add(data);
    const mun = (l.municipio || "").trim() || "Online";
    if(!c.municipios.includes(mun)) c.municipios.push(mun);
  }
  if(!hist.semanas.includes(data)) hist.semanas.push(data);
  return novos;
}

/* ---------- cursos ---------- */
const montarCurso = l => ({ curso: l.curso.trim(), inst: (l.inst || "").trim(), fonte: l.fonte, modalidade: l.modalidade || "", classe: classe(l.modalidade),
                            carga: l.carga || "", carga_h: cargaH(l.carga), area: l.area || "Outros", link: l.link || "" });
function atualizarCurso(c, l){
  if(l.link) c.link = l.link;
  if(l.carga){ c.carga = l.carga; c.carga_h = cargaH(l.carga); }
  if(l.inst) c.inst = l.inst.trim();
  if(l.area) c.area = l.area;
  if(l.modalidade) c.modalidade = l.modalidade;
}
const acrescentarCursos = (hist, data, linhas) => acrescentar(hist, data, linhas.filter(l => l.curso && l.fonte), chaveCurso, montarCurso, atualizarCurso);
const ordemCursos = (a, b) => a.fonte.localeCompare(b.fonte, "pt-BR") || a.curso.localeCompare(b.curso, "pt-BR");
const EXPL_CURSOS = "Histórico dos cursos que passaram pelo portal. Gerado por scripts/atualizar-historico.js: não edite à mão. p = índices em semanas dos retratos em que o curso estava; primeira/ultima/semanas saem de p.";

/* ---------- vagas ---------- */
const montarVaga = l => ({ cargo: (l.cargo || "").trim(), empresa: (l.empresa || "").trim(), fonte: l.fonte, cidade: l.cidade || "", tipo: l.tipo || "",
                           experiencia: l.experiencia || "", escolaridade: l.escolaridade || "", area: l.area || "Outros", link: l.link || "" });
function atualizarVaga(c, l){
  ["cargo", "empresa", "cidade", "tipo", "experiencia", "escolaridade", "area", "link"].forEach(f => { if(l[f]) c[f] = String(l[f]).trim(); });
}
const acrescentarVagas = (hist, data, linhas) => acrescentar(hist, data, linhas.filter(l => l.cargo && l.fonte), chaveVaga, montarVaga, atualizarVaga);
const ordemVagas = (a, b) => (b.ultima || "").localeCompare(a.ultima || "") || a.fonte.localeCompare(b.fonte, "pt-BR") || a.cargo.localeCompare(b.cargo, "pt-BR");
const EXPL_VAGAS = "Histórico das vagas que passaram pelo portal (Trampolim SP, planilha da equipe e robô de vagas). Gerado por scripts/atualizar-historico.js: não edite à mão. p = índices em semanas dos retratos em que a vaga estava. Vaga que saiu há mais de 12 meses é removida.";

/* ---------- importação dos CSVs do "Catálogo completo" (só cursos) ---------- */
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
      // nas planilhas antigas o curso online do Trampolim vinha repetido em cada município: vira "Online"
      municipio: classe(l[col("modalidade")]) === "online" ? "Online" : l[col("municipio")],
      curso: l[col("curso")], inst: l[col("instituicao")], modalidade: l[col("modalidade")],
      carga: l[col("carga")], area: l[col("area")], fonte: l[col("origem")], link: l[col("link")] }));
    if(porData.has(data)) console.warn(`  ${f}: data ${data} repetida; as linhas se somam`);
    porData.set(data, (porData.get(data) || []).concat(rows));
    console.log(`  ${f}: ${data}, ${rows.length} linhas`);
  }
  const hist = lerHistorico(ARQ_CURSOS, "cursos");
  for(const [data, rows] of [...porData.entries()].sort()){
    desmarcarSemana(hist, data);   // reimportar a mesma semana não duplica
    console.log(`  ${data}: ${acrescentarCursos(hist, data, rows).length} cursos novos no histórico`);
  }
  const g = gravarHistorico(ARQ_CURSOS, hist, "cursos", EXPL_CURSOS, ordemCursos);
  console.log(`Histórico: ${g.itens.length} cursos em ${hist.semanas.length} semanas (${kb(g.tamanho)})${SIMULAR ? " · simulação, nada gravado" : ""}`);
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
      vizinhas: CIDADES_VIZINHAS,
      catalogos: [[catalogoPermitido(EVG,"evg"),"Escola Virtual de Governo"], [catalogoPermitido(EV,"bradesco"),"Fundação Bradesco"],
                  [catalogoPermitido(APRENDA_MAIS,"aprendaMais"),"Aprenda Mais · MEC"], [catalogoPermitido(IFMG,"ifmg"),"+IFMG"],
                  [catalogoPermitido(MUNDI,"mundi"),"Mundi · IFSul"]],
      unidades: (typeof UNIDADES !== "undefined" ? UNIDADES : []),
      buscarCursosSebrae, buscarCursosPlanilha, buscarCursosTrampolim, cursoAtingeCargaMinima, trampolimPermitido, decisaoTrampolim,
      buscarVagasTrampolim, buscarVagasPlanilha, statusFechado,
      areaDoCurso, classificar, todasAreas, normTxt,
      SEBRAE_ATIVO, PLANILHA_ATIVA, PLANILHA_VAGAS_ATIVA, TRAMPOLIM_ATIVO, TRAMPOLIM_VAGAS_ATIVO, VAGAS_ROBO_ATIVO
    };`, ctx, { filename: "portal" });
  return { p: ctx.__p, avisos };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

async function retratoCursos(p, nomeArea, falhas){
  const linhas = [], fontes = {};
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
    }catch(e){ falhas.push("Planilha (cursos): " + e.message); }
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
      catch(e){ tramp.falhas++; if(cidade) falhas.push(`Trampolim cursos (${cidade}): ${e.message}`); continue; }
      for(const c of cursos){
        if(!tramp.vistos.has(c.nome)) tramp.vistos.set(c.nome, p.decisaoTrampolim(c.nome));
        if(!cidade) continue;   // o catálogo do estado só entra no relatório; as cidades já trazem os cursos online
        if(!p.cursoAtingeCargaMinima(c.carga) || !p.trampolimPermitido(c)) continue;
        // curso 100% online vale para todos os municípios: entra como "Online" (um registro só), e não uma vez por cidade
        add("Trampolim SP", { municipio: classe(c.modalidade) === "online" ? "Online" : cidade, curso: c.nome, inst: c.inst || "Trampolim SP", modalidade: c.modalidade || "", carga: c.carga || "", area: nomeArea(p.areaDoCurso(c.nome, ...(c._rotulos || []))), link: c.link || "" });
      }
      await espera(250);
    }
  }
  return { linhas, fontes, tramp };
}

async function retratoVagas(p, nomeArea, falhas){
  const linhas = [], fontes = {};
  const add = (fonte, o) => { linhas.push(Object.assign({ fonte }, o)); fontes[fonte] = (fontes[fonte] || 0) + 1; };
  if(p.TRAMPOLIM_VAGAS_ATIVO){
    for(const cidade of p.municipios){
      try{
        for(const v of await p.buscarVagasTrampolim(cidade))
          add("Trampolim SP", { id: v._id, municipio: cidade, cargo: v.cargo, empresa: v.empresa, cidade: v.cidade, tipo: v.tipo, experiencia: v.experiencia,
                                escolaridade: v.escolaridade, area: nomeArea(p.areaDoCurso(v.cargo, ...(v._rotulos || []))), link: v.link });
      }catch(e){ falhas.push(`Trampolim vagas (${cidade}): ${e.message}`); }
      await espera(250);
    }
  }
  if(p.PLANILHA_VAGAS_ATIVA){
    try{
      (await p.buscarVagasPlanilha()).forEach(v => add("Cadastro do programa", { municipio: v._municipio || "Online", cargo: v.cargo, empresa: v.empresa, cidade: v.cidade,
        tipo: v.tipo, area: nomeArea(v._area ? p.classificar(v._area) : p.classificar(v.cargo)), link: v.link }));
    }catch(e){ falhas.push("Planilha (vagas): " + e.message); }
  }
  if(p.VAGAS_ROBO_ATIVO){
    try{
      const arq = path.join(RAIZ, "robo-vagas", "vagas", "ativas.json");
      const ativas = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, "utf8")) : [];
      ativas.forEach(v => add("Robô · " + (v.fonte || "?"), { id: v.id, municipio: v.municipio, cargo: v.cargo, empresa: v.empresa, cidade: v.cidade, tipo: v.tipo,
        experiencia: v.experiencia, escolaridade: v.escolaridade, area: nomeArea(p.areaDoCurso(v.cargo)), link: v.link }));
    }catch(e){ falhas.push("Robô de vagas: " + e.message); }
  }
  return { linhas, fontes };
}

/* Cursos PRESENCIAIS por município do programa × área: na própria cidade e nas vizinhas (CIDADES_VIZINHAS). */
function cobertura(p, linhasCursos, nomeArea){
  const areas = p.todasAreas().map(a => a.nome);
  const n = s => p.normTxt(s);
  const porCidade = new Map();   // cidade normalizada -> área -> Set de cursos
  for(const l of linhasCursos){
    if(classe(l.modalidade) !== "presencial" || !l.municipio || l.municipio === "Online") continue;
    const c = n(l.municipio);
    if(!porCidade.has(c)) porCidade.set(c, new Map());
    const m = porCidade.get(c);
    if(!m.has(l.area)) m.set(l.area, new Set());
    m.get(l.area).add(titulo(l.curso) + "|" + semAcento(l.fonte));
  }
  const conta = (cidade, area) => ((porCidade.get(n(cidade)) || new Map()).get(area) || new Set());
  const municipios = {};
  for(const mun of p.municipios){
    const viz = p.vizinhas[mun] || [];
    const linha = {};
    for(const a of areas){
      const proprio = conta(mun, a).size;
      const vizSet = new Set(); viz.forEach(v => conta(v, a).forEach(x => vizSet.add(x)));
      if(proprio || vizSet.size) linha[a] = viz.length ? [proprio, vizSet.size] : [proprio, 0];
    }
    municipios[mun] = linha;
  }
  return { atualizado: HOJE, areas, municipios };
}

function relatorio(r){
  const L = [`# Histórico de cursos e vagas · ${HOJE}`, ""];
  L.push(`**Cursos:** ${r.cursos.novos.length} novos esta semana · ${r.cursos.sairam.length} saíram · ${r.cursos.total} no histórico (${r.cursos.semanas} semanas, ${kb(r.cursos.tamanho)})`);
  if(r.vagas) L.push(`**Vagas:** ${r.vagas.novos.length} novas esta semana · ${r.vagas.sairam.length} saíram · ${r.vagas.total} no histórico (${r.vagas.semanas} semanas, ${kb(r.vagas.tamanho)})`);
  L.push("");
  L.push("| Origem | Cursos no retrato |", "|---|---|");
  Object.entries(r.fontesCursos).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => L.push(`| ${f} | ${n} |`));
  if(r.fontesVagas){
    L.push("", "| Origem | Vagas no retrato |", "|---|---|");
    Object.entries(r.fontesVagas).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => L.push(`| ${f} | ${n} |`));
  }
  L.push("");
  if(r.cob){
    const semNada = Object.entries(r.cob.municipios).filter(([, l]) => !Object.values(l).some(([a]) => a)).map(([m]) => m);
    L.push(`## Cobertura presencial`, "", `${semNada.length} municípios sem nenhum curso presencial na própria cidade${semNada.length ? ": " + semNada.join(", ") : ""}.`,
      "A matriz completa está na aba **Vazios do catálogo** do painel.", "");
  }
  const t = [...r.tramp.vistos.entries()];
  if(t.length){
    const ok = t.filter(([, d]) => d.d === "manter"), fora = t.filter(([, d]) => d.d !== "manter");
    L.push(`## Filtro de perfil do Trampolim`, "", `${t.length} títulos diferentes no Trampolim (estado + municípios): **${ok.length} aparecem**, ${fora.length} ficam de fora.`,
      "Para mudar, edite `dados/trampolim-decisoes.js` (manter / ocultar por título).", "");
    if(fora.length) L.push("<details><summary>Ficam de fora</summary>", "", ...fora.map(([n, d]) => `- ${n} · ${d.m}`), "", "</details>", "");
  }
  if(r.cursos.novos.length){
    L.push("## Cursos que entraram esta semana", "");
    r.cursos.novos.slice(0, 120).forEach(c => L.push(`- ${c.curso} · ${c.fonte} · ${c.classe === "online" ? "online" : c.municipios.slice(0, 4).join(", ")}${c.carga ? " · " + c.carga : ""}`));
    if(r.cursos.novos.length > 120) L.push(`- … e mais ${r.cursos.novos.length - 120} (veja a aba Histórico do painel)`);
    L.push("");
  }
  if(r.falhas.length){ L.push("## Avisos", "", ...r.falhas.slice(0, 30).map(f => "- " + f), ""); }
  return L.join("\n") + "\n";
}

/* aplica o retrato de hoje a um histórico e devolve o resumo */
function aplicar(arq, campo, linhas, acrescentarFn, explicacao, ordenar, podar){
  const hist = lerHistorico(arq, campo);
  const ultimaAnterior = hist.semanas.filter(s => s !== HOJE).pop() || "";
  desmarcarSemana(hist, HOJE);   // rodou de novo no mesmo dia: o retrato de hoje é refeito
  const antes = new Set(hist.itens.filter(c => c._d.size).map(c => c.k));
  acrescentarFn(hist, HOJE, linhas);
  if(podar){
    const limite = new Date(Date.now() - podar * 864e5).toISOString().slice(0, 10);
    hist.itens = hist.itens.filter(c => [...c._d].some(d => d >= limite));
  }
  const novos = hist.itens.filter(c => c._d.has(HOJE) && !antes.has(c.k));
  const sairam = ultimaAnterior ? hist.itens.filter(c => c._d.has(ultimaAnterior) && !c._d.has(HOJE)) : [];
  const g = gravarHistorico(arq, hist, campo, explicacao, ordenar);
  return { novos: novos.map(c => Object.assign({}, c)), sairam, total: g.itens.length, semanas: hist.semanas.length, tamanho: g.tamanho };
}

async function main(){
  if(PASTA_IMPORTAR){ console.log("Importando " + PASTA_IMPORTAR); importar(PASTA_IMPORTAR); return; }
  const { p } = carregarPortal();
  const nomeArea = id => (p.todasAreas().find(a => a.id === id) || {}).nome || "Outros";
  const falhas = [];

  console.log("Retrato dos cursos (funções do portal)…");
  const rc = await retratoCursos(p, nomeArea, falhas);
  console.log(`  ${rc.linhas.length} linhas · ${Object.entries(rc.fontes).map(([f, n]) => f + " " + n).join(" · ")}`);
  if(rc.linhas.length < 50) throw new Error(`o retrato dos cursos veio com só ${rc.linhas.length} linhas: provável falha das fontes; nada foi alterado`);
  const cursos = aplicar(ARQ_CURSOS, "cursos", rc.linhas, acrescentarCursos, EXPL_CURSOS, ordemCursos, 0);
  console.log(`  cursos: ${cursos.total} no histórico, ${cursos.novos.length} novos, ${cursos.sairam.length} saíram (${kb(cursos.tamanho)})`);

  const cob = cobertura(p, rc.linhas, nomeArea);
  const textoCob = "{\n" + ` "atualizado": ${JSON.stringify(cob.atualizado)},\n` +
    ` "explicacao": "Cursos PRESENCIAIS por município do programa e área: [na própria cidade, nas cidades vizinhas]. Área ausente = nenhum curso. Gerado por scripts/atualizar-historico.js.",\n` +
    ` "areas": ${JSON.stringify(cob.areas)},\n "municipios": {\n` +
    Object.entries(cob.municipios).map(([m, l]) => `  ${JSON.stringify(m)}: ${JSON.stringify(l)}`).join(",\n") + "\n }\n}\n";
  if(!SIMULAR) fs.writeFileSync(ARQ_COBERTURA, textoCob, "utf8");

  let vagas = null, rv = null;
  if(!SEM_VAGAS){
    console.log("Retrato das vagas (funções do portal)…");
    rv = await retratoVagas(p, nomeArea, falhas);
    console.log(`  ${rv.linhas.length} linhas · ${Object.entries(rv.fontes).map(([f, n]) => f + " " + n).join(" · ")}`);
    if(rv.linhas.length) vagas = aplicar(ARQ_VAGAS, "vagas", rv.linhas, acrescentarVagas, EXPL_VAGAS, ordemVagas, DIAS_GUARDAR_VAGA);
    else falhas.push("O retrato das vagas veio vazio: o histórico de vagas não foi alterado.");
    if(vagas) console.log(`  vagas: ${vagas.total} no histórico, ${vagas.novos.length} novas, ${vagas.sairam.length} saíram (${kb(vagas.tamanho)})`);
  }

  const rel = relatorio({ cursos, vagas, fontesCursos: rc.fontes, fontesVagas: rv && rv.fontes, cob, tramp: rc.tramp, falhas });
  if(ARQ_RELATORIO) fs.writeFileSync(ARQ_RELATORIO, rel, "utf8");
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `novos=${cursos.novos.length}\nsairam=${cursos.sairam.length}\ntotal=${cursos.total}\nvagas_novas=${vagas ? vagas.novos.length : 0}\n`);
  console.log(SIMULAR ? "Simulação: nada gravado." : "Gravado: dados/historico-cursos.json, dados/historico-vagas.json, dados/cobertura.json");
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
