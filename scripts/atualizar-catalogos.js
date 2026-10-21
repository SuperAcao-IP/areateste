#!/usr/bin/env node
/* Atualização automática dos catálogos fixos (Aprenda Mais, EVG, Bradesco).

   1. coleta os três catálogos nos sites de origem;
   2. confere se a coleta é confiável (senão NÃO escreve nada e mantém o anterior);
   3. herda as decisões já tomadas (por título) e classifica sozinho os cursos novos;
   4. confere os links dos cursos visíveis (EVG e Bradesco);
   5. reescreve dados/*.js, dados/filtro-publico.js e dados/decisoes-catalogos.json;
   6. escreve o relatório (o resumo que a Action publica como issue).

   Uso:  node scripts/atualizar-catalogos.js [--simular] [--sem-links] [--relatorio arquivo.md]
     --simular     faz tudo, mas não grava os arquivos de dados (só o relatório)
     --sem-links   pula a conferência de links
   Saída: código 0 = coleta confiável (com ou sem mudanças); 1 = falhou, nada foi alterado.
   Na Action, escreve publicar=true|false e falhou=true|false em $GITHUB_OUTPUT. */
const fs = require("fs");
const path = require("path");
const { normalizarTitulo, buscar, emLotes } = require("./lib/util");
const { coletarAprendaMais, coletarEVG, coletarBradesco } = require("./lib/coletores");
const { classificar } = require("./lib/regras");

const RAIZ = path.join(__dirname, "..");
const DADOS = path.join(RAIZ, "dados");
const CARGA_MINIMA_H = 15;          // igual a CARGA_MINIMA_H em js/config.js
const QUEDA_MAXIMA = 0.30;          // coleta com mais de 30% a menos que a anterior é tratada como falha
const LIMITE_LISTA = 60;            // itens por seção no relatório (o resto vira "e mais N")

const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const SEM_LINKS = args.includes("--sem-links");
const iRel = args.indexOf("--relatorio");
const ARQ_RELATORIO = path.resolve(iRel >= 0 ? args[iRel + 1] : path.join(RAIZ, "relatorio-atualizacao.md"));
const HOJE = new Date().toISOString().slice(0, 10);

/* Os três catálogos, na ordem de prioridade para repetidos (o primeiro vence). */
const CATALOGOS = [
  { chave: "aprendaMais", nome: "Aprenda Mais (MEC)", arquivo: "cursos-aprenda-mais.js", constante: "APRENDA_MAIS",
    coletar: prev => coletarAprendaMais({ minimoEsperado: prev.length }), cargaPadrao: "40h", campos: ["titulo", "area", "link"] },
  { chave: "bradesco", nome: "Fundação Bradesco", arquivo: "cursos-bradesco.js", constante: "EV",
    coletar: () => coletarBradesco(), cargaPadrao: "", campos: ["titulo", "carga", "area", "link"] },
  { chave: "evg", nome: "Escola Virtual de Governo (EVG)", arquivo: "cursos-evg.js", constante: "EVG",
    coletar: () => coletarEVG(), cargaPadrao: "", campos: ["titulo", "inst", "carga", "area", "link"],
    soVisiveis: true }   // o catálogo é enorme (~900); o arquivo guarda só o que aparece no site
];

const CABECALHO = {
  aprendaMais: (info) => `/* =====================================================================
   APRENDA MAIS · MEC · cursos livres, gratuitos e 100% online
   Coletado de aprendamais.mec.gov.br · atualizado em ${HOJE} (${info}).
   Gerado por scripts/atualizar-catalogos.js: não edite à mão, a próxima coleta sobrescreve.
   O catálogo guarda TODOS os cursos; o que aparece no site está em dados/filtro-publico.js.
   Todos sao EaD, gratuitos, ~40h, com certificacao do MEC.
   ===================================================================== */`,
  bradesco: (info) => `/* Escola Virtual · Fundação Bradesco · cursos livres, gratuitos e 100% online
   Coletado de ev.org.br · atualizado em ${HOJE} (${info}).
   Gerado por scripts/atualizar-catalogos.js: não edite à mão, a próxima coleta sobrescreve.
   O catálogo guarda TODOS os cursos; o que aparece no site está em dados/filtro-publico.js. */`,
  evg: (info) => `/* Escola Virtual de Governo (EVG) · cursos online gratuitos.
   Coletado de escolavirtual.gov.br · atualizado em ${HOJE} (${info}).
   Gerado por scripts/atualizar-catalogos.js: não edite à mão, a próxima coleta sobrescreve.
   Este arquivo guarda SÓ os cursos que aparecem no site (para a página ficar leve). A lista
   completa coletada e as decisões estão em dados/decisoes-catalogos.json.
   Arquivo .js (nao .json) porque o codigo usa a constante de forma sincrona na inicializacao. */`
};

