/* =====================================================================
   CONECTORES  ·  as cinco fontes externas de cursos e vagas
   Trampolim SP (cursos e vagas) · Sebrae SP · planilha (cursos e vagas)
   As URLs e as flags de liga/desliga estao em js/config.js.
   ===================================================================== */
/* ============================================================
   INTEGRACAO TRAMPOLIM SP  ·  cursos ao vivo por cidade
   - Busca paginada em /api/v1/courses/search/
   - Cada "area_interest" da resposta vira (ou casa com) uma
     categoria em "areas-grade".
   - Cada curso vira um cartao na "lista", com o botao apontando
     para "absolute_url".
   OBS: o formato exato da resposta da API pode variar; a leitura
   abaixo e proposital e defensiva (tenta varias chaves comuns).
   ============================================================ */
/* Proxies de CORS publicos (modo C) -> ficam instaveis. Cada um tem um
   "unwrap" porque alguns devolvem o corpo cru e outros embrulham em JSON. */
const PROXIES_CORS = [
  { url: u => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u), unwrap: r => r.json() },
  { url: u => "https://api.allorigins.win/get?url="       + encodeURIComponent(u), unwrap: async r => JSON.parse((await r.json()).contents) },
  { url: u => "https://api.allorigins.win/raw?url="       + encodeURIComponent(u), unwrap: r => r.json() }
];
const cacheTrampolim        = new Map();                       // cidade -> [cursos ja normalizados]
let   buscaToken            = 0;                               // protege contra trocas rapidas de cidade
let   areaAtual             = null;                            // area aberta no momento (p/ reabrir apos carregar)

const ICONE_TRAMPOLIM = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M21 8v6"/><path d="M7 10.5V15c0 1.4 2.7 2.5 5 2.5s5-1.1 5-2.5v-4.5"/></svg>`;

/* locale: espacos viram "+", acentuacao permanece intacta (o navegador
   percent-encoda os acentos ao montar a requisicao; o "+" continua "+"). */
function localeTrampolim(cidade){ return (cidade||"").trim().replace(/\s+/g,"+"); }
function urlTrampolim(cidade,pagina,limite){
  return TRAMPOLIM_BASE+"/api/v1/courses/search/?smart_filter=false&q=&type=course"
    +"&order_by=more_popular&page="+pagina+"&page_limit="+limite
    +"&status=available&locale="+localeTrampolim(cidade)+"&operation_range=10";
}

/* --- leitura defensiva da resposta paginada --- */
function listaDeCursos(json){
  if(Array.isArray(json)) return json;
  return (json && (json.results||json.data||json.items||json.objects||json.courses||json.records)) || [];
}
function totalDeRegistros(json){
  const n = json && (json.count ?? json.total ?? json.total_count ?? json.totalCount ?? json.count_total ?? json.records_total);
  return (typeof n==="number") ? n : null;
}
/* true = ha proxima pagina; false = acabou; null = a API nao informou */
function temProxima(json){
  if(!json || typeof json!=="object") return null;
  if("next" in json)       return !!json.next;
  if("has_next" in json)   return !!json.has_next;
  if("has_more" in json)   return !!json.has_more;
  if("next_page" in json)  return !!json.next_page;
  return null;
}

/* --- extrai os rotulos de area a partir de area_interest --- */
function rotuloDe(x){
  if(x==null) return "";
  if(typeof x==="string") return x.trim();
  if(typeof x==="object") return (x.name||x.title||x.label||x.nome||x.value||x.descricao||x.description||"").toString().trim();
  return String(x).trim();
}
function rotulosArea(c){
  const v = c && (c.area_interest ?? c.area_interests ?? c.areas_interest ?? c.area ?? c.areas ?? c.category ?? c.categories);
  const out=[];
  if(Array.isArray(v)) v.forEach(x=>{ const s=rotuloDe(x); if(s) out.push(s); });
  else { const s=rotuloDe(v); if(s) out.push(s); }
  return [...new Set(out)];
}
/* rotulo -> id de area canonica (via classificador; nao cria mais areas dinamicas) */
function resolverAreaInteresse(label){ return classificar(label); }

