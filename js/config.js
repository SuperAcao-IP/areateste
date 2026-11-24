/* =====================================================================
   CONFIGURACAO  ·  URLs, flags de integracao e utilitarios base
   Para ligar/desligar uma fonte de dados, mexa so neste arquivo.
   ===================================================================== */
/* De onde vem cada dado: tabela "De onde vêm os dados" no README.md.
   Diagnóstico no console do navegador: abra o portal com ?debug no endereço. */
if(typeof location!=="undefined" && /[?&]debug\b/.test(location.search)) console.log("%c[SuperAcao] diagnóstico ligado · "+new Date().toISOString(),"color:#0D5A94;font-weight:bold");

const COR = { curso:"#7CB342", empregador:"#673AB7", cras:"#C2185B" };
const DADOS_BASE="";
/* URL do Google Apps Script que grava na planilha (cadastro do botão "Adicionar cursos e vagas aqui").
   O script fica na própria planilha: Extensões > Apps Script. Se for reimplantado, cole aqui a URL nova. */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxFku81pzX_0m-6G7sh45v3K_tJRHfqx9nLSaLVotuf0FUNiODpXLUdFqY_Ho38Y7Q/exec";

/* ---------- integracao: Trampolim SP ---------- */
const TRAMPOLIM_ATIVO       = true;   // liga/desliga a integracao
const TRAMPOLIM_PAGE_LIMIT  = 10;     // a API valida isto; 10 e o valor do exemplo que funciona (nao alterar sem testar)
const TRAMPOLIM_MAX_PAGINAS = 80;     // trava de seguranca contra loop infinito
/* ----------------------------------------------------------------------
   CORS: a API do Trampolim fica em outro domínio e não libera o navegador.
   As chamadas passam pelo Worker da Cloudflare (TRAMPOLIM_BASE abaixo), que
   repassa a API e libera a origem do GitHub Pages. Se os cursos do Trampolim
   sumirem com erro de CORS no console, o problema está no Worker.
   Alternativa só para teste (instável): TRAMPOLIM_BASE = TRAMPOLIM_SITE e
   TRAMPOLIM_CORS_PROXY = true (usa proxies públicos).
   ---------------------------------------------------------------------- */
const TRAMPOLIM_BASE        = "https://trampolim-proxy.beatrizgribas.workers.dev";  // base das CHAMADAS de API (Worker proxy na Cloudflare)
const TRAMPOLIM_SITE        = "https://www.trampolim.sp.gov.br";  // dominio real -> links dos cursos
const TRAMPOLIM_CORS_PROXY  = false;  // o Worker ja resolve o CORS; nao usa proxy publico
const TRAMPOLIM_VAGAS_ATIVO = true;
/* Filtro de perfil nos cursos do Trampolim: as mesmas regras dos catálogos fixos (scripts/lib/regras.js) mais as
   decisões à mão da equipe (dados/trampolim-decisoes.js). false = mostra todos os cursos do Trampolim. */
const FILTRAR_TRAMPOLIM = true;
/* ---------- Preparação para o mundo do trabalho (seção entre cursos e vagas) ----------
   Os 4 links ficam aqui para ser fácil trocar. */
const PREPARACAO_LINKS = {
  conceitos:      "https://www.sp.senai.br/curso/preparacao-para-o-mundo-do-trabalho/92542",
  socioemocional: "https://www.escolavirtual.gov.br/cursos/318",   // Inteligência Emocional (EVG, 50h) — já está no catálogo
  curriculo:      TRAMPOLIM_SITE + "/cidadao/curriculo/",
  entrevista:     TRAMPOLIM_SITE + "/pt/cidadao/preparador-entrevistas/"
};

/* ---------- robô de vagas (robo-vagas/, todo domingo) ----------
   Vagas da Gupy, Catho, InfoJobs, vagas.com (e LinkedIn/Indeed, quando a busca roda no computador da equipe),
   filtradas pelo perfil do programa e conferidas toda semana. O arquivo é dados/vagas-robo.json. */
const VAGAS_ROBO_ATIVO = true;

