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
    const codigo = (r.texto.match(/href="\/cursos\?unidade=(\d+)"/) || [])[1] || "";   // botão "Conheça nossos cursos"
    unidades.push({
      id: "senai-" + slug, inst: "Senai", nome: decodificarHtml(nome || "SENAI " + a.cidade).replace(/\s*[|–-]\s*SENAI.*$/i, "").trim(),
      rua: a.rua, numero: a.numero, bairro: a.bairro, cidade: a.cidade, cep, link: "https://www.sp.senai.br/unidade/" + slug + "/", codigo, cursos: []
    });
  }
  return { unidades, detalhe: `${slugs.length} unidades na lista, ${unidades.length} nas cidades de interesse, ${semEndereco} sem endereço na página` };
}

/* ---------- Senai-SP: cursos presenciais GRATUITOS de cada unidade ----------
   A lista pública "Conheça nossos cursos" da unidade aceita os mesmos filtros da página (só GET, sem login):
     /cursos/0/0?unidade=COD&modalidade=1&gratuito=1&pag=N    (modalidade 1 = presencial)
   Cada cartão traz o tipo (Cursos Livres, Cursos Técnicos, Aprendiz SENAI), o título, a carga e o link /curso/<slug>/<id>.
   Ficam só os CURSOS LIVRES (técnico exige ensino médio; aprendizagem é só para aprendiz contratado), com 15h ou
   mais e tema aceito pelas regras de público (scripts/lib/regras.js). 1 requisição por segundo. */
const SENAI = "https://www.sp.senai.br";
function lerCartoesSenai(html){
  const ini = html.indexOf("CURSOS DESK"), fim = html.indexOf("CURSOS MOBILE");   // a versão de celular repete os cartões
  const trecho = ini >= 0 ? html.slice(ini, fim > ini ? fim : html.length) : html;
  const saida = [];
  for(const b of trecho.split('<div class="card">').slice(1)){
    const u = b.match(/https:\/\/www\.sp\.senai\.br\/curso\/([a-z0-9-]+)\/(\d+)/);
    if(!u) continue;
    const textos = b.replace(/<[^>]*>/g, "|").split("|").map(s => decodificarHtml(s)).filter(Boolean);
    const ch = (textos.join(" | ").match(/Carga hor[aá]ria:\s*\|?\s*(\d+)\s*hora/i) || [])[1];
    saida.push({ id: u[2], modalidade: textos[0] || "", tipo: textos[1] || "", titulo: tituloCurto(textos[3] || ""), ch: ch ? +ch : null,
                 link: SENAI + "/curso/" + u[1] + "/" + u[2] });
  }
  return saida;
}
async function coletarSenaiCursos(unidades){
  let paginas = 0, vistos = 0, semCodigo = 0;
  for(const u of unidades){
    if(!u.codigo){ semCodigo++; continue; }
    const porId = new Map();
    for(let pag = 1; pag <= 10; pag++){
      await espera(1100);
      const r = await buscar(`${SENAI}/cursos/0/0?unidade=${u.codigo}&modalidade=1&gratuito=1&pag=${pag}`, { tentativas: 2, timeoutMs: 40000 });
      paginas++;
      if(r.status !== 200) throw new Error("lista de cursos do Senai respondeu HTTP " + r.status + " (unidade " + u.codigo + ")");
      const cartoes = lerCartoesSenai(r.texto);
      const novos = cartoes.filter(c => !porId.has(c.id));
      novos.forEach(c => porId.set(c.id, c));
      const ultima = Math.max(0, ...[...r.texto.matchAll(/GetQueryString\(9,\s*(\d+)/g)].map(m => +m[1]));
      if(!novos.length || pag >= ultima) break;
    }
    vistos += porId.size;
    u.cursos = [...porId.values()]
      .filter(c => /presencial/i.test(c.modalidade) && /cursos livres/i.test(c.tipo))
      .filter(c => c.ch == null || c.ch >= 15)
      .filter(c => decidir(c.titulo).d === "manter")
      .map(c => ({ n: c.titulo, ch: c.ch, l: c.link }))
      .sort((x, y) => x.n.localeCompare(y.n, "pt-BR"));
  }
  const aceitos = unidades.reduce((a, u) => a + (u.cursos || []).length, 0);
  return { detalhe: `${paginas} páginas de curso lidas, ${vistos} cursos presenciais gratuitos vistos, ${aceitos} aceitos (curso livre, 15h+, tema ok)` +
                    (semCodigo ? `, ${semCodigo} unidades sem o código da lista de cursos` : "") };
}

module.exports = { coletarSenac, coletarSenacUnidades, coletarSenai, coletarSenaiCursos, lerCartoesSenai, separarEnderecoSenai };
