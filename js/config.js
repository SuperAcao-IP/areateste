/* =====================================================================
   CONFIGURACAO  ·  URLs, flags de integracao e utilitarios base
   Para ligar/desligar uma fonte de dados, mexa so neste arquivo.
   ===================================================================== */
/* =====================================================================
   VERSAO DE VISUALIZACAO  ·  DADOS REAIS embutidos (sem Supabase)
   - Cursos online: coletados ao vivo da Escola Virtual de Governo (EVG)
   - Pontos do mapa: do seu My Maps de campo (KML da Catia), ja parseados
   Nada aqui e inventado. Na producao, esses dados entram sozinhos pelo
   Supabase alimentado pelos conectores.
   ===================================================================== */
console.log("%c[SuperAcao] build v9 · Trampolim + Sebrae + Planilha · "+new Date().toISOString(),"color:#0D5A94;font-weight:bold");

const COR = { curso:"#7CB342", empregador:"#673AB7", cras:"#C2185B" };
const DADOS_BASE="";
/* URL do Google Apps Script que grava na planilha.
   Substitua pela URL gerada ao implantar o Apps Script (veja apps-script-backend.gs). */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxFku81pzX_0m-6G7sh45v3K_tJRHfqx9nLSaLVotuf0FUNiODpXLUdFqY_Ho38Y7Q/exec";

/* ---------- integracao: Trampolim SP ---------- */
const TRAMPOLIM_ATIVO       = true;   // liga/desliga a integracao
const TRAMPOLIM_PAGE_LIMIT  = 10;     // a API valida isto; 10 e o valor do exemplo que funciona (nao alterar sem testar)
const TRAMPOLIM_MAX_PAGINAS = 80;     // trava de seguranca contra loop infinito
/* ----------------------------------------------------------------------
   CORS — escolha UM modo (a API fica em outro dominio, entao o navegador
   exige um destes):

   (A) PROXY LOCAL  [recomendado p/ teste: sem CORS, sem flag, sem terceiros]
       rode o serve.js que acompanha este arquivo:   node serve.js
       e mantenha:   TRAMPOLIM_BASE = "/trampolim"   +   TRAMPOLIM_CORS_PROXY = false
       (o proprio servidor repassa a API na MESMA origem da pagina)

   (B) DIRETO + Chrome sem seguranca [so teste]
       TRAMPOLIM_BASE = "https://www.trampolim.sp.gov.br" ; CORS_PROXY = false
       e abra o Chrome com --disable-web-security

   (C) PROXY PUBLICO [instavel]
       TRAMPOLIM_BASE = "https://www.trampolim.sp.gov.br" ; CORS_PROXY = true

   PRODUCAO: sirva a pagina na mesma origem da API (ou repasse no seu backend);
       TRAMPOLIM_BASE = "" (mesma origem) ou a URL real, com CORS_PROXY = false.
   ---------------------------------------------------------------------- */
const TRAMPOLIM_BASE        = "https://trampolim-proxy.beatrizgribas.workers.dev";  // base das CHAMADAS de API (Worker proxy na Cloudflare)
const TRAMPOLIM_SITE        = "https://www.trampolim.sp.gov.br";  // dominio real -> links dos cursos
const TRAMPOLIM_CORS_PROXY  = false;  // o Worker ja resolve o CORS; nao usa proxy publico
const TRAMPOLIM_VAGAS_ATIVO = true;

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
function aberto(status,ate){ if((status||"").toLowerCase()==="encerrado") return false; if(ate){ const d=new Date(ate); if(!isNaN(d.getTime()) && d<hoje0()) return false; } return true; }
function matchArea(nome){ const norm=s=>(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase(); const n=norm(nome); const a=AREAS.find(a=>norm(a.nome)===n); return a?a.id:classificar(nome); }
function urlValida(u){ u=(u||"").trim(); if(!/^https?:\/\//i.test(u)) return false; try{ new URL(u); return true; }catch(e){ return false; } }