/* ---------- integracao: Sebrae SP ---------- */
const SEBRAE_ATIVO        = true;   // liga/desliga a integracao
const SEBRAE_ENDPOINT     = "https://catalog-service.adobe.io/graphql";
const SEBRAE_HEADERS = {            // cabecalhos publicos do storefront (nao sao senha)
  "Content-Type":            "application/json",
  "Magento-Environment-Id":  "3a290814-9e24-4148-ac77-d870f969130c",
  "Magento-Website-Code":    "sp",
  "Magento-Store-Code":      "loja_sp",
  "Magento-Store-View-Code": "store_view_sp",
  "Magento-Customer-Group":  "b6589fc6ab0dc82cf12099d1c2d40ab994e8410c",
  "X-Api-Key":               "cf0732cbd27a46b091bfd05138ca1caf"
};
const SEBRAE_CATEGORIA    = "cursos/cursos-online";   // categoryPath dos cursos online
const SEBRAE_SITE         = "https://sp.loja.sebrae.com.br";
const SEBRAE_PAGE_SIZE    = 20;
const SEBRAE_MAX_PAGINAS  = 60;
/* CORS: o endpoint da Adobe pode aceitar chamada direta do navegador. Se aparecer
   erro de CORS no console, suba um Worker (igual ao do Trampolim) que repasse o
   POST para a Adobe, ligue SEBRAE_CORS_PROXY=true e ponha a URL do Worker aqui. */
const SEBRAE_CORS_PROXY   = false;
const SEBRAE_PROXY_URL    = "";     // ex.: "https://sebrae-proxy.beatrizgribas.workers.dev"

/* ---------- integracao: planilha do Google Sheets ---------- */
const PLANILHA_ATIVA   = true;
const PLANILHA_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQr5CRyAxIwluOeHE50A6TCG7RS3ua1AClEye3Q5zUEL-QOZ0PGzlijAe66nFKb_mYPS7Y8jkHqEaNu/pub?gid=0&single=true&output=csv";
const PLANILHA_VAGAS_ATIVA = true;
/* Troque o gid abaixo pelo gid real da aba "vagas" na mesma planilha.
   Para descobrir o gid: abra a planilha, clique na aba "vagas",
   olhe a URL — o número após "#gid=" é o valor (ex: gid=123456789). */
const PLANILHA_VAGAS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQr5CRyAxIwluOeHE50A6TCG7RS3ua1AClEye3Q5zUEL-QOZ0PGzlijAe66nFKb_mYPS7Y8jkHqEaNu/pub?gid=934841184&single=true&output=csv";

/* Aba "pontos_digitais" da mesma planilha: lugares com computador/internet cadastrados pela equipe.
   Colunas: municipio | tipo | nome | endereco | bairro | recursos | horario | gratuito | telefone |
            observacao | status | verificado_em | lat | lon      (lat/lon opcionais).
   Vazio = camada só com as bibliotecas do cadastro estadual. Aba criada e publicada (gid 2024706523);
   se criar outra aba, cole aqui o link CSV dela (mesmo formato dos de cima, com o gid da aba). */
const PLANILHA_PONTOS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQr5CRyAxIwluOeHE50A6TCG7RS3ua1AClEye3Q5zUEL-QOZ0PGzlijAe66nFKb_mYPS7Y8jkHqEaNu/pub?gid=2024706523&single=true&output=csv";

/* Aba "servicos" da mesma planilha: CRAS, CREAS, PAT, Sebrae Aqui e outros serviços de apoio cadastrados pela equipe
   (somam-se aos do mapa de campo e aos das fontes oficiais, sem duplicar o mesmo lugar).
   Colunas: municipio | tipo | nome | endereco | bairro | horario | telefone | status | lat | lon
            (tipo: CRAS, CREAS, PAT, Sebrae Aqui ou outro; status: Ativo, ou Fechado/Encerrado para esconder; lat/lon opcionais).
   Vazio = DESLIGADO (a camada usa só o mapa de campo e as fontes oficiais). Ligado (gid 676188309); se a aba mudar,
   troque aqui o link CSV dela (com o gid da aba). */
