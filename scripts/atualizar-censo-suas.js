#!/usr/bin/env node
/* Verificação MENSAL do Censo SUAS (CRAS/CREAS) para o mapa.

   O que faz, nesta ordem:
     1. Sonda o endereço dos dois zips (CRAS e CREAS) do ano atual e do anterior, lendo só os primeiros bytes. Só vale
        se vier um zip de verdade ("PK"): redirecionamento para uma página do gov.br conta como FONTE INDISPONÍVEL.
     2. Compara com scripts/fontes/censo-suas-marca.json (ano e data/tamanho dos arquivos já usados).
        Nada novo = não faz nada. Ano mais novo (ou arquivo republicado) = gera dados/servicos-oficiais.js.
     3. TRAVAS (as mesmas ideias dos catálogos): se a fonte falha, ficam os dados atuais; só publica se a lista nova passar:
        queda de mais de 30% no total, município que tinha CRAS e ficaria sem nenhum, ou mais de 10% das unidades
        sem coordenada válida = NÃO publica e avisa.
     4. Resultado para o fluxo (.github/workflows/atualizar-censo-suas.yml): publicar, estado, abrir_issue.
        Issue SÓ na primeira falha (e quando algo muda): enquanto a fonte continuar fora do ar, nenhum mês novo abre issue.

   Uso: node scripts/atualizar-censo-suas.js [--simular] [--relatorio arq.md]
   Para testes: CENSO_SUAS_BASE (endereço base dos zips) e CENSO_SUAS_ANO_ATUAL (ano "de hoje"). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { gerar, BASE_PADRAO } = require("./gerar-servicos-oficiais");
const { RAIZ, km } = require("./lib/cidades");

const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const iRel = args.indexOf("--relatorio");
const ARQ_RELATORIO = path.resolve(iRel >= 0 ? args[iRel + 1] : path.join(RAIZ, "relatorio-censo-suas.md"));
const ARQ_DADOS = path.join(RAIZ, "dados", "servicos-oficiais.js");
const ARQ_MARCA = path.join(__dirname, "fontes", "censo-suas-marca.json");
const HOJE = new Date().toISOString().slice(0, 10);
const ANO_ATUAL = +(process.env.CENSO_SUAS_ANO_ATUAL || new Date().getFullYear());
const BASE = (process.env.CENSO_SUAS_BASE || BASE_PADRAO).replace(/\/?$/, "/");
const UA = "SuperAcaoSP-mapa/1.0 (+https://superacao-ip.github.io/plataforma/)";
const ARQUIVOS = [["cras", "1_CRAS.zip"], ["creas", "2_CREAS.zip"]];
const QUEDA_MAXIMA = 0.30, SEM_COORDENADA_MAXIMO = 0.10;

function saida(k, v){ if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); }

function lerMarca(){
  try{ return JSON.parse(fs.readFileSync(ARQ_MARCA, "utf8")); }catch(_){ return { ano: null, arquivos: {}, falhando: false }; }
}
function lerListaAtual(){
  if(!fs.existsSync(ARQ_DADOS)) return [];
  const ctx = {}; vm.createContext(ctx);
  try{ vm.runInContext(fs.readFileSync(ARQ_DADOS, "utf8") + "\nglobalThis.__v = SERVICOS_OFICIAIS;", ctx); return ctx.__v || []; }catch(_){ return []; }
}

/* lê só os primeiros bytes de um zip e anota data e tamanho */
async function sondarArquivo(ano, [chave, nome]){
  const url = `${BASE}${ano}/${nome}`;
  const info = { chave, nome, url, ok: false, status: null, urlFinal: url, lastModified: null, etag: null, tamanho: null, motivo: "" };
  try{
    const resp = await fetch(url, { headers: { "user-agent": UA, Range: "bytes=0-3" }, signal: AbortSignal.timeout(60000) });
    info.status = resp.status; info.urlFinal = resp.url;
    info.lastModified = resp.headers.get("last-modified"); info.etag = resp.headers.get("etag");
    const cr = resp.headers.get("content-range");
    info.tamanho = cr ? +cr.split("/")[1] : (resp.headers.get("content-length") ? +resp.headers.get("content-length") : null);
    if(!(resp.status === 200 || resp.status === 206)){ info.motivo = `HTTP ${resp.status}`; return info; }
    const leitor = resp.body.getReader(); const { value } = await leitor.read(); try{ await leitor.cancel(); }catch(_){}
    if(!value || value.length < 4 || value[0] !== 0x50 || value[1] !== 0x4B || value[2] !== 0x03 || value[3] !== 0x04){
      info.motivo = "não é um zip" + (resp.url !== url ? ` (redirecionou para ${resp.url})` : ""); return info;
    }
    info.ok = true;
  }catch(e){ info.motivo = e.name === "TimeoutError" ? "tempo esgotado" : (e.cause && e.cause.code) || e.message; }
  return info;
}
async function sondarAno(ano){
  const arquivos = []; for(const a of ARQUIVOS) arquivos.push(await sondarArquivo(ano, a));
  return { ano, ok: arquivos.every(a => a.ok), arquivos };
}

