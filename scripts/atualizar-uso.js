#!/usr/bin/env node
/* Uso semanal do portal (linha do tempo da aba "Visão geral" do painel).

   O Worker de estatísticas (o mesmo que o painel usa, /dash) só devolve totais de um período ("últimos N dias").
   Todo domingo este script guarda os números AGREGADOS da semana em dados/uso-semanal.json:
     sessões, eventos (buscas, cliques...), buscas por município, buscas sem resultado por município × área e os
     cursos mais clicados. Nada de e-mail, IP ou identificador: é o mesmo que o painel já mostra, guardado por semana.
   Na primeira execução (ou com --reconstruir), reconstrói as últimas 52 semanas subtraindo janelas: semana k =
   dias(7k) − dias(7(k−1)). Totais e contagens ficam exatos; "sessões" é aproximado (uma sessão que atravessa duas
   semanas conta nas duas) e listas que o Worker corta (top N) podem faltar nas semanas antigas. Essas semanas ficam
   marcadas com "aproximado": true.

   Precisa da chave do painel: variável de ambiente PAINEL_CHAVE (no GitHub, Secret PAINEL_CHAVE). Sem ela, avisa e
   termina sem erro.
   Uso: PAINEL_CHAVE=... node scripts/atualizar-uso.js [--reconstruir] [--simular] */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ARQ = path.join(RAIZ, "dados", "uso-semanal.json");
const API = "https://superacao-analytics.beatrizgribas.workers.dev";   // o mesmo endereço de painel.html
const args = process.argv.slice(2);
const SIMULAR = args.includes("--simular");
const RECONSTRUIR = args.includes("--reconstruir");
const SEMANAS_RECONSTRUIR = 52;
const CHAVE = process.env.PAINEL_CHAVE || "";
const agora = Date.now() - 3 * 3600 * 1000;   // horário de Brasília
const dataISO = ms => new Date(ms).toISOString().slice(0, 10);
const saida = (k, v) => { if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function dash(dias){
  const r = await fetch(`${API}/dash?k=${encodeURIComponent(CHAVE)}&dias=${dias}`, { signal: AbortSignal.timeout(60000) });
  if(r.status === 401) throw new Error("o Worker recusou a chave (PAINEL_CHAVE não confere)");
  if(!r.ok) throw new Error(`o Worker respondeu HTTP ${r.status} para dias=${dias}`);
  return r.json();
}

/* resposta do /dash -> números da janela */
function janela(j){
  const eventos = {}, sessoesPorEv = {};
  (j.resumo || []).forEach(x => { eventos[x.ev] = x.total || 0; sessoesPorEv[x.ev] = x.sessoes || 0; });
  const cidades = {}; (j.cidades || []).forEach(x => { if(x.cidade) cidades[x.cidade] = (cidades[x.cidade] || 0) + (x.buscas || 0); });
  const lacunas = {}; (j.lacunas || []).forEach(x => { const k = (x.cidade || "?") + "|" + (x.area || "?"); lacunas[k] = (lacunas[k] || 0) + (x.vezes || 0); });
  const cursos = {}; (j.cursos || []).forEach(x => { const k = (x.item || "Sem nome") + "|" + (x.fonte || ""); cursos[k] = (cursos[k] || 0) + (x.cliques || 0); });
  return { sessoes: sessoesPorEv.visitou || 0, eventos, cidades, lacunas, cursos };
}
/* a − b, campo a campo, sem negativos */
const menos = (a, b) => { const o = {}; Object.keys(a).forEach(k => { const v = (a[k] || 0) - ((b && b[k]) || 0); if(v > 0) o[k] = v; }); return o; };
function semana(fimMs, atual, anterior, aproximado){
  const d = anterior ? {
    sessoes: Math.max(0, atual.sessoes - anterior.sessoes), eventos: menos(atual.eventos, anterior.eventos),
    cidades: menos(atual.cidades, anterior.cidades), lacunas: menos(atual.lacunas, anterior.lacunas), cursos: menos(atual.cursos, anterior.cursos)
  } : atual;
  const lacunas = Object.entries(d.lacunas).map(([k, v]) => { const [cidade, area] = k.split("|"); return { cidade, area, vezes: v }; }).sort((x, y) => y.vezes - x.vezes);
  const cursos = Object.entries(d.cursos).map(([k, v]) => { const [item, fonte] = k.split("|"); return { item, fonte, cliques: v }; }).sort((x, y) => y.cliques - x.cliques).slice(0, 20);
  return { inicio: dataISO(fimMs - 6 * 864e5), fim: dataISO(fimMs), aproximado: !!aproximado, sessoes: d.sessoes, eventos: d.eventos, cidades: d.cidades, lacunas, cursos };
}

function ler(){ return fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, "utf8")) : { semanas: [] }; }
function gravar(semanas){
  semanas.sort((a, b) => a.fim.localeCompare(b.fim));
  const texto = "{\n" +
    ` "atualizado": ${JSON.stringify(dataISO(agora))},\n` +
    ` "explicacao": ${JSON.stringify("Uso do portal por semana, só números agregados (sem e-mail, IP ou identificador). Gerado por scripts/atualizar-uso.js a partir do Worker de estatísticas. aproximado = semana reconstruída por diferença de janelas (sessões aproximadas).")},\n` +
    ` "semanas": [\n` + semanas.map(s => "  " + JSON.stringify(s)).join(",\n") + "\n ]\n}\n";
  if(!SIMULAR) fs.writeFileSync(ARQ, texto, "utf8");
  return texto.length;
}

async function main(){
  if(!CHAVE){
    console.log("PAINEL_CHAVE não configurada: nada a fazer. No GitHub: Settings → Secrets → Actions → PAINEL_CHAVE (a chave do painel).");
    saida("sem_chave", "true");
    return;
  }
  const hist = ler();
  let semanas = hist.semanas || [];
  if(RECONSTRUIR || !semanas.length){
    console.log(`Reconstruindo as últimas ${SEMANAS_RECONSTRUIR} semanas por diferença de janelas…`);
    const janelas = [];
    for(let k = 1; k <= SEMANAS_RECONSTRUIR; k++){ janelas.push(janela(await dash(7 * k))); await new Promise(r => setTimeout(r, 300)); }
    const novas = [];
    for(let k = 1; k <= SEMANAS_RECONSTRUIR; k++){
      const s = semana(agora - (k - 1) * 7 * 864e5, janelas[k - 1], k > 1 ? janelas[k - 2] : null, k > 1);
      if(k > 1 && !Object.keys(s.eventos).length && !s.sessoes) continue;   // antes de o portal existir: semana vazia não entra
      novas.push(s);
    }
    const porFim = new Map(semanas.map(s => [s.fim, s]));
    novas.forEach(s => { if(!porFim.has(s.fim) || porFim.get(s.fim).aproximado) porFim.set(s.fim, s); });
    semanas = [...porFim.values()];
  }else{
    const s = semana(agora, janela(await dash(7)), null, false);
    semanas = semanas.filter(x => x.fim !== s.fim).concat([s]);
  }
  const tam = gravar(semanas);
  const ult = semanas[semanas.length - 1];
  console.log(`Uso semanal: ${semanas.length} semanas (${Math.round(tam / 1024)} KB). Última: ${ult.inicio} a ${ult.fim}, ${ult.sessoes} sessões, ${Object.keys(ult.cidades).length} municípios.${SIMULAR ? " (simulação: nada gravado)" : ""}`);
  saida("semanas", semanas.length);
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
