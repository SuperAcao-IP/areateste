/* Coleta de UNIDADES de ensino presencial (Senac-SP e Senai-SP), sem login.
   Só interessam as cidades dos 47 municípios e suas vizinhas (ver cidades.js).
   Cuidado com o firewall do Senac: poucas requisições, 1 por segundo, e para no 403
   (um IP já foi bloqueado depois de ~3.000 requisições em 10 minutos). */
const { decodificarHtml, buscar, espera } = require("./util");
const { decidir } = require("./regras");

const SENAC = "https://www.sp.senac.br";
const API_BUSCA = SENAC + "/o/senacsearch/keywords-v2/curso/20102/20125/curso/";
const API_DETALHE = SENAC + "/o/senac-content-services/cursosInfoDetalhe/20125/";
const MAX_DETALHES = 25;          // teto de chamadas de detalhe por execução

async function getJson(url){
  await espera(1100);
  const r = await buscar(url, { tentativas: 2, timeoutMs: 40000 });
  if(r.status === 403) throw new Error("Senac respondeu 403 (firewall): parei para não piorar o bloqueio");
  if(r.status !== 200) throw new Error("Senac respondeu HTTP " + r.status + " em " + url);
  try{ return JSON.parse(r.texto); }catch(_){ throw new Error("Senac devolveu resposta que não é JSON em " + url); }
}

const tituloCurto = t => String(t || "").replace(/\s+/g, " ").trim();
/* coordenada com sinal (o leitor de carga abaixo ignora o "-") */
const coordenada = x => { const n = parseFloat(String(x == null ? "" : x).replace(",", ".")); return isNaN(n) ? null : n; };
const numeroDe = x => { const m = String(x == null ? "" : x).match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; };