/* TRAVAS: devolve a lista de problemas (vazia = pode publicar) */
function travas(anterior, nova, semCoord, contagem){
  const p = [];
  if(anterior.length >= 50 && nova.length < anterior.length * (1 - QUEDA_MAXIMA)) p.push(`só ${nova.length} unidades contra ${anterior.length} da versão atual (queda de mais de ${QUEDA_MAXIMA * 100}%)`);
  const cidadesComCras = {}; anterior.filter(x => x.tipo === "CRAS").forEach(x => cidadesComCras[x.cidade] = true);
  const semCras = Object.keys(cidadesComCras).filter(c => !((contagem[c] || {}).CRAS > 0));
  if(semCras.length) p.push(`município(s) que tinham CRAS e ficariam sem nenhum: ${semCras.join(", ")}`);
  if(nova.length && semCoord / nova.length > SEM_COORDENADA_MAXIMO) p.push(`${semCoord} de ${nova.length} unidades sem coordenada válida (mais de ${SEM_COORDENADA_MAXIMO * 100}%)`);
  return p;
}
function comparar(anterior, nova){
  const porId = new Map(anterior.map(x => [x.id, x]));
  const novas = [], alteradas = [];
  for(const x of nova){
    const a = porId.get(x.id);
    if(!a){ novas.push(x); continue; }
    porId.delete(x.id);
    const moveu = a.lat != null && x.lat != null && km(a, x) > 0.05;
    if(a.endereco !== x.endereco || a.bairro !== x.bairro || moveu || (a.lat == null) !== (x.lat == null)) alteradas.push({ antes: a, depois: x });
  }
  return { novas, removidas: [...porId.values()], alteradas };
}
const comparavel = t => String(t).replace(/Gerado por scripts\/gerar-servicos-oficiais\.js · \d{4}-\d{2}-\d{2}/, "Gerado por -").replace(/\r\n/g, "\n");

function relatorio(res){
  const L = [`# Censo SUAS · verificação de ${HOJE}\n`, `**Situação:** ${res.situacao}\n`];
  L.push("## O que a verificação encontrou\n", "| Ano | Arquivo | Resultado |", "|---|---|---|");
  res.sondagens.forEach(s => s.arquivos.forEach(a => L.push(`| ${s.ano} | ${a.nome} | ${a.ok ? "zip válido" + (a.lastModified ? ` (atualizado em ${a.lastModified})` : "") : "**indisponível:** " + a.motivo} |`)));
  if(res.problemas && res.problemas.length) L.push("\n## Travas que impediram a publicação\n", ...res.problemas.map(x => "- " + x), "\nOs dados atuais continuam no ar, sem alteração.");
  if(res.diff){
    const d = res.diff;
    L.push(`\n## O que mudou (Censo SUAS ${res.ano})\n`, `- Unidades novas: **${d.novas.length}**`, `- Unidades que saíram da lista: **${d.removidas.length}**`, `- Com endereço ou posição alterados: **${d.alteradas.length}**`);
    const f = x => `${x.tipo} · ${x.cidade}: ${x.endereco}${x.bairro ? " – " + x.bairro : ""}`;
    if(d.novas.length) L.push("\n### Novas\n", ...d.novas.slice(0, 40).map(x => "- " + f(x)));
    if(d.removidas.length) L.push("\n### Saíram\n", ...d.removidas.slice(0, 40).map(x => "- " + f(x)));
    if(d.alteradas.length) L.push("\n### Alteradas\n", ...d.alteradas.slice(0, 40).map(x => `- ${f(x.antes)}  →  ${f(x.depois)}`));
    if(res.semCoord && res.semCoord.length) L.push("\n### Sem coordenada válida (fora do mapa)\n", ...res.semCoord.map(x => "- " + x));
  }
  if(res.avisoFalha) L.push("\n---\n" + res.avisoFalha);
  return L.join("\n") + "\n";
}