/* Aba "unidades" da mesma planilha: unidades de ensino presencial (Senac, Senai e outras) cadastradas pela equipe.
   Colunas: instituicao | nome | endereco | bairro | municipio | status | lat | lon | link
            (instituicao: Senac, Senai ou outra; status: Ativo, ou Fechado/Encerrado para esconder; lat/lon e link opcionais).
   Sem lat/lon, o script semanal calcula pelo endereço (aparece em até uma semana). Os cursos presenciais do Senac/Senai
   da aba "cursos" se ligam à unidade pela instituição e pelo município (e pela coluna "unidade", se houver mais de uma).
   Vazio = DESLIGADO (a camada usa só as unidades dos arquivos dados/unidades.js e scripts/fontes/). Depois de criar a aba
   e publicá-la, cole aqui o link CSV dela (com o gid da aba). */
const PLANILHA_UNIDADES_CSV_URL = "";

const PLANILHA_SERVICOS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQr5CRyAxIwluOeHE50A6TCG7RS3ua1AClEye3Q5zUEL-QOZ0PGzlijAe66nFKb_mYPS7Y8jkHqEaNu/pub?gid=676188309&single=true&output=csv";

/* ---------- regras de conteudo ---------- */
/* --- carga horaria minima: exclui cursos com menos de 15h ---
   Este valor vale para TODAS as fontes de cursos (Trampolim, Sebrae,
   EVG, Fundacao Bradesco, planilha manual e dados.json). */
const CARGA_MINIMA_H = 15;
function cargaEmHoras(carga){
  if(carga==null) return null;
  const m = String(carga).match(/\d+(?:[.,]\d+)?/);   // pega o primeiro numero ("40h" -> 40, "1h30" -> 1)
  return m ? parseFloat(m[0].replace(",",".")) : null;
}
/* mantém o curso se tiver >= CARGA_MINIMA_H OU se a carga for desconhecida (nao dá pra afirmar que é menor) */
function cursoAtingeCargaMinima(carga){
  const h = cargaEmHoras(carga);
  return h==null ? true : h >= CARGA_MINIMA_H;
}
/* 15h a 19h: aceito, mas abaixo das 20h ideais. A tela marca com "(15–19h)". */
function cargaNaFaixaTolerada(carga){
  const h = cargaEmHoras(carga);
  return h!=null && h >= CARGA_MINIMA_H && h < 20;
}

/* --- filtro de publico: so catalogos fixos (EVG, Bradesco, Aprenda Mais) ---
   true  = mostra apenas os cursos listados em dados/filtro-publico.js
   false = mostra os catalogos inteiros (nada foi apagado)
   O curso e reconhecido pelo TITULO, nao pelo link: o link do Aprenda Mais muda a cada turma.
   normalizarTitulo() deve ficar igual a scripts/lib/util.js. */
const FILTRAR_PUBLICO_FAMILIAS = true;
function normalizarTitulo(t){
  return String(t==null?"":t).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
    .replace(/\s+-\s+turmas?\s+\d{4}[ab]\s*$/i,"").replace(/\s+/g," ").trim();
}
const _PERMITIDOS_CACHE = {};
/* fonte: "aprendaMais" | "bradesco" | "evg" */
function catalogoPermitido(lista, fonte){
  if(!FILTRAR_PUBLICO_FAMILIAS) return lista;
  if(typeof TITULOS_PERMITIDOS === "undefined" || !TITULOS_PERMITIDOS[fonte]){
    console.warn("dados/filtro-publico.js nao carregou: catalogo "+fonte+" sem filtro");
    return lista;
  }
  const ok = _PERMITIDOS_CACHE[fonte] || (_PERMITIDOS_CACHE[fonte] = new Set(TITULOS_PERMITIDOS[fonte]));
  return lista.filter(c=>ok.has(normalizarTitulo(c.titulo)));
}