/* ---------- leitura dos arquivos atuais ---------- */
function lerCatalogoAtual(cat){
  const arq = path.join(DADOS, cat.arquivo);
  if(!fs.existsSync(arq)) return { texto: "", cursos: [] };
  const texto = fs.readFileSync(arq, "utf8");
  const cursos = [];
  for(const m of texto.matchAll(/^\s*\{(.*)\},?\s*$/gm)){
    try{
      const obj = new Function("return {" + m[1] + "}")();
      if(obj.titulo && obj.link) cursos.push(obj);
    }catch(_){ /* linha que não é curso */ }
  }
  return { texto, cursos };
}
function lerDecisoes(){
  const arq = path.join(DADOS, "decisoes-catalogos.json");
  const base = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, "utf8")) : { versao: 1 };
  for(const c of CATALOGOS) base[c.chave] = base[c.chave] || {};
  return base;
}

/* Lista da coleta anterior. Vem das decisões (ativo = estava no site de origem na última
   coleta), porque o arquivo de dados pode guardar só os cursos visíveis (EVG). Na primeira
   execução depois dessa mudança ainda não existe o campo "ativo": usa o arquivo atual. */
function anterioresDe(cat, dec, atual){
  const entradas = Object.values(dec);
  if(!entradas.some(e => "ativo" in e)) return atual.cursos;
  return entradas.filter(e => e.ativo === true).map(e => ({ titulo: e.t, area: e.ar || "Outros", carga: e.c || "", link: "" }));
}