async function principal(){
  const marca = lerMarca(), novaMarca = JSON.parse(JSON.stringify(marca));
  const res = { situacao: "", sondagens: [], ano: marca.ano };
  let estado = "sem_mudanca", publicarDados = false, texto = null;

  // 1) existe um censo mais novo?
  for(const ano of [ANO_ATUAL, ANO_ATUAL - 1]) res.sondagens.push(await sondarAno(ano));
  const disponiveis = res.sondagens.filter(s => s.ok).sort((a, b) => b.ano - a.ano);
  if(!disponiveis.length){
    estado = "indisponivel";
    res.situacao = "**fonte indisponível.** O MDS não entregou os zips do Censo SUAS (veja a tabela). Os dados atuais continuam no ar.";
  }else{
    const melhor = disponiveis[0];
    const refs = Object.fromEntries(melhor.arquivos.map(a => [a.chave, { lastModified: a.lastModified, etag: a.etag, tamanho: a.tamanho }]));
    const mesmoAno = marca.ano === melhor.ano, temRef = marca.arquivos && marca.arquivos.cras && (marca.arquivos.cras.lastModified || marca.arquivos.cras.tamanho);
    const mudouArquivo = mesmoAno && temRef && ARQUIVOS.some(([c]) => {
      const a = (marca.arquivos[c] || {}), b = refs[c];
      return (b.lastModified && a.lastModified && b.lastModified !== a.lastModified) || (b.tamanho && a.tamanho && b.tamanho !== a.tamanho);
    });
    const maisNovo = marca.ano == null || melhor.ano > marca.ano;
    if(mesmoAno && !temRef){
      estado = "baseline"; novaMarca.arquivos = refs;
      res.situacao = `sem mudança. Primeira verificação com este controle: guardei a data e o tamanho dos arquivos do Censo SUAS ${melhor.ano} como referência.`;
    }else if(!maisNovo && !mudouArquivo){
      estado = "sem_mudanca"; res.situacao = `sem mudança. O Censo SUAS mais novo disponível continua sendo o de ${melhor.ano}.`;
    }else{
      // 2) gerar e passar pelas travas
      try{
        const anterior = lerListaAtual();
        const r = await gerar({ ano: melhor.ano });
        const problemas = travas(anterior, r.lista, r.semCoord.length, r.contagem);
        res.ano = melhor.ano; res.problemas = problemas; res.diff = comparar(anterior, r.lista); res.semCoord = r.semCoord;
        if(problemas.length){
          estado = "erro"; res.situacao = `**não publicado.** Saiu o Censo SUAS ${melhor.ano}, mas a lista nova não passou nas travas de segurança.`;
        }else{
          estado = "atualizado"; texto = r.texto; novaMarca.ano = melhor.ano; novaMarca.arquivos = refs;
          publicarDados = comparavel(fs.existsSync(ARQ_DADOS) ? fs.readFileSync(ARQ_DADOS, "utf8") : "") !== comparavel(texto);
          res.situacao = `**atualizado** para o Censo SUAS ${melhor.ano}${maisNovo ? "" : " (o arquivo foi republicado pelo MDS)"}.`;
        }
      }catch(e){
        estado = e.indisponivel ? "indisponivel" : "erro";
        res.situacao = `**${estado === "indisponivel" ? "fonte indisponível" : "não publicado"}:** ${e.message}. Os dados atuais continuam no ar.`;
        res.problemas = [e.message];
      }
    }
  }

  // 3) controle de falhas: issue só na primeira falha (e quando algo muda)
  const falhou = estado === "indisponivel" || estado === "erro";
  let abrirIssue = false, tituloIssue = "";
  if(falhou){
    abrirIssue = !marca.falhando;
    novaMarca.falhando = true; novaMarca.falhaDesde = marca.falhando ? marca.falhaDesde : HOJE; novaMarca.ultimoMotivo = (res.problemas && res.problemas[0]) || res.situacao.replace(/\*/g, "");
    if(marca.falhando) res.avisoFalha = `Esta fonte já falhava desde ${marca.falhaDesde}: não abri issue nova (só a primeira falha abre).`;
    tituloIssue = `Censo SUAS ${HOJE.slice(0, 7)}: ${estado === "indisponivel" ? "fonte indisponível (dados atuais mantidos)" : "lista nova NÃO publicada (travas)"}`;
  }else{
    if(marca.falhando){ res.avisoFalha = `A fonte voltou ao normal (falhava desde ${marca.falhaDesde}).`; }
    novaMarca.falhando = false; delete novaMarca.falhaDesde; delete novaMarca.ultimoMotivo;
    if(estado === "atualizado" && publicarDados){ abrirIssue = true; tituloIssue = `Censo SUAS ${HOJE.slice(0, 7)}: atualizado para ${res.ano}`; }
  }

  // 4) gravar (marca só muda quando algo mudou; a data da verificação não conta)
  const semData = m => JSON.stringify(Object.assign({}, m, { verificadoEm: undefined }));
  const marcaMudou = semData(novaMarca) !== semData(marca);
  if(marcaMudou) novaMarca.verificadoEm = HOJE;
  if(!SIMULAR){
    if(publicarDados) fs.writeFileSync(ARQ_DADOS, texto, "utf8");
    if(marcaMudou){ fs.mkdirSync(path.dirname(ARQ_MARCA), { recursive: true }); fs.writeFileSync(ARQ_MARCA, JSON.stringify(novaMarca, null, 1) + "\n", "utf8"); }
  }
  const md = relatorio(res);
  fs.writeFileSync(ARQ_RELATORIO, md, "utf8");
  saida("estado", estado); saida("publicar", (publicarDados || marcaMudou) ? "true" : "false");
  saida("abrir_issue", abrirIssue ? "true" : "false"); saida("titulo_issue", tituloIssue);
  console.log(`Censo SUAS · estado=${estado} | publicar dados=${publicarDados} | marca mudou=${marcaMudou} | abrir issue=${abrirIssue}${SIMULAR ? " (simulação: nada gravado)" : ""}\n${res.situacao.replace(/\*/g, "")}\nRelatório: ${ARQ_RELATORIO}`);
}

module.exports = { travas, comparar, sondarAno };

if(require.main === module) principal().catch(e => { console.error("ERRO inesperado:", e); saida("estado", "crash"); saida("publicar", "false"); saida("abrir_issue", "false"); process.exit(1); });
