/* Coleta dos três catálogos. Cada coletor devolve uma lista de
   {titulo, area, link, carga?, inst?} ou lança erro. Quem decide o que fazer com
   lista vazia ou pequena demais é o script principal. */
const { decodificarHtml, buscar, espera, emLotes } = require("./util");

/* ---------- Aprenda Mais (MEC) ----------
   As categorias de topo do portal guardam a turma em andamento; as turmas antigas
   ficam em "Turmas anteriores". Os cursos aparecem como "Título - Turma 2026B" e
   cada turma tem ids novos, por isso a turma vigente é descoberta a cada execução. */
const AM_BASE = "https://aprendamais.mec.gov.br";
const AM_AREAS = {   // categoria do portal -> área usada no site
  "ambiente e saude": "Saúde e Cuidados",
  "gestao e negocios": "Administração e Gestão",
  "informacao e comunicacao": "Tecnologia da Informação",
  "infraestrutura": "Construção e Manutenção",
  "producao alimenticia": "Alimentação",
  "recursos naturais": "Meio Ambiente e Agro",
  "turismo, hospitalidade e lazer": "Turismo e Hotelaria",
  // nomes das categorias do +IFMG
  "desenvolvimento de sistemas e ti": "Tecnologia da Informação",
  "saude": "Saúde e Cuidados",
  "meio ambiente": "Meio Ambiente e Agro"
  // demais categorias (exatas, humanas, educação, idiomas, cultura, segurança...) = "Outros"
};
const semAcento = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* O resumo do curso (info.php) é uma sequência "Rótulo: valor". Corta o valor de cada rótulo no
   começo do próximo (o espaço antes dos dois pontos varia: "Módulos : 04"). */
const AM_ROTULOS = ["Conclusão do curso", "Carga horária", "Prazo mínimo para obtenção do certificado", "Público-alvo", "Requisitos", "Módulos", "Metodologia", "Instituição", "Nível", "Idioma", "Informações"];
function lerResumoAM(texto){
  const i = texto.indexOf("Conclusão do curso");
  const t = i >= 0 ? texto.slice(i) : texto;
  const achados = [];
  for(const r of AM_ROTULOS){
    const m = t.match(new RegExp(r + "\\s*:"));
    if(m) achados.push({ r, ini: m.index, fimRotulo: m.index + m[0].length });
  }
  achados.sort((a, b) => a.ini - b.ini);
  const saida = {};
  achados.forEach((a, k) => {
    const fim = k + 1 < achados.length ? achados[k + 1].ini : Math.min(t.length, a.fimRotulo + 400);
    saida[a.r] = t.slice(a.fimRotulo, fim).trim().slice(0, 400);
  });
  return saida;
}