/* --- normaliza um curso da API para o formato que cartaoCurso() espera --- */
function urlAbsolutaTrampolim(u){
  u=(u||"").trim();
  if(!u) return "";
  if(/^https?:\/\//i.test(u)) return u;
  return TRAMPOLIM_SITE + (u.charAt(0)==="/" ? u : "/"+u);   // links abrem o site real
}
function instTrampolim(c){
  const s = rotuloDe(c.institution||c.provider||c.organization||c.company||c.partner||c.entidade||c.instituicao);
  return s ? (s+" · Trampolim SP") : "Trampolim SP";
}
function cargaTrampolim(c){
  let v = c.workload ?? c.workload_hours ?? c.hours ?? c.duration ?? c.carga_horaria ?? c.carga ?? c.duracao;
  if(Array.isArray(v)) v = v[0];                      // a API manda workload como [60]
  if(v==null || v==="") return "";
  const s = String(v).trim();
  return /h$|hora/i.test(s) ? s : (s+"h");
}
function modalidadeTrampolim(c){
  // course_format vem como lista de objetos {key,value} (as vezes duplicada)
  if(Array.isArray(c.course_format)){
    const vals = [...new Set(c.course_format.map(rotuloDe).filter(Boolean))];
    if(vals.length) return vals.join(" · ");
  }
  return rotuloDe(c.modality||c.modalidade||c.format||c.type_display||c.tipo) || "";
}
function turnoTrampolim(c){
  if(Array.isArray(c.shift)){
    const vals = [...new Set(c.shift.map(rotuloDe).filter(Boolean))];
    return vals.join(", ");
  }
  return rotuloDe(c.shift||c.turno) || "";
}
function normalizarCursoTrampolim(c){
  return {
    nome: rotuloDe(c.name||c.title||c.nome||c.course_title||c.titulo) || "Curso",
    inst: instTrampolim(c),
    modalidade: modalidadeTrampolim(c),
    turno: turnoTrampolim(c),
    carga: cargaTrampolim(c),
    desc: rotuloDe(c.description||c.desc||c.summary||c.resumo),
    link: urlAbsolutaTrampolim(c.absolute_url||c.url||c.link||c.permalink||""),
    _rotulos: rotulosArea(c),
    _trampolim: true
  };
}

/* total de paginas, quando a API informa (este endpoint manda "pages") */
function totalDePaginas(json){
  const n = json && (json.pages ?? json.num_pages ?? json.total_pages ?? json.totalPages ?? json.last_page);
  return (typeof n==="number") ? n : null;
}

/* fetch da API: direto OU via proxy de CORS (so p/ teste local). Faz fallback
   entre os proxies e ja devolve o JSON (descarta proxy que falhar no parse). */
async function fetchTrampolimJSON(url){
  const alvos = TRAMPOLIM_CORS_PROXY ? PROXIES_CORS : [{ url:u=>u, unwrap:r=>r.json() }];
  let erro;
  for(const px of alvos){
    const alvo = px.url(url);
    try{
      console.log("[Trampolim] GET", alvo);
      const resp = await fetch(alvo, {headers:{Accept:"application/json"}});
      if(!resp.ok){ erro = new Error("HTTP "+resp.status); console.warn("[Trampolim] resposta nao-ok:", resp.status); continue; }
      return await px.unwrap(resp);      // se o parse falhar, tenta o proximo proxy
    }catch(e){ erro = e; console.warn("[Trampolim] tentativa falhou:", e && e.message); }
  }
  throw erro || new Error("falha ao buscar Trampolim");
}

/* --- busca todas as paginas de uma cidade (com cache) --- */
async function buscarCursosTrampolim(cidade){
  if(cacheTrampolim.has(cidade)) return cacheTrampolim.get(cidade);
  let pagina=1, total=null, totalPag=null, pageSize=null;
  const brutos=[];
  while(pagina<=TRAMPOLIM_MAX_PAGINAS){
    let json;
    try{ json = await fetchTrampolimJSON(urlTrampolim(cidade,pagina,TRAMPOLIM_PAGE_LIMIT)); }
    catch(e){ if(pagina===1) throw e; break; }
    const lote = listaDeCursos(json);
    if(pagina===1){ total = totalDeRegistros(json); totalPag = totalDePaginas(json); pageSize = lote.length || TRAMPOLIM_PAGE_LIMIT; }
    for(const c of lote) brutos.push(c);
    if(!lote.length) break;
    const prox = temProxima(json);
    if(prox===false) break;                          // a API disse que acabou
    if(total!=null && brutos.length>=total) break;   // ja juntamos todos os registros
    if(totalPag!=null && pagina>=totalPag) break;    // chegamos na ultima pagina
    if(prox==null && totalPag==null && lote.length<pageSize) break; // lote curto, sem info de paginacao
    pagina++;
  }
  const cursos = brutos.map(normalizarCursoTrampolim);
  console.log("[Trampolim] cursos recebidos para", cidade, "->", cursos.length, "| paginas lidas:", pagina);
  cacheTrampolim.set(cidade, cursos);
  return cursos;
}

/* --- injeta os cursos no DADOS_CIDADE, criando categorias por area_interest --- */
function mesclarTrampolim(cursos){
  cursos.forEach(c=>{
    if(!cursoAtingeCargaMinima(c.carga)) return;   // filtra cursos curtos (< 10h)
    const id = areaDoCurso(c.nome, ...(c._rotulos || []));
    (DADOS_CIDADE[id] = DADOS_CIDADE[id] || {cursos:[],oportunidades:[]}).cursos.push(c);
  });
}

/* --- orquestra: busca, mescla e atualiza so a grade (sem recriar o mapa) --- */
async function carregarTrampolimEAtualizar(cidade, token){
  console.log("[Trampolim] iniciando busca para:", cidade, "| proxy:", TRAMPOLIM_CORS_PROXY);
  const status = document.getElementById("statusTrampolim");
  if(status) status.textContent = "Buscando cursos no Trampolim SP\u2026";
  try{
    const cursos = await buscarCursosTrampolim(cidade);
    if(token!==buscaToken) return;
    mesclarTrampolim(cursos);
    /* busca tambem nas cidades vizinhas */
    const vizinhas = CIDADES_VIZINHAS[cidade] || [];
    for(const viz of vizinhas){
      try{
        const cursosViz = await buscarCursosTrampolim(viz);
        if(token!==buscaToken) return;
        cursosViz.forEach(c=>{ c._deOutraCidade = viz; });
        mesclarTrampolim(cursosViz);
      }catch(e){ console.warn("[Trampolim] vizinha "+viz+" falhou:", e); }
    }
    renderAreasGrade(cidade);
    if(areaAtual){
      const btn = document.querySelector('.area-btn[data-area="'+areaAtual+'"]');
      if(btn) selecionarArea(cidade, areaAtual, btn);
    }
    const total = cursos.length;
    if(status) status.textContent = total
      ? ("Cursos do Trampolim SP carregados: "+total+(vizinhas.length?" (inclui cidades próximas).":"."))
      : "Nenhum curso do Trampolim SP encontrado para esta cidade.";
  }catch(e){
    console.warn("[Trampolim] FALHOU:", e);
    if(token!==buscaToken) return;
    if(status) status.textContent = "Nao foi possivel carregar os cursos do Trampolim SP agora (verifique a conexao ou o CORS da API). O restante do conteudo continua disponivel.";
  }
}


/* =====================================================================
   TRAMPOLIM SP  ·  vagas de emprego ao vivo por cidade
   - Usa a mesma API de busca do Trampolim, mas com type=vacancy
   - Cada vaga vira um cartao na lista de oportunidades
   ===================================================================== */
const cacheTrampolimVagas   = new Map();

function urlTrampolimVagas(cidade,pagina,limite){
  return TRAMPOLIM_BASE+"/api/v1/vacancy-allowany/search/?smart_filter=false&q=&type=vacancy"
    +"&order_by=latest&page="+pagina+"&page_limit="+limite
    +"&status=available&status=extended&locale="+localeTrampolim(cidade)+"&operation_range=15";
}

function normalizarVagaTrampolim(v){
  const titulo = rotuloDe(v.name||v.title||v.nome||v.course_title||v.titulo) || "Vaga";
  const empresa = rotuloDe(v.institution||v.provider||v.organization||v.company||v.partner||v.entidade||v.empresa);
  const url = urlAbsolutaTrampolim(v.absolute_url||v.url||v.link||v.permalink||"");
  const desc = rotuloDe(v.description||v.desc||v.summary||v.resumo);
  const modalidade = modalidadeTrampolim(v);
  const turno = turnoTrampolim(v);
  /* shift / contract_type: a API pode trazer campo de tipo de contrato */
  const tipo = rotuloDe(v.contract_type||v.tipo_contrato||v.modality||"");
  const cidade = rotuloDe(v.city||v.cidade||v.locale||"");
  return {
    cargo: titulo,
    empresa: empresa ? (empresa+" · Trampolim SP") : "Trampolim SP",
    modalidade: modalidade,
    tipo: tipo,
    cidade: cidade,
    desc: desc ? (desc.length>200 ? desc.slice(0,200)+"…" : desc) : "",
    link: url,
    _rotulos: rotulosArea(v),
    _trampolim: true
  };
}

async function buscarVagasTrampolim(cidade){
  if(cacheTrampolimVagas.has(cidade)) return cacheTrampolimVagas.get(cidade);
  let pagina=1, total=null, totalPag=null, pageSize=null;
  const brutos=[];
  while(pagina<=TRAMPOLIM_MAX_PAGINAS){
    let json;
    try{ json = await fetchTrampolimJSON(urlTrampolimVagas(cidade,pagina,TRAMPOLIM_PAGE_LIMIT)); }
    catch(e){ if(pagina===1) throw e; break; }
    const lote = listaDeCursos(json);
    if(pagina===1){ total = totalDeRegistros(json); totalPag = totalDePaginas(json); pageSize = lote.length || TRAMPOLIM_PAGE_LIMIT; }
    for(const v of lote) brutos.push(v);
    if(!lote.length) break;
    const prox = temProxima(json);
    if(prox===false) break;
    if(total!=null && brutos.length>=total) break;
    if(totalPag!=null && pagina>=totalPag) break;
    if(prox==null && totalPag==null && lote.length<pageSize) break;
    pagina++;
  }
  const vagas = brutos.map(normalizarVagaTrampolim);
  console.log("[Trampolim Vagas] vagas recebidas para", cidade, "->", vagas.length, "| paginas lidas:", pagina);
  cacheTrampolimVagas.set(cidade, vagas);
  return vagas;
}

function mesclarTrampolimVagas(vagas){
  vagas.forEach(v=>{
    const id = areaDoCurso(v.cargo, ...(v._rotulos || []));
    (DADOS_CIDADE[id] = DADOS_CIDADE[id] || {cursos:[],oportunidades:[]}).oportunidades.push(v);
  });
}

async function carregarTrampolimVagasEAtualizar(cidade, token){
  console.log("[Trampolim Vagas] iniciando busca para:", cidade);
  const status = document.getElementById("statusTrampolimVagas");
  if(status) status.textContent = "Buscando vagas de emprego no Trampolim SP\u2026";
  try{
    const vagas = await buscarVagasTrampolim(cidade);
    if(token!==buscaToken) return;
    mesclarTrampolimVagas(vagas);
    renderAreasGrade(cidade);
    renderVagas();
    if(areaAtual){
      const btn = document.querySelector('.area-btn[data-area="'+areaAtual+'"]');
      if(btn) selecionarArea(cidade, areaAtual, btn);
    }
    if(status) status.textContent = vagas.length
      ? ("Vagas do Trampolim SP carregadas: "+vagas.length+".")
      : "Nenhuma vaga do Trampolim SP encontrada para esta cidade.";
  }catch(e){
    console.warn("[Trampolim Vagas] FALHOU:", e);
    if(token!==buscaToken) return;
    if(status) status.textContent = "Nao foi possivel carregar as vagas do Trampolim SP agora. O restante do conteudo continua disponivel.";
  }
}

/* =====================================================================
   SEBRAE SP  ·  Adobe Commerce (Catalog Service / Live Search) GraphQL
   - Cursos online gratuitos da loja do Sebrae SP (sp.loja.sebrae.com.br).
   - So entram cursos GRATUITOS (preco 0) e com carga horaria >= 10h
     (a duracao vem estruturada em horas no atributo "duracao").
   - Se o navegador bloquear por CORS, veja SEBRAE_CORS_PROXY abaixo.
   ===================================================================== */
const ICONE_SEBRAE = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5"/><path d="M22 10v6"/></svg>`;

const SEBRAE_QUERY = `query productSearch($phrase:String!,$pageSize:Int,$currentPage:Int,$filter:[SearchClauseInput!],$sort:[ProductSearchSortInput!]){
  productSearch(phrase:$phrase,page_size:$pageSize,current_page:$currentPage,filter:$filter,sort:$sort){
    total_count
    page_info{ current_page total_pages }
    items{
      product{ name description{ html } price_range{ minimum_price{ final_price{ value } } } }
      productView{ name url urlKey attributes{ name value } }
    }
  }
}`;

const cacheSebrae = { cursos: null };   // cache global (cursos online nao dependem da cidade)

function sebraeAttr(pv, name){
  const a = ((pv && pv.attributes) || []).find(x => x.name === name);
  if(!a) return "";
  return Array.isArray(a.value) ? a.value.filter(Boolean).join(", ") : (a.value || "");
}
function sebraePreco(item){
  const v = item && item.product && item.product.price_range
        && item.product.price_range.minimum_price && item.product.price_range.minimum_price.final_price
        && item.product.price_range.minimum_price.final_price.value;
  return (typeof v === "number") ? v : null;
}
function sebraeGratuito(item, pv){
  return sebraePreco(item) === 0 || (sebraeAttr(pv,"investment")||"").toLowerCase() === "gratuito";
}
function urlAbsolutaSebrae(u){
  u = (u||"").trim();
  if(!u) return "";
  if(/^https?:\/\//i.test(u)) return u;
  if(u.startsWith("//")) return "https:"+u;
  return SEBRAE_SITE + (u.charAt(0)==="/" ? u : "/"+u);
}
function stripHTML(s){ return String(s==null?"":s).replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim(); }
function fmtCargaSebrae(h){ const n = parseFloat(h); if(!isFinite(n)) return ""; return (Number.isInteger(n) ? n : +n.toFixed(1)) + "h"; }

function normalizarCursoSebrae(item){
  const pv = item.productView || {}, p = item.product || {};
  const duracao = sebraeAttr(pv,"duracao");            // horas, ex.: "15.000000"
  const fmt     = sebraeAttr(pv,"event_format");       // ex.: "Curso autoinstrucional"
  return {
    nome: pv.name || p.name || "Curso",
    inst: "Sebrae SP · online, gratuito",
    modalidade: fmt || "Online",
    carga: fmtCargaSebrae(duracao),
    _cargaH: duracao,                                  // usado pelo filtro de 10h
    desc: stripHTML(p.description && p.description.html) || sebraeAttr(pv,"objective"),
    link: urlAbsolutaSebrae(pv.url || pv.urlKey),
    _gratis: sebraeGratuito(item, pv),
    _tema: sebraeAttr(pv,"theme") || "Outros",
    _sebrae: true
  };
}

function urlSebrae(){
  return (SEBRAE_CORS_PROXY && SEBRAE_PROXY_URL) ? SEBRAE_PROXY_URL.replace(/\/$/,"") : SEBRAE_ENDPOINT;
}
async function fetchSebrae(pagina){
  const usaProxy = SEBRAE_CORS_PROXY && SEBRAE_PROXY_URL;
  const headers  = usaProxy ? {"Content-Type":"application/json"} : SEBRAE_HEADERS;  // no proxy, o Worker injeta os headers
  const body = { query: SEBRAE_QUERY, variables: {
    phrase:"", pageSize:SEBRAE_PAGE_SIZE, currentPage:pagina,
    filter:[ {attribute:"categoryPath", eq:SEBRAE_CATEGORIA},
             {attribute:"visibility",   in:["Catalog","Catalog, Search"]} ],
    sort:[ {attribute:"position", direction:"ASC"} ]
  }};
  console.log("[Sebrae] POST", urlSebrae(), "pagina", pagina);
  const resp = await fetch(urlSebrae(), { method:"POST", headers, body:JSON.stringify(body) });
  if(!resp.ok) throw new Error("HTTP "+resp.status);
  const json = await resp.json();
  if(json.errors) console.warn("[Sebrae] GraphQL errors:", json.errors);
  return json.data && json.data.productSearch;
}
/* ============================================================
   FILTRO DE ADERENCIA AO PUBLICO DO SUPERACAO SP
   ------------------------------------------------------------
   O catalogo do Sebrae contem muitos cursos direcionados a
   publicos que NAO sao o foco do programa: alunos do ensino
   fundamental/medio, formacao de professores, franqueadores,
   profissionais regulamentados (OAB), gestao publica, setor
   audiovisual, comercio exterior, entre outros. Os padroes
   abaixo foram derivados de uma curadoria manual de 120
   cursos (73 excluidos, 47 mantidos), com 100% de precisao
   em ambos os lados no teste retroativo.
   ------------------------------------------------------------
   Publico ALVO: pessoas em vulnerabilidade social buscando
   qualificacao para empregabilidade OU abertura do proprio
   negocio (MEI, autonomo, pequeno empreendedor iniciante).
   ============================================================ */
const SEBRAE_PADROES_EXCLUSAO = [
  // 1. Educacao escolar (ensino fundamental/medio)
  /\b\d+\s*[oa\.ºª°]*\s*ano\b.*(fundamental|escola)/,
  /ensino\s*(medio|fundamental)/,
  /\b\d+\s*[oa\.ºª°]*\s*ensino\s*medio/,
  /\bjepp\b/,
  /aluno[s]?\s*do/,
  // 2. Formacao de professores / gestao educacional
  /formacao\s*de\s*professor/,
  /professor\s*empreendedor/,
  /pedagogic[ao]/,
  /\bbncc\b/,
  /gestao\s*educacional/,
  /educacao\s*basica/,
  /para\s*professor/,
  /empreendedorismo\s*para\s*professor/,
  // 3. Franquias
  /\bfranquia/,
  /franqueado/,
  /franqueador/,
  // 4. Profissoes regulamentadas (formacao continuada)
  /\badvogado/,
  /\boab\b/,
  /^saude$/,     // curso do Sebrae com nome apenas "Saúde" (empreendedorismo no setor)
  // 5. Setor audiovisual (nicho fora do publico)
  /audiovisual/,
  // 6. Comercio exterior / internacionalizacao
  /internacional/,
  /promocao\s*comercial/,
  // 7. Games (Trilha Games — nicho)
  /trilha\s*games/,
  // 8. Agronegocios
  /agronegocio/,
  // 9. Setor publico
  /poder\s*publico/,
  /gestao\s*publica/,
  /compras\s*sustentaveis/,
  /\binovagov\b/,
  // 10. Compliance / ESG (corporativo)
  /\bcompliance\b/,
  /\besg\b/,
  // 11. Nichos corporativos avancados
  /indicadores\s*estrategicos/,
  /planejamento\s*estrategico/,
  /transformacao\s*digital/,
  /captacao\s*de\s*recurso/,
  /solucoes\s*ageis/,
  /^inovacao\s*-/,  // "Inovacao - DESCOMPLICA" (mas nao "Inovacao em gestao de projetos")
  // 12. Outros nichos especificos
  /agentes\s*de\s*desenvolvimento/,
  /metodo\s*cis/,
  /projeto\s*de\s*extensao/,
  /exigencia\s*de\s*qualidade/,
  /trilha\s*de\s*empreendedorismo/,   // universitario (UNISUAM)
  // 13. Serie "Curso [X]Acao" para escolas
  /curso\s*(comunicacao|lideranca|motivacao|superando|universo|protagonismo|transformando)/,
];

/* retorna true se o curso deve ficar (aderente ao publico do programa) */
function sebraeAderenteAoPublico(nome){
  const n = (nome||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  for(const rx of SEBRAE_PADROES_EXCLUSAO){
    if(rx.test(n)) return false;
  }
  return true;
}

async function buscarCursosSebrae(){
  if(cacheSebrae.cursos) return cacheSebrae.cursos;
  const brutos=[]; let pagina=1, totalPag=null;
  while(pagina<=SEBRAE_MAX_PAGINAS){
    let ps;
    try{ ps = await fetchSebrae(pagina); }
    catch(e){ if(pagina===1) throw e; break; }
    if(!ps) break;
    const lote = ps.items || [];
    for(const it of lote) brutos.push(it);
    totalPag = ps.page_info && ps.page_info.total_pages;
    if(!lote.length) break;
    if(totalPag!=null && pagina>=totalPag) break;
    if(totalPag==null && lote.length < SEBRAE_PAGE_SIZE) break;
    pagina++;
  }
  const normalizados = brutos.map(normalizarCursoSebrae);
  const gratuitos    = normalizados.filter(c => c._gratis);
  const comCarga     = gratuitos.filter(c => cursoAtingeCargaMinima(c._cargaH));
  const cursos       = comCarga.filter(c => sebraeAderenteAoPublico(c.nome));
  const removidosPeloFiltro = comCarga.length - cursos.length;
  console.log("[Sebrae] recebidos:", brutos.length, "| gratuitos:", gratuitos.length, "| com 10h+:", comCarga.length, "| aderentes ao publico:", cursos.length, "(filtrados por publico:", removidosPeloFiltro + ")");
  cacheSebrae.cursos = cursos;
  return cursos;
}

/* tema do Sebrae -> id de area canonica (via classificador; sem area dinamica) */
function resolverAreaSebrae(tema){ return classificar(tema); }
function mesclarSebrae(cursos){
  cursos.forEach(c=>{
    let id = classificar(c.nome);              // nome e mais especifico que o tema amplo do Sebrae
    if(id==="outros") id = classificar(c._tema);
    (DADOS_CIDADE[id] = DADOS_CIDADE[id] || {cursos:[],oportunidades:[]}).cursos.push(c);
  });
}

async function carregarSebraeEAtualizar(cidade, token){
  const status = document.getElementById("statusSebrae");
  if(status) status.textContent = "Buscando cursos gratuitos no Sebrae SP\u2026";
  try{
    const cursos = await buscarCursosSebrae();
    if(token!==buscaToken) return;                    // o usuario trocou de cidade no meio
    mesclarSebrae(cursos);
    renderAreasGrade(cidade);
    if(areaAtual){
      const btn = document.querySelector('.area-btn[data-area="'+areaAtual+'"]');
      if(btn) selecionarArea(cidade, areaAtual, btn);
    }
    if(status) status.textContent = cursos.length
      ? ("Cursos gratuitos do Sebrae SP (10h+) carregados: "+cursos.length+".")
      : "Nenhum curso gratuito do Sebrae SP com 10h+ encontrado.";
  }catch(e){
    console.warn("[Sebrae] FALHOU:", e);
    if(token!==buscaToken) return;
    if(status) status.textContent = "Nao foi possivel carregar os cursos do Sebrae SP agora (possivel bloqueio de CORS — veja o console). O restante do portal continua disponivel.";
  }
}

/* =====================================================================
   PLANILHA MANUAL  ·  Google Sheets publicado como CSV
   - Cursos cadastrados manualmente pela equipe numa planilha do Google.
   - Colunas: municipio | curso | instituicao | modalidade | carga |
              link | area | inscricoes_ate | status
   - Cursos com municipio "Online" aparecem em todas as cidades.
   - Aplica o mesmo filtro de carga horaria >= 10h.
   - Se a planilha nao responder, o portal continua funcionando normalmente.
   ===================================================================== */
const cachePlanilha = { cursos: null };

/* --- parser CSV simples (Google Sheets gera CSV bem-formado com aspas duplas) --- */
function parseCSV(text){
  const linhas=[]; let campo="", campos=[], dentroAspas=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(dentroAspas){
      if(c==='"' && n==='"'){ campo+='"'; i++; }
      else if(c==='"') dentroAspas=false;
      else campo+=c;
    }else{
      if(c==='"') dentroAspas=true;
      else if(c===','){ campos.push(campo); campo=""; }
      else if(c==='\n' || (c==='\r' && n==='\n')){ campos.push(campo); linhas.push(campos); campos=[]; campo=""; if(c==='\r') i++; }
      else if(c==='\r'){ campos.push(campo); linhas.push(campos); campos=[]; campo=""; }
      else campo+=c;
    }
  }
  if(campo||campos.length){ campos.push(campo); linhas.push(campos); }
  return linhas;
}
function csvParaObjetos(text, campoObrigatorio){
  const linhas=parseCSV(text);
  if(!linhas.length) return [];
  const header=linhas[0].map(h=>h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_"));
  const chave = campoObrigatorio || header[1] || header[0];  // default: 2a coluna (geralmente "curso" ou "escola")
  return linhas.slice(1).map(cols=>{
    const obj={};
    header.forEach((h,i)=>{ obj[h]=cols[i]?cols[i].trim():""; });
    return obj;
  }).filter(o=>o[chave]);  // ignora linhas vazias
}

function normalizarCursoPlanilha(row){
  return {
    nome: row.curso || "",
    inst: (row.instituicao||"") + (row.modalidade?" · "+row.modalidade:""),
    modalidade: row.modalidade || "",
    carga: row.carga || "",
    link: row.link || "",
    _area: row.area || "",
    _municipio: row.municipio || "",
    _ate: row.inscricoes_ate || "",
    _status: row.status || "Aberto",
    _origem: row.origem || "",
    _planilha: true
  };
}

async function buscarCursosPlanilha(){
  if(cachePlanilha.cursos) return cachePlanilha.cursos;
  console.log("[Planilha] buscando CSV:", PLANILHA_CSV_URL);
  const resp = await fetch(PLANILHA_CSV_URL);
  if(!resp.ok) throw new Error("HTTP "+resp.status);
  const text = await resp.text();
  const rows = csvParaObjetos(text, "curso");
  const cursos = rows.map(normalizarCursoPlanilha)
    .filter(c => (c._status||"").toLowerCase() !== "encerrado")       // exclui encerrados
    .filter(c => {                                                     // exclui expirados
      if(!c._ate) return true;
      const partes = c._ate.split("/");                                // DD/MM/YYYY
      if(partes.length===3){ const d=new Date(partes[2],partes[1]-1,partes[0]); return isNaN(d.getTime())||d>=hoje0(); }
      const d=new Date(c._ate); return isNaN(d.getTime())||d>=hoje0();
    })
    .filter(c => cursoAtingeCargaMinima(c.carga));                     // filtro de 10h
  console.log("[Planilha] cursos válidos (10h+, abertos):", cursos.length, "| linhas no CSV:", rows.length);
  cachePlanilha.cursos = cursos;
  return cursos;
}

function mesclarPlanilha(cursos, cidade){
  const vizinhas = CIDADES_VIZINHAS[cidade] || [];
  cursos.forEach(c=>{
    const mun = normTxt(c._municipio);
    const cidNorm = normTxt(cidade);
    const ehOnlineFlag = (mun==="" || mun.startsWith("online") || mun.startsWith("todos"));
    const daCidade = ehOnlineFlag || mun===cidNorm;
    const deVizinha = !daCidade && vizinhas.some(v=>normTxt(v)===mun);
    if(!daCidade && !deVizinha) return;
    const id = c._area ? classificar(c._area) : classificar(c.nome);
    const sufixo = ehOnlineFlag ? " · online" : " · presencial em "+c._municipio;
    const obj = Object.assign({}, c, {
      inst: (c.inst||"")+(c.inst?"":" ")+sufixo,
      _deOutraCidade: deVizinha ? c._municipio : null
    });
    (DADOS_CIDADE[id] = DADOS_CIDADE[id] || {cursos:[],oportunidades:[]}).cursos.push(obj);
  });
}

async function carregarPlanilhaEAtualizar(cidade, token){
  const status = document.getElementById("statusPlanilha");
  if(status) status.textContent = "Buscando cursos cadastrados na planilha\u2026";
  try{
    const cursos = await buscarCursosPlanilha();
    if(token!==buscaToken) return;
    mesclarPlanilha(cursos, cidade);
    renderAreasGrade(cidade);
    if(areaAtual){
      const btn = document.querySelector('.area-btn[data-area="'+areaAtual+'"]');
      if(btn) selecionarArea(cidade, areaAtual, btn);
    }
    const n = cursos.filter(c=>{ const m=normTxt(c._municipio); return m===""||m.startsWith("online")||m.startsWith("todos")||m===normTxt(cidade); }).length;
    if(status) status.textContent = n
      ? ("Cursos da planilha carregados para esta cidade: "+n+".")
      : "Nenhum curso da planilha encontrado para esta cidade.";
  }catch(e){
    console.warn("[Planilha] FALHOU:", e);
    if(token!==buscaToken) return;
    if(status) status.textContent = "Não foi possível carregar a planilha de cursos agora. O restante do portal continua disponível.";
  }
}

/* =====================================================================
   PLANILHA MANUAL  ·  Vagas (aba "vagas" da mesma planilha)
   - Colunas: municipio | cargo | empresa | tipo_contrato | modalidade |
              descricao | link | area | status
   - "tipo_contrato" = CLT, Estágio, Jovem Aprendiz, Temporário, PJ, Outro
   - Vagas com status "Encerrado" sao ignoradas.
   - Se o municipio estiver vazio, a vaga aparece em todas as cidades.
   ===================================================================== */
const cachePlanilhaVagas = { vagas: null };

function normalizarVagaPlanilha(row){
  return {
    cargo: row.cargo || "",
    empresa: row.empresa || "",
    tipo: row.tipo_contrato || "",
    modalidade: row.modalidade || "",
    desc: row.descricao || "",
    link: row.link || "",
    cidade: row.municipio || "",
    _area: row.area || "",
    _municipio: row.municipio || "",
    _status: row.status || "Aberto",
    _origem: row.origem || "",
    _planilha: true
  };
}

async function buscarVagasPlanilha(){
  if(cachePlanilhaVagas.vagas) return cachePlanilhaVagas.vagas;
  console.log("[Planilha Vagas] buscando CSV:", PLANILHA_VAGAS_CSV_URL);
  const resp = await fetch(PLANILHA_VAGAS_CSV_URL);
  if(!resp.ok) throw new Error("HTTP "+resp.status);
  const text = await resp.text();
  const rows = csvParaObjetos(text, "cargo");
  const vagas = rows.map(normalizarVagaPlanilha)
    .filter(v => (v._status||"").toLowerCase() !== "encerrado");
  console.log("[Planilha Vagas] vagas válidas:", vagas.length, "| linhas no CSV:", rows.length);
  cachePlanilhaVagas.vagas = vagas;
  return vagas;
}

function mesclarPlanilhaVagas(vagas, cidade){
  vagas.forEach(v=>{
    const mun = normTxt(v._municipio);
    const cidNorm = normTxt(cidade);
    const ehGeral = (mun==="" || mun.startsWith("online") || mun.startsWith("todos"));
    if(!ehGeral && mun!==cidNorm) return;
    const id = v._area ? classificar(v._area) : classificar(v.cargo);
    (DADOS_CIDADE[id] = DADOS_CIDADE[id] || {cursos:[],oportunidades:[]}).oportunidades.push(v);
  });
}

async function carregarPlanilhaVagasEAtualizar(cidade, token){
  const status = document.getElementById("statusPlanilhaVagas");
  if(status) status.textContent = "Buscando vagas cadastradas na planilha\u2026";
  try{
    const vagas = await buscarVagasPlanilha();
    if(token!==buscaToken) return;
    mesclarPlanilhaVagas(vagas, cidade);
    renderVagas();
    const n = vagas.filter(v=>{ const m=normTxt(v._municipio); return m===""||m.startsWith("online")||m.startsWith("todos")||m===normTxt(cidade); }).length;
    if(status) status.textContent = n
      ? ("Vagas da planilha carregadas para esta cidade: "+n+".")
      : "Nenhuma vaga da planilha encontrada para esta cidade.";
  }catch(e){
    console.warn("[Planilha Vagas] FALHOU:", e);
    if(token!==buscaToken) return;
    if(status) status.textContent = "Não foi possível carregar a planilha de vagas agora.";
  }
}