/* ---------- Senac-SP: cursos com bolsa (PSG) e as unidades que os oferecem ---------- */
async function coletarSenac({ interessam, norm }){
  // 1) todos os cursos com bolsa (páginas de 50)
  const cursos = [];
  for(let ini = 0; ini < 300; ini += 50){
    const j = await getJson(API_BUSCA + ini + "/" + (ini + 50) + "?turmasBolsa=true");
    const lote = j.cursos || [];
    cursos.push(...lote);
    if(lote.length < 50) break;
  }
  if(!cursos.length) throw new Error("o Senac não devolveu nenhum curso com bolsa");

  // 2) fica com o que serve ao público: presencial, curso livre, 15h ou mais, tema aceito pelas regras
  const aceitos = [];
  for(const c of cursos){
    const v = c.vocabularios || {};
    const formato = (v.formato || []).join(" ");
    const tipo = (v["tipo de curso"] || []).join(" ");
    const ch = numeroDe(c.cargaHorariaTotalFT);
    const titulo = tituloCurto((c.title_pt_BR || [])[0]);
    if(!/presencial/i.test(formato) || !/livre/i.test(tipo)) continue;
    if(ch != null && ch < 15) continue;
    if(decidir(titulo).d !== "manter") continue;
    aceitos.push({ titulo, ch, link: SENAC + "/" + String(c.url || "").replace(/^\//, ""), id: (c.articleId || [])[0], unidades: ((c.dadosOferta || {}).unidades || []).map(u => u.toLowerCase().trim()) });
  }

  // 3) coordenadas e endereço das unidades: o detalhe do curso traz isso, por unidade.
  //    Chama o detalhe só dos cursos necessários para conhecer todas as unidades (guloso).
  const conhecidas = new Map();     // nome em minúsculas -> unidade
  const precisa = new Set(aceitos.flatMap(a => a.unidades));
  const usados = new Set();
  let chamadas = 0;
  while([...precisa].some(u => !conhecidas.has(u)) && chamadas < MAX_DETALHES){
    let melhor = null, ganho = 0;
    for(const a of aceitos){
      if(usados.has(a.id)) continue;
      const g = a.unidades.filter(u => !conhecidas.has(u)).length;
      if(g > ganho){ ganho = g; melhor = a; }
    }
    if(!melhor) break;
    usados.add(melhor.id); chamadas++;
    const d = await getJson(API_DETALHE + melhor.id + "?inscricaoAberta=false&bolsaAberta=true&buscarUnidadesComOferta=true");
    for(const u of d.unidadesComOferta || []){
      const nome = tituloCurto(u.nomeUnidade);
      conhecidas.set(nome.toLowerCase(), {
        cod: u.codigoUnidade, nome, rua: tituloCurto(u.enderecoUnidade), numero: tituloCurto(u.numEnderecoUnidade), bairro: tituloCurto(u.bairroUnidade),
        cidade: tituloCurto(u.cidadeUnidade), cep: tituloCurto(u.cepUnidade), lat: coordenada(u.latitudeUnidade), lon: coordenada(u.longitudeUnidade),
        pagina: u.paginaAssociada ? SENAC + u.paginaAssociada : ""
      });
    }
  }

  // 4) monta as unidades (só das cidades que interessam) com a lista de cursos de cada uma
  const porUnidade = new Map();
  for(const a of aceitos){
    for(const nomeU of a.unidades){
      const u = conhecidas.get(nomeU);
      if(!u || !interessam.has(norm(u.cidade))) continue;
      if(u.lat == null || u.lon == null) continue;
      if(!porUnidade.has(u.cod)) porUnidade.set(u.cod, { ...u, cursos: [] });
      porUnidade.get(u.cod).cursos.push({ n: a.titulo, ch: a.ch, l: a.link });
    }
  }
  const unidades = [...porUnidade.values()].map(u => ({
    id: "senac-" + u.cod, inst: "Senac", nome: "Senac " + u.nome,
    endereco: [u.rua, u.numero].filter(Boolean).join(", ") + (u.bairro ? " – " + u.bairro : ""), cidade: u.cidade,
    lat: u.lat, lon: u.lon, link: u.pagina, psg: true,
    cursos: u.cursos.sort((x, y) => x.n.localeCompare(y.n, "pt-BR"))
  }));
  return {
    unidades,
    detalhe: `${cursos.length} cursos com bolsa, ${aceitos.length} aceitos (presencial, livre, 15h+, tema ok), ${conhecidas.size} unidades conhecidas via ${chamadas} detalhes, ${unidades.length} nas cidades de interesse`
  };
}

/* ---------- Senac-SP: lista COMPLETA de unidades (inclusive as sem curso com bolsa) ----------
   Cada página /senac-xxx tem nome, endereço e um link do Google Maps com @lat,lon. Serve para casar
   as linhas "SENAC" da planilha com uma unidade, mesmo onde não há bolsa aberta agora. */
async function coletarSenacUnidades({ interessam, norm }){
  const lista = await buscar(SENAC + "/unidades", { tentativas: 3, timeoutMs: 40000 });
  if(lista.status !== 200) throw new Error("lista de unidades do Senac respondeu HTTP " + lista.status);
  const slugs = [...new Set((lista.texto.match(/sp\.senac\.br\/senac-[a-z0-9-]+/gi) || []).map(x => x.split("/").pop()))];
  if(!slugs.length) throw new Error("nenhuma unidade encontrada na lista do Senac");
  const unidades = [];
  let semPagina = 0;
  for(const slug of slugs){
    await espera(1000);
    let r;
    try{ r = await buscar(SENAC + "/" + slug, { tentativas: 2, timeoutMs: 40000 }); }catch(_){ semPagina++; continue; }
    if(r.status === 403) throw new Error("Senac respondeu 403 (firewall): parei para não piorar o bloqueio");
    if(r.status !== 200){ semPagina++; continue; }
    const t = r.texto;
    const nome = (t.match(/<h1 class="ssp-header-unidade__title">\s*([^<]+?)\s*<\/h1>/) || [])[1];
    const cod = (t.match(/id="codUnidadeReferencia"[^>]*>\s*(\d+)\s*</) || [])[1];
    const end = t.match(/<address class="ssp-header-unidade__endereco">\s*([^<]*?)\s*<br\s*\/?>\s*([^<]*?)\s*<\/address>/);
    if(!nome || !cod || !end){ semPagina++; continue; }
    const l2 = decodificarHtml(end[2]).match(/^(.*?),\s*([^,]+?)\s*-\s*SP,?\s*([\d-]*)/);
    const cidade = l2 ? l2[2].trim() : "";
    if(!interessam.has(norm(cidade))) continue;
    const xy = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    unidades.push({
      id: "senac-" + cod, inst: "Senac", nome: "Senac " + decodificarHtml(nome),
      endereco: decodificarHtml(end[1]) + (l2 && l2[1] ? " – " + l2[1].trim() : ""), cidade, cep: l2 ? l2[3] : "",
      lat: xy ? coordenada(xy[1]) : null, lon: xy ? coordenada(xy[2]) : null,
      link: SENAC + "/" + slug, psg: false, cursos: []
    });
  }
  return { unidades, detalhe: `${slugs.length} páginas de unidade, ${unidades.length} nas cidades de interesse, ${semPagina} sem página legível` };
}

/* ---------- Senai-SP: unidades (endereço em texto; coordenadas vêm da geocodificação) ---------- */
function separarEnderecoSenai(texto){
  // "Rua Ari Barroso, 305 - Presidente Altino - Osasco/SP"
  const partes = decodificarHtml(texto).split(/\s+-\s+/).map(s => s.trim());
  const cidadeUf = (partes.pop() || "").replace(/\/\s*[A-Z]{2}$/, "").trim();
  const ruaNum = partes.shift() || "";
  const bairro = partes.join(" – ");
  const m = ruaNum.match(/^(.*?),\s*(\S+)$/);
  return { rua: m ? m[1].trim() : ruaNum.trim(), numero: m ? m[2].trim() : "", bairro, cidade: cidadeUf };
}

async function coletarSenai({ interessam, norm }){
  const lista = await buscar("https://www.sp.senai.br/unidades", { tentativas: 3, timeoutMs: 40000 });
  if(lista.status !== 200) throw new Error("lista de unidades do Senai respondeu HTTP " + lista.status);
  const slugs = [...new Set((lista.texto.match(/sp\.senai\.br\/unidade\/[a-z0-9_-]+/gi) || []).map(x => x.split("/").pop()))];
  if(!slugs.length) throw new Error("nenhuma unidade encontrada na lista do Senai");
  const unidades = [];
  let semEndereco = 0;
  for(const slug of slugs){
    await espera(1000);
    let r;
    try{ r = await buscar("https://www.sp.senai.br/unidade/" + slug + "/", { tentativas: 2, timeoutMs: 40000 }); }catch(_){ continue; }
    if(r.status !== 200) continue;
    const nome = (r.texto.match(/<title>\s*([^<]+?)\s*<\/title>/i) || [])[1];
    const end = (r.texto.match(/Endere(?:&#xE7;|ç|&ccedil;)o:\s*([^<\r\n]+)/i) || [])[1];
    if(!end){ semEndereco++; continue; }
    const a = separarEnderecoSenai(end);
    if(!interessam.has(norm(a.cidade))) continue;
    const cep = (r.texto.match(/CEP:\s*([\d-]+)/) || [])[1] || "";
    unidades.push({
      id: "senai-" + slug, inst: "Senai", nome: decodificarHtml(nome || "SENAI " + a.cidade).replace(/\s*[|–-]\s*SENAI.*$/i, "").trim(),
      rua: a.rua, numero: a.numero, bairro: a.bairro, cidade: a.cidade, cep, link: "https://www.sp.senai.br/unidade/" + slug + "/", cursos: []
    });
  }
  return { unidades, detalhe: `${slugs.length} unidades na lista, ${unidades.length} nas cidades de interesse, ${semEndereco} sem endereço na página` };
}

module.exports = { coletarSenac, coletarSenacUnidades, coletarSenai, separarEnderecoSenai };