/* === Cidades vizinhas: cursos e vagas compartilhados ===
   Quem escolhe a cidade da esquerda ve tambem o que existe nas cidades
   da direita, com uma tarja avisando que e de municipio vizinho.

   A lista mistura dois tipos de vizinho:
   - municipios do programa (aparecem tambem na lista de escolha)
   - municipios de fora, como Rio Claro, Sorocaba e Vargem Grande
     Paulista, que entram so como fonte de oferta e nunca aparecem
     para o usuario escolher

   A relacao vale em UM sentido so: escrever "Cotia" aqui faz Cotia
   receber, nao fornecer. Para valer nos dois lados, escreva o par
   tambem do outro lado.

   Cada vizinha adicionada e uma consulta a mais ao Trampolim toda vez
   que alguem escolhe a cidade. Por isso o limite de tres por cidade;
   passando disso a pagina comeca a demorar para carregar. */
const CIDADES_VIZINHAS = {
  /* --- regiao de Limeira e Rio Claro --- */
  "Santa Gertrudes":        ["Rio Claro", "Limeira", "Piracicaba"],
  "Cordeirópolis":          ["Rio Claro", "Limeira", "Araras"],
  "Araras":                 ["Rio Claro", "Limeira", "Leme"],
  "Iracemápolis":           ["Limeira", "Rio Claro", "Piracicaba"],
  "Limeira":                ["Rio Claro", "Piracicaba", "Americana"],

  /* --- regiao de Americana --- */
  "Nova Odessa":            ["Americana", "Sumaré", "Santa Bárbara d'Oeste"],
  "Santa Bárbara d'Oeste":  ["Americana", "Limeira", "Piracicaba"],
  "Americana":              ["Santa Bárbara d'Oeste", "Nova Odessa", "Limeira"],

  /* --- regiao de Campinas --- */
  "Sumaré":                 ["Campinas", "Hortolândia", "Americana"],
  "Paulínia":               ["Campinas", "Cosmópolis", "Sumaré"],
  "Valinhos":               ["Campinas", "Vinhedo", "Itatiba"],
  "Monte Mor":              ["Campinas", "Indaiatuba", "Capivari"],
  "Holambra":               ["Jaguariúna", "Mogi Mirim", "Artur Nogueira"],
  "Santo Antônio de Posse": ["Jaguariúna", "Amparo", "Mogi Mirim"],
  "Pedreira":               ["Jaguariúna", "Amparo", "Campinas"],
  "Jaguariúna":             ["Campinas", "Amparo", "Pedreira"],
  "Mogi Mirim":             ["Mogi Guaçu", "Itapira", "Holambra"],

  /* --- regiao de Jundiai --- */
  "Várzea Paulista":        ["Jundiaí", "Campo Limpo Paulista", "Francisco Morato"],
  "Louveira":               ["Jundiaí", "Vinhedo", "Itupeva"],
  "Vinhedo":                ["Valinhos", "Jundiaí", "Louveira"],
  "Jarinu":                 ["Jundiaí", "Atibaia", "Itatiba"],
  "Itupeva":                ["Jundiaí", "Indaiatuba", "Louveira"],
  "Itatiba":                ["Jundiaí", "Campinas", "Valinhos"],
  "Cabreúva":               ["Jundiaí", "Itu", "Itupeva"],

  /* --- regiao de Itu e Sorocaba --- */
  "Itu":                    ["Salto", "Sorocaba", "Porto Feliz"],
  "Indaiatuba":             ["Salto", "Campinas", "Itu"],
  "Elias Fausto":           ["Indaiatuba", "Capivari", "Itu"],
  "Mairinque":              ["São Roque", "Sorocaba", "Itu"],
  "São Roque":              ["Mairinque", "Sorocaba", "Itu"],

  /* --- Grande Sao Paulo: oeste --- */
  "Cotia":                  ["Vargem Grande Paulista", "Carapicuíba", "Embu das Artes"],
  "Carapicuíba":            ["Osasco", "Barueri", "Jandira"],
  "Barueri":                ["Osasco", "Jandira", "Itapevi"],
  "Santana de Parnaíba":    ["Barueri", "Osasco", "Pirapora do Bom Jesus"],
  "Osasco":                 ["Barueri", "Carapicuíba"],
  "Embu das Artes":         ["Taboão da Serra", "Cotia", "Itapecerica da Serra"],
  "Taboão da Serra":        ["Embu das Artes", "Itapecerica da Serra", "Osasco"],

  /* --- Grande Sao Paulo: norte --- */
  "Caieiras":               ["Cajamar", "Franco da Rocha", "Mairiporã"],
  "Cajamar":                ["Caieiras", "Santana de Parnaíba", "Franco da Rocha"],

  /* --- Grande Sao Paulo: ABC --- */
  "Diadema":                ["São Bernardo do Campo", "Santo André", "São Caetano do Sul"],
  "Mauá":                   ["Santo André", "Ribeirão Pires", "São Bernardo do Campo"],
  "Santo André":            ["São Bernardo do Campo", "São Caetano do Sul", "Mauá"],
  "São Bernardo do Campo":  ["Santo André", "Diadema", "São Caetano do Sul"],

  /* --- Grande Sao Paulo: leste --- */
  "Itaquaquecetuba":        ["Guarulhos", "Suzano", "Poá"],
  "Guarulhos":              ["Arujá", "Itaquaquecetuba"],

  /* --- Baixada Santista --- */
  "São Vicente":            ["Santos", "Praia Grande", "Cubatão"]
};