async function coletarAprendaMais({ minimoEsperado = 0 } = {}){
  const indice = await buscar(AM_BASE + "/course/index.php");
  if(indice.status !== 200) throw new Error("índice do Aprenda Mais respondeu HTTP " + indice.status);

  const nomes = {};
  for(const m of indice.texto.matchAll(/course\/index\.php\?categoryid=(\d+)">([^<]+)/g)){
    if(!nomes[m[1]]) nomes[m[1]] = decodificarHtml(m[2]);
  }
  const topo = [...new Set([...indice.texto.matchAll(/data-categoryid="(\d+)" data-depth="1"/g)].map(m => m[1]))]
    .filter(id => nomes[id] && !/^turmas anteriores/i.test(semAcento(nomes[id])));
  if(!topo.length) throw new Error("nenhuma categoria de topo encontrada no Aprenda Mais");

  const brutos = [];
  const paginas = await emLotes(topo, 3, async id => {
    const r = await buscar(AM_BASE + "/course/index.php?categoryid=" + id + "&perpage=500");
    if(r.status !== 200) throw new Error("categoria " + id + " respondeu HTTP " + r.status);
    return { id, texto: r.texto };
  });
  for(const { id, texto } of paginas){
    const area = AM_AREAS[semAcento(nomes[id])] || "Outros";
    for(const m of texto.matchAll(/coursename"><a class="aalink" href="[^"]*?course\/view\.php\?id=(\d+)">([^<]+)<\/a>/g)){
      const completo = decodificarHtml(m[2]);
      const t = completo.match(/^(.*?)\s+-\s+Turma\s+(\d{4})([AB])\s*$/i);
      brutos.push({
        titulo: t ? t[1].trim() : completo,
        turma: t ? t[2] + t[3].toUpperCase() : null,
        area,
        link: AM_BASE + "/course/view.php?id=" + m[1]
      });
    }
  }

  /* turma vigente = a mais recente que tenha tamanho de catálogo de verdade.
     Uma turma recém-aberta, ainda com poucos cursos, não derruba o catálogo. */
  const contagem = {};
  brutos.forEach(c => { if(c.turma) contagem[c.turma] = (contagem[c.turma] || 0) + 1; });
  const turmas = Object.keys(contagem).sort().reverse();
  if(!turmas.length) throw new Error("nenhuma turma identificada nos títulos do Aprenda Mais");
  const vigente = turmas.find(t => contagem[t] >= minimoEsperado * 0.8) || turmas[0];

  const vistos = new Set(), cursos = [];
  for(const c of brutos){
    if(c.turma !== vigente || vistos.has(c.link)) continue;
    vistos.add(c.link);
    cursos.push({ titulo: c.titulo, carga: "", area: c.area, link: c.link });
  }

  /* Carga horária REAL de cada curso: course/info.php (abre sem login). A listagem só traz o
     resumo inline para os primeiros cursos de cada categoria; os demais vêm "colapsados". */
  await emLotes(cursos, 4, async c => {
    try{
      const id = (c.link.match(/id=(\d+)/) || [])[1];
      const r = await buscar(AM_BASE + "/course/info.php?id=" + id, { tentativas: 3 });
      if(r.status === 200){
        const t = decodificarHtml(r.texto.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " "));
        const m = t.match(/Carga hor[aá]ria:\s*(\d+(?:[.,]\d+)?)/i);
        if(m) c.carga = m[1].replace(",", ".") + "h";
        const resumo = lerResumoAM(t);
        c.publico = resumo["Público-alvo"] || ""; c.requisitos = resumo["Requisitos"] || "";
      }
    }catch(_){ /* fica sem carga; a conferência abaixo decide se isso é grave */ }
    await espera(50);
  });
  const semCarga = cursos.filter(c => !c.carga).length;
  if(semCarga > cursos.length * 0.1)
    throw new Error("não foi possível ler a carga horária de " + semCarga + " dos " + cursos.length + " cursos (course/info.php)");

  return { cursos, detalhe: "turma " + vigente + (turmas[0] !== vigente ? " (a " + turmas[0] + " ainda está incompleta)" : "") };
}

/* ---------- Escola Virtual de Governo ---------- */
/* Desde out/2026 o site da EVG é um aplicativo (a página chega vazia, sem cursos). O próprio site oferece
   a exportação do catálogo em CSV (escolavirtual.gov.br/catalogo/exportar/csv leva a este endereço):
   campos separados por "|", com ID, nome, conteudista, carga horária e tipo de oferta.
   "Curso Exclusivo" (restrito a um órgão) não entra. A página do curso é /cursos/<id>. */
const EVG_BASE = "https://www.escolavirtual.gov.br";
const EVG_CSV = "https://api-evg.enap.gov.br/v1/cursos/exportar/csv";
function lerCsvSeparador(texto, sep){
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for(let i = 0; i < texto.length; i++){
    const ch = texto[i];
    if(aspas){
      if(ch === '"' && texto[i + 1] === '"'){ campo += '"'; i++; }
      else if(ch === '"') aspas = false;
      else campo += ch;
    }else if(ch === '"' && campo === "") aspas = true;
    else if(ch === sep){ linha.push(campo); campo = ""; }
    else if(ch === "\n" || ch === "\r"){
      if(ch === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if(linha.some(c => c !== "")) linhas.push(linha);
      linha = [];
    }else campo += ch;
  }
  linha.push(campo);
  if(linha.some(c => c !== "")) linhas.push(linha);
  return linhas;
}
function lerCatalogoEVG(texto){
  const linhas = lerCsvSeparador(String(texto).replace(/^﻿/, ""), "|");
  const cab = (linhas[0] || []).map(c => semAcento(c).trim());
  const col = nome => cab.findIndex(c => c.startsWith(nome));
  const iId = col("id do curso"), iNome = col("nome do curso"), iCont = col("conteudista"), iCarga = col("carga horaria"), iTipo = col("tipo de oferta");
  if([iId, iNome, iCarga].some(i => i < 0)) throw new Error("o CSV da EVG mudou de colunas (cabeçalho: " + (linhas[0] || []).join(" | ").slice(0, 200) + ")");
  const cursos = [], vistos = new Set();
  for(const l of linhas.slice(1)){
    const id = (l[iId] || "").trim(), titulo = (l[iNome] || "").replace(/\s+/g, " ").trim();
    if(!/^\d+$/.test(id) || !titulo || vistos.has(id)) continue;
    if(iTipo >= 0 && /exclusiv/i.test(l[iTipo] || "")) continue;
    vistos.add(id);
    const carga = (l[iCarga] || "").trim();
    cursos.push({ titulo, inst: iCont >= 0 ? (l[iCont] || "").trim() : "", carga: carga ? cargaH(carga) : "", area: "Outros", link: EVG_BASE + "/cursos/" + id });
  }
  return cursos;
}
async function coletarEVG(){
  const r = await buscar(EVG_CSV, { timeoutMs: 120000 });
  if(r.status !== 200) throw new Error("a exportação do catálogo da EVG respondeu HTTP " + r.status);
  const cursos = lerCatalogoEVG(r.texto);
  return { cursos, detalhe: cursos.length + " cursos abertos no catálogo oficial (CSV)" };
}

/* ---------- Escola Virtual · Fundação Bradesco ---------- */
const EV_BASE = "https://www.ev.org.br";
async function coletarBradesco(){
  const cursos = [], vistos = new Set();
  for(let p = 1; p <= 60; p++){
    const r = await buscar(EV_BASE + "/cursos?pagina=" + p);
    if(r.status !== 200) throw new Error("Bradesco página " + p + " respondeu HTTP " + r.status);
    const blocos = r.texto.split('<article class="m-card').slice(1);
    let novos = 0;
    for(const b of blocos){
      const link = b.match(/class="m-card_link" href="(\/cursos\/[^"?#]+)"/);
      const titulo = b.match(/<h3 class="m-card_title"[^>]*>([\s\S]*?)<\/h3>/);
      if(!link || !titulo) continue;
      const url = EV_BASE + decodificarHtml(link[1]);
      if(vistos.has(url)) continue;
      vistos.add(url); novos++;
      const carga = b.match(/Dura[çc][ãa]o\s*<strong>\s*([^<]*?)\s*<\/strong>/);
      cursos.push({ titulo: decodificarHtml(titulo[1].replace(/<[^>]*>/g, "")), carga: carga ? decodificarHtml(carga[1]) : "", area: "Outros", link: url });
    }
    if(!novos) break;
    await espera(150);
  }
  return { cursos, detalhe: cursos.length + " cursos no catálogo público" };
}

/* ---------- Institutos Federais com plataforma própria ----------
   Só metadados públicos (título, carga horária, link), sem login: o conteúdo dos cursos
   fica na plataforma de origem, o portal apenas aponta para ela. */
const cargaH = texto => { const m = String(texto || "").match(/\d+(?:[.,]\d+)?/); return m ? m[0].replace(",", ".") + "h" : ""; };

/* +IFMG: Moodle (tema Moove desde out/2026) com busca que devolve todos os cursos numa página.
   Cada curso é um cartão `data-region="course-content" data-course-id="N"`, com a categoria em
   `course-category`, o título no link `coursename` e campos como "Curso gratuito: Sim".
   Carga, "gratuito" e "certificado" ficam em course/info.php. Curso que diz explicitamente
   "Gratuito: não" ou "Certificado: não" não entra. */
const IFMG_BASE = "https://mais.ifmg.edu.br/maisifmg";
function lerCartoesIFMG(html){
  const saida = [];
  for(const b of html.split(/<div class="card dashboard-card[^"]*"[^>]*data-region="course-content"/).slice(1)){
    const id = (b.match(/^[^>]*data-course-id="(\d+)"/) || [])[1];
    const titulo = b.match(/<a [^>]*class="aalink coursename[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if(!id || !titulo) continue;
    const cat = (b.match(/<div class="course-category">([\s\S]*?)<\/div>/) || [])[1];
    const gratuito = (b.match(/customfield_eh_gratuito[\s\S]*?customfieldvalue">([^<]*)/) || [])[1];
    saida.push({ id, titulo: decodificarHtml(titulo[1].replace(/<[^>]*>/g, "")), categoria: cat ? decodificarHtml(cat.replace(/<[^>]*>/g, "")) : "",
                 pago: /^\s*n[aã]o\s*$/i.test(gratuito || "") });
  }
  return saida;
}
async function coletarIFMG(){
  const porId = new Map();
  for(const termo of ["a", "e", "o"]){   // a busca casa com título/resumo: a união de três termos evita perder curso
    const r = await buscar(IFMG_BASE + "/course/search.php?search=" + termo + "&perpage=500");
    if(r.status !== 200) throw new Error("busca do +IFMG respondeu HTTP " + r.status);
    for(const c of lerCartoesIFMG(r.texto)) if(!c.pago && !porId.has(c.id)) porId.set(c.id, c);
    await espera(200);
  }
  if(!porId.size) throw new Error("a busca do +IFMG não trouxe nenhum cartão de curso (o site mudou o formato?)");
  const brutos = [...porId.values()];
  const cursos = [];
  await emLotes(brutos, 4, async c => {
    let t = "";
    try{ t = decodificarHtml((await buscar(IFMG_BASE + "/course/info.php?id=" + c.id, { tentativas: 2 })).texto.replace(/<[^>]*>/g, " ")); }catch(_){ /* sem info */ }
    await espera(60);
    const campo = nome => (t.match(new RegExp(nome + "\\s*:\\s*(\\S+)", "i")) || [])[1] || "";
    if(/^n[aã]o$/i.test(campo("Gratuito")) || /^n[aã]o$/i.test(campo("Certificado"))) return;
    cursos.push({ id: +c.id, titulo: c.titulo, carga: cargaH((t.match(/Dura[çc][ãa]o\s*:\s*([^\n]*?)(?=\s+[ÁA]rea|$)/) || [])[1]),
                  area: AM_AREAS[semAcento(c.categoria)] || "Outros", link: IFMG_BASE + "/course/view.php?id=" + c.id });
  });
  cursos.sort((a, b) => a.id - b.id).forEach(c => delete c.id);
  return { cursos, detalhe: cursos.length + " cursos" };
}

/* Mundi (IFSul): uma única página HTML estática lista todos os cursos, com a duração. */
const MUNDI_BASE = "https://mundi.ifsul.edu.br/portal/";
async function coletarMundi(){
  const r = await buscar(MUNDI_BASE);
  if(r.status !== 200) throw new Error("Mundi respondeu HTTP " + r.status);
  const cursos = [], vistos = new Set();
  for(const b of r.texto.split(/<li class="item thumb/).slice(1)){
    const a = b.match(/<h4 class="post-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if(!a) continue;
    const link = new URL(a[1], MUNDI_BASE).href;
    if(vistos.has(link)) continue;
    vistos.add(link);
    const dur = (b.match(/mundi-unit"[^>]*>\s*(\d+\s*h[^<]*)</) || [])[1];
    const agro = /ciencias_agrarias/.test((b.match(/^([^"]*)"/) || [])[1] || "");
    cursos.push({ titulo: decodificarHtml(a[2].replace(/<[^>]*>/g, "")), carga: cargaH(dur), area: agro ? "Meio Ambiente e Agro" : "Outros", link });
  }
  return { cursos, detalhe: cursos.length + " cursos" };
}

module.exports = { coletarAprendaMais, coletarEVG, coletarBradesco, coletarIFMG, coletarMundi };