/* ---------- carga horária (mesma regra do site) ---------- */
function cargaEmHoras(carga){
  if(carga == null) return null;
  const m = String(carga).match(/\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}
const cargaOk = carga => { const h = cargaEmHoras(carga); return h == null ? true : h >= CARGA_MINIMA_H; };

/* ---------- escrita ---------- */
const js = v => JSON.stringify(v == null ? "" : v);
function gerarCatalogo(cat, cursos, info){
  const linhas = cursos.map(c => " {" + cat.campos.map(k => `${k}:${js(c[k])}`).join(",") + "}");
  return CABECALHO[cat.chave](info) + `\nconst ${cat.constante} = [\n` + linhas.join(",\n") + "\n];\n";
}
function gerarFiltro(permitidos){
  const bloco = (chave, titulos) => ` ${chave}: [\n` + titulos.map(t => `  ${js(t)}`).join(",\n") + "\n ]";
  return `/* Filtro de público: famílias de baixa renda. Lista dos cursos que APARECEM no site,
   reconhecidos pelo título (normalizado), não pelo link — o link do Aprenda Mais muda a
   cada turma. Os catálogos em dados/ guardam todos os cursos; o que não está aqui fica
   escondido, não apagado.
   Gerado por scripts/atualizar-catalogos.js a partir de dados/decisoes-catalogos.json:
   para mudar uma decisão, edite o JSON (d = manter|ocultar, o = manual), não este arquivo.
   A carga mínima de 15h é aplicada à parte, em js/config.js. Desliga tudo:
   FILTRAR_PUBLICO_FAMILIAS = false em js/config.js. */
const TITULOS_PERMITIDOS = {
${bloco("aprendaMais", permitidos.aprendaMais)},
${bloco("bradesco", permitidos.bradesco)},
${bloco("evg", permitidos.evg)}
};
`;
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

/* ---------- relatório ---------- */
const lista = (itens, fmt = x => x) => {
  if(!itens.length) return "_nenhum_\n";
  const mostrar = itens.slice(0, LIMITE_LISTA).map(x => "- " + fmt(x)).join("\n");
  return mostrar + (itens.length > LIMITE_LISTA ? `\n- … e mais ${itens.length - LIMITE_LISTA}` : "") + "\n";
};

function escreverRelatorio(r){
  const L = [];
  L.push(`# Atualização dos catálogos · ${HOJE}${SIMULAR ? " (simulação)" : ""}\n`);
  if(r.falhas.length){
    L.push("## ⛔ A coleta falhou. Nada foi publicado; o catálogo anterior continua no ar.\n");
    r.falhas.forEach(f => L.push(`- **${f.nome}**: ${f.motivo}`));
    L.push("");
  }
  L.push(r.mudancas.length
    ? `**Arquivos ${SIMULAR ? "que seriam alterados" : "alterados"}:** ${r.mudancas.map(a => "`dados/" + a + "`").join(", ")}\n`
    : "**Nenhum arquivo precisou mudar.**\n");
  L.push("| Catálogo | Coletados | Antes | Entraram | Saíram | Visíveis antes → depois |\n|---|---|---|---|---|---|");
  for(const c of r.catalogos){
    if(c.falhou){ L.push(`| ${c.nome} | falhou | ${c.antes} | – | – | mantido |`); continue; }
    if(!c.entraram){ L.push(`| ${c.nome} | ${c.coletados} | ${c.antes} | – | – | mantido (outra coleta falhou) |`); continue; }
    L.push(`| ${c.nome} | ${c.coletados} (${c.detalhe}) | ${c.antes} | ${c.entraram.length} | ${c.sairam.length} | ${c.visiveisAntes} → ${c.visiveisDepois} |`);
  }
  L.push("");
  for(const c of r.catalogos){
    if(c.falhou || !c.entraram) continue;
    L.push(`## ${c.nome}\n`);
    const novosVisiveis = c.entraram.filter(e => e.visivel);
    const novosOcultos = c.entraram.filter(e => !e.visivel);
    L.push(`### Entraram e aparecem no site (${novosVisiveis.length})\n`);
    L.push(lista(novosVisiveis, e => `${e.titulo}${e.carga ? " · " + e.carga : ""} — _${e.motivo}_`));
    L.push(`### Entraram e ficaram ocultos (${novosOcultos.length})\n`);
    const porMotivo = {};
    novosOcultos.forEach(e => { (porMotivo[e.motivo] = porMotivo[e.motivo] || []).push(e.titulo); });
    L.push(Object.keys(porMotivo).length
      ? Object.entries(porMotivo).sort((a, b) => b[1].length - a[1].length)
          .map(([m, t]) => `- ${m}: **${t.length}**` + (t.length <= 3 ? ` (${t.join("; ")})` : ` (ex.: ${t.slice(0, 3).join("; ")})`)).join("\n") + "\n"
      : "_nenhum_\n");
    L.push(`### Saíram do catálogo (${c.sairam.length})\n`);
    L.push(lista(c.sairam, s => `${s.titulo}${s.eraVisivel ? " ⚠️ estava visível no site" : ""}`));
    if(c.cargaBaixa.length) L.push(`### Mantidos pela equipe, mas ocultos por carga abaixo de 15h (${c.cargaBaixa.length})\n\n${lista(c.cargaBaixa, x => `${x.titulo} · ${x.carga}`)}`);
    L.push(`### Links\n`);
    if(c.links === null) L.push(c.chave === "aprendaMais"
      ? "Os links vêm da listagem pública do portal na turma vigente, então estão no ar por construção.\n"
      : "_conferência de links pulada_\n");
    else L.push(`${c.links.conferidos} links de cursos visíveis conferidos; **${c.links.quebrados.length} quebrado(s)**.\n\n` + lista(c.links.quebrados, q => `${q.titulo} — ${q.link} (${q.motivo})`));
  }
  const auto = r.catalogos.flatMap(c => c.falhou || !c.entraram ? [] : c.entraram.map(e => ({ ...e, catalogo: c.nome })));
  L.push(`---\n_${auto.length} curso(s) novo(s) classificado(s) automaticamente pelas regras de \`scripts/lib/regras.js\`. Para discordar de uma decisão, edite \`dados/decisoes-catalogos.json\` (\`d\` e \`o: "manual"\`) e a próxima execução respeita._\n`);
  fs.writeFileSync(ARQ_RELATORIO, L.join("\n"), "utf8");
}

function saidaAction(chave, valor){
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${chave}=${valor}\n`);
}

/* ---------- principal ---------- */
async function main(){
  const decisoes = lerDecisoes();
  const resultado = { catalogos: [], falhas: [], mudancas: [] };
  const coletas = {};

  /* 1-2. coleta e conferência */
  for(const cat of CATALOGOS){
    const atual = lerCatalogoAtual(cat);
    atual.cursos = anterioresDe(cat, decisoes[cat.chave], atual);
    const info = { nome: cat.nome, chave: cat.chave, antes: atual.cursos.length, falhou: false };
    resultado.catalogos.push(info);
    try{
      console.log(`Coletando ${cat.nome}…`);
      const col = await cat.coletar(atual.cursos);
      if(!col.cursos.length) throw new Error("a coleta voltou vazia");
      if(atual.cursos.length >= 20 && col.cursos.length < atual.cursos.length * (1 - QUEDA_MAXIMA))
        throw new Error(`a coleta trouxe ${col.cursos.length} cursos contra ${atual.cursos.length} do catálogo anterior (queda de mais de ${QUEDA_MAXIMA * 100}%)`);
      coletas[cat.chave] = { ...col, atual };
      info.coletados = col.cursos.length; info.detalhe = col.detalhe;
      console.log(`  ${col.cursos.length} cursos · ${col.detalhe}`);
    }catch(e){
      info.falhou = true;
      resultado.falhas.push({ nome: cat.nome, motivo: e.message });
      console.error(`  FALHOU: ${e.message}`);
    }
  }
  if(resultado.falhas.length){
    escreverRelatorio(resultado);
    saidaAction("publicar", "false"); saidaAction("falhou", "true");
    console.error(`\nColeta não confiável: nada foi alterado. Relatório: ${ARQ_RELATORIO}`);
    process.exit(1);
  }

  /* 3. decisões: herdar as existentes, classificar as novas */
  const norm = normalizarTitulo;
  const visiveis = {};   // chave -> Set de títulos normalizados visíveis
  for(const cat of CATALOGOS){
    const col = coletas[cat.chave];
    // área: no EVG/Bradesco a coleta não traz área; herda a do catálogo anterior
    const areaAnterior = new Map(col.atual.cursos.map(c => [norm(c.titulo), c.area]));
    col.cursos.forEach(c => {
      c.carga = c.carga || cat.cargaPadrao;
      if((!c.area || c.area === "Outros") && areaAnterior.has(norm(c.titulo))) c.area = areaAnterior.get(norm(c.titulo));
    });
    const dec = decisoes[cat.chave];
    visiveis[cat.chave] = new Set(col.cursos.filter(c => dec[norm(c.titulo)] && dec[norm(c.titulo)].d === "manter" && cargaOk(c.carga)).map(c => norm(c.titulo)));
  }
  for(const cat of CATALOGOS){
    const col = coletas[cat.chave], info = resultado.catalogos.find(c => c.chave === cat.chave);
    const dec = decisoes[cat.chave];
    const antigos = new Map(col.atual.cursos.map(c => [norm(c.titulo), c]));
    const novos = new Map(col.cursos.map(c => [norm(c.titulo), c]));
    info.visiveisAntes = col.atual.cursos.filter(c => dec[norm(c.titulo)] && dec[norm(c.titulo)].d === "manter" && cargaOk(c.carga || cat.cargaPadrao)).length;
    info.entraram = []; info.sairam = []; info.cargaBaixa = [];

    for(const c of col.cursos){
      const n = norm(c.titulo);
      if(dec[n]) continue;
      const outros = new Set(CATALOGOS.filter(o => o.chave !== cat.chave).flatMap(o => [...visiveis[o.chave]]));
      const r = classificar(c.titulo, { visiveisEmOutrosCatalogos: outros });
      dec[n] = { t: c.titulo, d: r.d, o: "auto", m: r.m, desde: HOJE };
      if(r.d === "manter" && cargaOk(c.carga)) visiveis[cat.chave].add(n);
    }
    for(const [n, c] of novos) if(!antigos.has(n)){
      info.entraram.push({ titulo: c.titulo, carga: c.carga, visivel: dec[n].d === "manter" && cargaOk(c.carga), motivo: dec[n].m });
    }
    for(const [n, c] of antigos) if(!novos.has(n))
      info.sairam.push({ titulo: c.titulo, eraVisivel: !!(dec[n] && dec[n].d === "manter" && cargaOk(c.carga || cat.cargaPadrao)) });
    for(const c of col.cursos){
      const n = norm(c.titulo);
      if(dec[n].d === "manter" && !cargaOk(c.carga)) info.cargaBaixa.push({ titulo: c.titulo, carga: c.carga });
    }
    info.visiveisDepois = col.cursos.filter(c => dec[norm(c.titulo)].d === "manter" && cargaOk(c.carga)).length;
    /* registra o que estava no site de origem nesta coleta (base da comparação da próxima) */
    const presentes = new Set();
    for(const c of col.cursos){
      const e = dec[norm(c.titulo)];
      e.ativo = true; e.c = c.carga || ""; e.ar = c.area || "Outros";
      presentes.add(norm(c.titulo));
    }
    for(const [n, e] of Object.entries(dec)) if(!presentes.has(n)) e.ativo = false;
    info.col = col;
  }

  /* 4. links dos cursos visíveis (EVG e Bradesco) */
  for(const cat of CATALOGOS){
    const info = resultado.catalogos.find(c => c.chave === cat.chave);
    info.links = null;
    if(SEM_LINKS || cat.chave === "aprendaMais") continue;
    const alvo = info.col.cursos.filter(c => decisoes[cat.chave][norm(c.titulo)].d === "manter" && cargaOk(c.carga));
    console.log(`Conferindo ${alvo.length} links de ${cat.nome}…`);
    const quebrados = [];
    await emLotes(alvo, 4, async c => {
      try{
        const r = await buscar(c.link, { tentativas: 2, timeoutMs: 25000 });
        const caminho = new URL(r.url).pathname.replace(/\/+$/, "") || "/";
        if(r.status === 404 || r.status === 410) quebrados.push({ titulo: c.titulo, link: c.link, motivo: "HTTP " + r.status });
        else if(r.status >= 400) quebrados.push({ titulo: c.titulo, link: c.link, motivo: "HTTP " + r.status });
        else if(["/", "/catalogo", "/cursos"].includes(caminho)) quebrados.push({ titulo: c.titulo, link: c.link, motivo: "redireciona para a lista de cursos" });
      }catch(e){
        quebrados.push({ titulo: c.titulo, link: c.link, motivo: "sem resposta" });
      }
    });
    info.links = { conferidos: alvo.length, quebrados };
  }

  /* proteção extra: se o que aparece no site despencar (ex.: títulos renomeados em massa
     no Aprenda Mais), é sinal de problema na coleta, não de mudança real. */
  const visAntes = resultado.catalogos.reduce((a, c) => a + c.visiveisAntes, 0);
  const visDepois = resultado.catalogos.reduce((a, c) => a + c.visiveisDepois, 0);
  if(visAntes >= 20 && visDepois < visAntes * 0.6){
    resultado.falhas.push({ nome: "Cursos visíveis", motivo: `os cursos que aparecem no site cairiam de ${visAntes} para ${visDepois} (mais de 40% a menos)` });
    resultado.catalogos.forEach(c => delete c.col);
    escreverRelatorio(resultado);
    saidaAction("publicar", "false"); saidaAction("falhou", "true");
    console.error(`\nQueda brusca de cursos visíveis (${visAntes} -> ${visDepois}): nada foi alterado. Relatório: ${ARQ_RELATORIO}`);
    process.exit(1);
  }

  /* 5. gravação */
  const permitidos = {};
  for(const cat of CATALOGOS){
    const col = coletas[cat.chave];
    permitidos[cat.chave] = [...new Set(col.cursos.filter(c => decisoes[cat.chave][norm(c.titulo)].d === "manter").map(c => norm(c.titulo)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const paraArquivo = cat.soVisiveis
      ? col.cursos.filter(c => decisoes[cat.chave][norm(c.titulo)].d === "manter" && cargaOk(c.carga))
      : col.cursos;
    const infoTxt = (cat.soVisiveis ? `${paraArquivo.length} cursos visíveis de ${col.cursos.length} coletados` : `${col.cursos.length} cursos`)
      + (cat.chave === "aprendaMais" ? ", " + col.detalhe : "");
    gravarSeMudou(cat.arquivo, gerarCatalogo(cat, paraArquivo, infoTxt), resultado.mudancas);
  }
  gravarSeMudou("filtro-publico.js", gerarFiltro(permitidos), resultado.mudancas);
  gravarSeMudou("decisoes-catalogos.json", JSON.stringify(decisoes, null, 1) + "\n", resultado.mudancas);

  resultado.catalogos.forEach(c => delete c.col);
  escreverRelatorio(resultado);
  saidaAction("publicar", resultado.mudancas.length ? "true" : "false"); saidaAction("falhou", "false");
  console.log(`\n${resultado.mudancas.length ? "Alterados: " + resultado.mudancas.join(", ") : "Nenhuma mudança."}${SIMULAR ? " (simulação: nada gravado)" : ""}\nRelatório: ${ARQ_RELATORIO}`);
}

main().catch(e => {
  console.error("Erro inesperado:", e);
  try{ escreverRelatorio({ catalogos: [], falhas: [{ nome: "Script", motivo: e.message }], mudancas: [] }); }catch(_){}
  saidaAction("publicar", "false"); saidaAction("falhou", "true");
  process.exit(1);
});
