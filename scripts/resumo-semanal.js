#!/usr/bin/env node
/* Resumo semanal do portal, para o e-mail enviado pela conta coordcampo (Power Automate).

   Lê só arquivos públicos e agregados do repositório (nenhum e-mail ou dado pessoal):
     dados/uso-semanal.json       uso da última semana (precisa do Secret PAINEL_CHAVE no robô de uso)
     dados/historico-cursos.json  cursos no portal, novos e que saíram
     dados/historico-vagas.json   vagas no portal, novas e que saíram
     dados/cobertura.json         municípios sem curso presencial
     dados/municipios.js          os municípios do programa
   Grava:
     dados/resumo-semanal.html    o resumo pronto (HTML simples, com estilos embutidos, bom para Outlook)
     dados/resumo-semanal.xml     feed RSS com os últimos 12 resumos. O Power Automate ("Quando um item do feed é
                                  publicado") lê este feed e manda o e-mail. Veja docs/EMAIL-SEMANAL.md.
   Uso: node scripts/resumo-semanal.js [--simular] */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DADOS = path.join(RAIZ, "dados");
const SIMULAR = process.argv.includes("--simular");
const SITE = "https://superacao-ip.github.io/areateste";
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const ler = arq => { try{ return JSON.parse(fs.readFileSync(path.join(DADOS, arq), "utf8")); }catch(_){ return null; } };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (n || 0).toLocaleString("pt-BR");
const dataBR = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
const municipios = Object.keys(new Function(fs.readFileSync(path.join(DADOS, "municipios.js"), "utf8") + "\nreturn CENTROS_MUNICIPIOS;")())
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

/* cursos/vagas: no portal agora, novos na última semana e os que saíram desde a anterior */
function movimento(hist, campo){
  if(!hist || !hist.semanas.length) return null;
  const u = hist.semanas.length - 1, a = u - 1;
  const itens = hist[campo] || [];
  const tem = (c, i) => i >= 0 && (c.p || []).includes(i);
  /* sem comparação: só existe um retrato, ou o anterior não tinha as vagas do robô e o atual tem (primeiro retrato completo) */
  const robo = i => itens.some(c => tem(c, i) && /^Rob/.test(c.fonte || ""));
  const semComparacao = a < 0 || (campo === "vagas" && robo(u) !== robo(a));
  return {
    semComparacao,
    retrato: hist.semanas[u],
    agora: itens.filter(c => tem(c, u)),
    novos: itens.filter(c => tem(c, u) && Math.min(...c.p) === u),
    sairam: a >= 0 ? itens.filter(c => tem(c, a) && !tem(c, u)) : []
  };
}

