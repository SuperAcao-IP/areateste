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
    cursos.push({ titulo: c.titulo, area: c.area, link: c.link });
  }
  return { cursos, detalhe: "turma " + vigente + (turmas[0] !== vigente ? " (a " + turmas[0] + " ainda está incompleta)" : "") };
}

/* ---------- Escola Virtual de Governo ---------- */
const EVG_BASE = "https://www.escolavirtual.gov.br";
async function coletarEVG(){
  const cursos = [], vistos = new Set();
  for(let p = 1; p <= 200; p++){
    const r = await buscar(EVG_BASE + "/catalogo?page=" + p);
    if(r.status !== 200) throw new Error("EVG página " + p + " respondeu HTTP " + r.status);
    const blocos = r.texto.split('<div class="card" id="curso').slice(1);
    if(!blocos.length) break;
    for(const b of blocos){
      const id = b.match(/^(\d+)"/);
      const titulo = b.match(/<h3 class="card-title">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/);
      if(!id || !titulo || vistos.has(id[1])) continue;
      vistos.add(id[1]);
      const inst = b.match(/<dt>Conteudista:<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
      const carga = b.match(/<dt>Carga Hor[^<]*<\/dt>\s*<dd>\s*([^<]*?)\s*<\/dd>/);
      cursos.push({
        titulo: decodificarHtml(titulo[1].replace(/<[^>]*>/g, "")),
        inst: inst ? decodificarHtml(inst[1].replace(/<[^>]*>/g, "")) : "",
        carga: carga ? decodificarHtml(carga[1]) : "",
        area: "Outros",
        link: EVG_BASE + "/curso/" + id[1]
      });
    }
    await espera(150);
  }
  return { cursos, detalhe: cursos.length + " cursos no catálogo público" };
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

/* +IFMG: Moodle com busca que devolve todos os cursos numa página. Carga, "gratuito" e
   "certificado" ficam em course/info.php. Curso que diz explicitamente "Gratuito: não" ou
   "Certificado: não" não entra. */
const IFMG_BASE = "https://mais.ifmg.edu.br/maisifmg";
async function coletarIFMG(){
  const porId = new Map();
  for(const termo of ["a", "e", "o"]){   // a busca casa com título/resumo: a união de três termos evita perder curso
    const r = await buscar(IFMG_BASE + "/course/search.php?search=" + termo + "&perpage=500");
    if(r.status !== 200) throw new Error("busca do +IFMG respondeu HTTP " + r.status);
    for(const b of r.texto.split('<div class="top_courses ccnWithFoot">').slice(1)){
      const cat = (b.match(/<div class="tag">([^<]*)/) || [])[1];
      const m = b.match(/<a href="[^"]*course\/view\.php\?id=(\d+)"><h5>([\s\S]*?)<\/h5>/);
      if(m && !porId.has(m[1])) porId.set(m[1], { id: m[1], titulo: decodificarHtml(m[2].replace(/<[^>]*>/g, "")), categoria: cat ? decodificarHtml(cat) : "" });
    }
    await espera(200);
  }
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