/* Raio de busca proporcional ao porte do município (cursos e vagas).
   Cidade grande já tem muita oferta própria: raio curto. Cidade pequena precisa buscar mais longe.
   Nunca passa de RAIO_MAX_KM (15). Não amplia quando faltam vagas: aparece o aviso com os links do Trampolim e do SINE.
   Porte aproximado (habitantes): grande > 500 mil · médio 100 a 500 mil · pequeno < 100 mil. Município fora da tabela = pequeno. */
const RAIO_MAX_KM = 15;
const RAIO_POR_PORTE = { grande: 5, medio: 10, pequeno: 15 };
const PORTE_MUNICIPIO = {
  "Campinas":"grande", "Guarulhos":"grande", "Osasco":"grande", "São Bernardo do Campo":"grande", "Santo André":"grande",
  "Americana":"medio", "Araras":"medio", "Barueri":"medio", "Carapicuíba":"medio", "Cotia":"medio", "Diadema":"medio",
  "Embu das Artes":"medio", "Indaiatuba":"medio", "Itaquaquecetuba":"medio", "Itatiba":"medio", "Itu":"medio",
  "Jundiaí":"medio", "Limeira":"medio", "Mauá":"medio", "Paulínia":"medio", "Santa Bárbara d'Oeste":"medio",
  "Santana de Parnaíba":"medio", "São Vicente":"medio", "Sumaré":"medio", "Taboão da Serra":"medio", "Valinhos":"medio"
};
function raioDoMunicipio(cidade){
  const porte = PORTE_MUNICIPIO[cidade] || "pequeno";
  return Math.min(RAIO_POR_PORTE[porte], RAIO_MAX_KM);
}
/* centro aproximado (±1 km) das cidades vizinhas que não estão no programa, só para medir distância */
const CENTROS_VIZINHAS_EXTERNAS = {
  "Rio Claro":[-22.4114,-47.5610], "Piracicaba":[-22.7253,-47.6492], "Leme":[-22.1808,-47.3841], "Hortolândia":[-22.8583,-47.2200],
  "Cosmópolis":[-22.6419,-47.1908], "Capivari":[-22.9950,-47.5073], "Artur Nogueira":[-22.5728,-47.1725], "Amparo":[-22.7088,-46.7720],
  "Mogi Guaçu":[-22.3689,-46.9428], "Itapira":[-22.4358,-46.8222], "Campo Limpo Paulista":[-23.2078,-46.7884], "Francisco Morato":[-23.2792,-46.7447],
  "Atibaia":[-23.1171,-46.5563], "Salto":[-23.2000,-47.2869], "Sorocaba":[-23.5015,-47.4526], "Porto Feliz":[-23.2143,-47.5239],
  "Vargem Grande Paulista":[-23.5997,-47.0237], "Jandira":[-23.5275,-46.9023], "Itapevi":[-23.5489,-46.9342], "Pirapora do Bom Jesus":[-23.3963,-47.0006],
  "Itapecerica da Serra":[-23.7169,-46.8492], "Franco da Rocha":[-23.3220,-46.7255], "Mairiporã":[-23.3186,-46.5870], "São Caetano do Sul":[-23.6229,-46.5548],
  "Ribeirão Pires":[-23.7106,-46.4136], "Suzano":[-23.5425,-46.3112], "Poá":[-23.5286,-46.3447], "Arujá":[-23.3964,-46.3208],
  "Santos":[-23.9608,-46.3336], "Praia Grande":[-24.0058,-46.4028], "Cubatão":[-23.8950,-46.4256]
};
/* Cursos buscam mais longe que vagas (a família se desloca menos para trabalhar do que para um curso): mesmo porte, teto de 20 km. */
const RAIO_CURSOS_MAX_KM = 20;
const RAIO_CURSOS_POR_PORTE = { grande: 10, medio: 15, pequeno: 20 };
function raioCursosDoMunicipio(cidade){
  const porte = PORTE_MUNICIPIO[cidade] || "pequeno";
  return Math.min(RAIO_CURSOS_POR_PORTE[porte], RAIO_CURSOS_MAX_KM);
}
function _centroDaCidade(nome){
  const c = (typeof CENTROS_MUNICIPIOS!=="undefined") && CENTROS_MUNICIPIOS[nome];
  if(c) return [c.lat, c.lon];
  return CENTROS_VIZINHAS_EXTERNAS[nome] || null;
}
function _kmEntreCidades(a, b){
  const p=_centroDaCidade(a), q=_centroDaCidade(b);
  if(!p||!q) return Infinity;
  const R=6371, rad=x=>x*Math.PI/180, dLat=rad(q[0]-p[0]), dLon=rad(q[1]-p[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(p[0]))*Math.cos(rad(q[0]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
/* vizinhas (CIDADES_VIZINHAS) que estão dentro do raio da cidade escolhida; sem coordenada, fica de fora */
function vizinhasNoRaio(cidade, tipo){
  const raio = tipo === "cursos" ? raioCursosDoMunicipio(cidade) : raioDoMunicipio(cidade);
  return (CIDADES_VIZINHAS[cidade] || []).filter(v => _kmEntreCidades(cidade, v) <= raio);
}


/* ---------- dados manuais (dados.json) e utilitarios base ---------- */
let DADOS=null;
async function carregarDados(){
  if(DADOS!==null) return;
  try{ const r=await fetch(DADOS_BASE+"dados.json?t="+Date.now()); DADOS=r.ok?await r.json():{cursos:[],vagas:[]}; }
  catch(e){ DADOS={cursos:[],vagas:[]}; }
  DADOS.cursos=DADOS.cursos||[]; DADOS.vagas=DADOS.vagas||[];
}
function ehDaCidade(v,cidade){ return (v||"").trim().toLowerCase()===cidade.toLowerCase(); }
function ehOnline(v){ return (v||"").trim().toLowerCase().startsWith("online"); }
function hoje0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
/* status "Encerrado" ou "Fechado" (a equipe usa os dois) = não aparece */
function statusFechado(status){ return /^\s*(encerrad|fechad)/i.test(status||""); }
function aberto(status,ate){ if(statusFechado(status)) return false; if(ate){ const d=new Date(ate); if(!isNaN(d.getTime()) && d<hoje0()) return false; } return true; }
function matchArea(nome){ const norm=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase(); const n=norm(nome); const a=AREAS.find(a=>norm(a.nome)===n); return a?a.id:classificar(nome); }
function urlValida(u){ u=(u||"").trim(); if(!/^https?:\/\//i.test(u)) return false; try{ new URL(u); return true; }catch(e){ return false; } }