function montar(){
  const uso = ler("uso-semanal.json"), cursos = movimento(ler("historico-cursos.json"), "cursos");
  const vagas = movimento(ler("historico-vagas.json"), "vagas"), cob = ler("cobertura.json");
  const semana = uso && uso.semanas && uso.semanas.length ? uso.semanas[uso.semanas.length - 1] : null;

  const linhas = [], resumoTexto = [];
  const bloco = (titulo, corpo) => linhas.push(
    `<tr><td style="padding:22px 28px 8px"><h2 style="margin:0 0 8px;font:600 21px Arial,sans-serif;color:#003A79">${esc(titulo)}</h2>${corpo}</td></tr>`);
  const tabela = pares => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:16.5px Arial,sans-serif;color:#002D4D">` +
    pares.map(([r, v, destaque]) => `<tr><td style="padding:6px 22px 6px 0;color:#5C5B5F">${esc(r)}</td><td style="padding:6px 0;font-weight:700${destaque ? ";color:#B06F0B" : ""}">${v}</td></tr>`).join("") + "</table>";
  /* as 3 áreas com mais itens (sem "Outros"), em vez da lista item por item: a lista completa fica no painel */
  const areasTop = (itens, titulo, unidade) => {
    const conta = {};
    itens.forEach(c => { const a = c.area || "Outros"; if(a !== "Outros") conta[a] = (conta[a] || 0) + 1; });
    const top = Object.entries(conta).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if(!top.length) return "";
    return `<p style="margin:12px 0 4px;font:600 15px Arial,sans-serif;color:#5C5B5F">${esc(titulo)}</p>` +
      `<ol style="margin:0;padding-left:20px;font:15.5px Arial,sans-serif;color:#002D4D">` +
      top.map(([a, n]) => `<li style="margin:4px 0">${esc(a)}: <b>${fmt(n)}</b> ${esc(unidade)}</li>`).join("") + "</ol>";
  };

  /* uso */
  if(semana){
    const ev = e => (semana.eventos || {})[e] || 0;
    const cliquesPrep = (semana.cursos || []).filter(c => c.fonte === "preparacao").reduce((s, c) => s + (c.cliques || 0), 0);
    const buscas = ev("viu_resultados") + ev("busca_sem_resultado");
    const semBusca = municipios.filter(m => !(semana.cidades || {})[m]);
    bloco(`Uso do portal (${dataBR(semana.inicio)} a ${dataBR(semana.fim)})`, tabela([
      ["Sessões", fmt(semana.sessoes)], ["Buscas", fmt(buscas)], ["Buscas sem resultado", fmt(ev("busca_sem_resultado")), true],
      ["Cliques em cursos", fmt(Math.max(0, ev("clique_curso") - cliquesPrep))], ["Cliques em vagas", fmt(ev("clique_vaga"))],
      ["Cliques na preparação para o trabalho", fmt(cliquesPrep)],
      ["Municípios que buscaram", `${fmt(municipios.length - semBusca.length)} de ${municipios.length}`]
    ]) + (semBusca.length ? `<p style="margin:10px 0 0;font:15.5px Arial,sans-serif;color:#5C5B5F">Sem nenhuma busca na semana: <b style="color:#B06F0B">${esc(semBusca.join(", "))}</b></p>` : ""));
    resumoTexto.push(`${fmt(semana.sessoes)} sessões, ${fmt(buscas)} buscas`);
  }else{
    bloco("Uso do portal", `<p style="margin:0;font:15.5px Arial,sans-serif;color:#5C5B5F">Os números de uso entram aqui quando o Secret PAINEL_CHAVE estiver cadastrado no GitHub.</p>`);
  }

  /* cursos (um bloco só: números gerais e cobertura de cursos presenciais) */
  const presenciais = cob ? (() => {
    const semNada = municipios.filter(m => !Object.values(cob.municipios[m] || {}).some(([n]) => n));
    return `<p style="margin:14px 0 0;font:15.5px Arial,sans-serif;color:#002D4D">` + (semNada.length
      ? `<b style="color:#B06F0B">${semNada.length} municípios</b> sem nenhum curso presencial na própria cidade: ${esc(semNada.join(", "))}.`
      : "Todos os municípios têm pelo menos um curso presencial.") + "</p>";
  })() : "";
  if(cursos){
    bloco(`Cursos (retrato de ${dataBR(cursos.retrato)})`, tabela([
      ["No portal agora", fmt(cursos.agora.length)], ["Entraram esta semana", fmt(cursos.novos.length)], ["Saíram", fmt(cursos.sairam.length)]
    ]) + areasTop(cursos.novos, "Áreas com mais cursos novos", "curso(s) novo(s)") + presenciais);
    resumoTexto.push(`${fmt(cursos.novos.length)} cursos novos`);
  } else if(presenciais){
    bloco("Cursos", presenciais);
  }

  /* vagas */
  if(vagas){
    bloco(`Vagas (retrato de ${dataBR(vagas.retrato)})`, tabela([
      ["No portal agora", fmt(vagas.agora.length)], ["Entraram esta semana", vagas.semComparacao ? "–" : fmt(vagas.novos.length)], ["Fecharam ou saíram", vagas.semComparacao ? "–" : fmt(vagas.sairam.length)],
      ["Aceitam sem experiência", fmt(vagas.agora.filter(v => /^sem experi/i.test(v.experiencia || "")).length)]
    ]) + (vagas.semComparacao ? `<p style="margin:8px 0 0;font:14.5px Arial,sans-serif;color:#5C5B5F">Primeiro retrato completo das vagas: a comparação com a semana anterior começa no próximo.</p>` : "") + areasTop(vagas.agora, "Áreas com mais vagas no portal", "vaga(s)"));
    resumoTexto.push(`${fmt(vagas.agora.length)} vagas no portal`);
  }

  let edicao = "";
  try{
    const [dia, ...txt] = fs.readFileSync(path.join(DADOS, "resumo-edicao.txt"), "utf8").trim().split("|");
    if(dia.trim() === HOJE) edicao = txt.join("|").trim();
  }catch(_){}
  const titulo = `SuperAção SP · resumo da semana · ${dataBR(HOJE)}${edicao ? " (" + edicao + ")" : ""}`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#f2f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f9"><tr><td align="center" style="padding:20px 10px">
<table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #D7D9DD;border-radius:10px">
<tr><td style="padding:24px 28px 6px;border-bottom:3px solid #0C63AA">
  <p style="margin:0;font:600 12.5px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#003A79">SuperAção SP · apoio técnico FGV</p>
  <h1 style="margin:4px 0 12px;font:700 27px Arial,sans-serif;color:#002D4D">Resumo da semana · ${dataBR(HOJE)}</h1>
</td></tr>
${linhas.join("\n")}
<tr><td style="padding:24px 28px 28px">
  <a href="${SITE}/painel.html" style="display:inline-block;background:#0C63AA;color:#ffffff;text-decoration:none;font:600 16px Arial,sans-serif;padding:12px 22px;border-radius:8px">Abrir o painel de acompanhamento</a>
  <p style="margin:14px 0 0;font:13.5px Arial,sans-serif;color:#88868B">Resumo automático feito todo domingo pelos robôs do portal, só com números agregados (sem dados pessoais).</p>
</td></tr>
</table></td></tr></table></body></html>
`;
  return { titulo, html, resumo: resumoTexto.join(" · "), guid: "resumo-" + HOJE + (edicao ? "-" + edicao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "") };
}

/* feed RSS: guarda os últimos 12 resumos; o item novo da semana é o que dispara o Power Automate */
function atualizarFeed(r){
  const arq = path.join(DADOS, "resumo-semanal.xml");
  const antigos = [];
  if(fs.existsSync(arq)){
    for(const m of fs.readFileSync(arq, "utf8").matchAll(/<item>[\s\S]*?<\/item>/g)){
      if(!m[0].includes(`<guid isPermaLink="false">${r.guid}</guid>`)) antigos.push(m[0]);   // refeito no mesmo dia: troca o item
    }
  }
  const item = `<item>
  <title>${esc(r.titulo)}</title>
  <link>${SITE}/dados/resumo-semanal.html</link>
  <guid isPermaLink="false">${r.guid}</guid>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <description><![CDATA[${r.html.replace(/]]>/g, "]]]]><![CDATA[>")}]]></description>
</item>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>SuperAção SP · resumo semanal do portal</title>
<link>${SITE}/painel.html</link>
<description>Resumo semanal do portal de cursos e vagas (números agregados, sem dados pessoais). Gerado por scripts/resumo-semanal.js.</description>
<language>pt-br</language>
${[item].concat(antigos).slice(0, 12).join("\n")}
</channel></rss>
`;
  if(!SIMULAR) fs.writeFileSync(arq, xml, "utf8");
}

const r = montar();
if(!SIMULAR) fs.writeFileSync(path.join(DADOS, "resumo-semanal.html"), r.html, "utf8");
atualizarFeed(r);
console.log(`${r.titulo}: ${r.resumo || "sem números de uso ainda"}${SIMULAR ? " (simulação: nada gravado)" : ""}`);
