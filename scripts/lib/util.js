/* Utilidades compartilhadas pelo script de atualização dos catálogos.
   Node 18+, sem dependências. */

/* Mesma regra de js/config.js (normalizarTitulo): se mudar uma, mude a outra. */
function normalizarTitulo(t){
  return String(t == null ? "" : t)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+-\s+turmas?\s+\d{4}[ab]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTIDADES = { amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:" " };
function decodificarHtml(s){
  return String(s == null ? "" : s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const espera = ms => new Promise(r => setTimeout(r, ms));

/* GET com timeout e novas tentativas. Devolve {status, url, texto}.
   Erro de rede ou 5xx: tenta de novo. 4xx: devolve na hora (quem chama decide). */
async function buscar(url, { tentativas = 3, timeoutMs = 30000 } = {}){
  let ultimoErro;
  for(let i = 1; i <= tentativas; i++){
    try{
      const r = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "Mozilla/5.0 (compatible; SuperAcaoSP-catalogos/1.0)", "accept-language": "pt-BR,pt;q=0.9" }
      });
      if(r.status >= 500 && i < tentativas){ ultimoErro = new Error("HTTP " + r.status); await espera(1500 * i); continue; }
      return { status: r.status, url: r.url, texto: await r.text() };
    }catch(e){
      ultimoErro = e;
      if(i < tentativas) await espera(1500 * i);
    }
  }
  throw new Error("falha ao buscar " + url + ": " + (ultimoErro && ultimoErro.message));
}

/* Executa tarefas com no máximo N em paralelo, preservando a ordem dos resultados. */
async function emLotes(itens, limite, fn){
  const saida = new Array(itens.length);
  let proximo = 0;
  async function trabalhador(){
    while(proximo < itens.length){
      const i = proximo++;
      saida[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

module.exports = { normalizarTitulo, decodificarHtml, espera, buscar, emLotes };
