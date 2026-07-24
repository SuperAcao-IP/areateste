/* =====================================================================
   AREAS  ·  taxonomia do programa e classificador por palavra-chave
   ===================================================================== */
const AREAS = [
  { id:"beleza", nome:"Beleza e Estética", descricao:"Cabelo, unhas, maquiagem e cuidados estéticos.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><path d="M20 4 8.2 15.8M14.5 14.5 20 20M8 8l4 4"/></svg>`,
    kw:["manicure","pedicure","cabelei","cabelo","beleza","estetic","sobrancelha","maquiag","barbeir","depilac","podolog","unha","spa","cilios","penteado","tranca","esteticista","micropigment","salao de beleza"] },
  { id:"saude", nome:"Saúde, Ambiente e Cuidados", descricao:"Cuidados, saúde, bem-estar e meio ambiente.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>`,
    kw:["cuidador","saude","enfermag","clinic","idoso","farmac","primeiros socorros","meio ambiente","ambiental","sustentab","reciclag","residuo","higiene","bem-estar","bem estar","nutric","psicolog","terapeut","fisioter","odontolog","veterinari","seguranca do trabalho","saneamento","biosseguranca","autocuidado","gerontolog","socorrista","agroecolog"] },
  { id:"gastronomia", nome:"Produção Alimentícia / Gastronomia", descricao:"Cozinha, panificação, confeitaria e alimentos.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10"/><path d="M16 3c-1.5 0-3 1.5-3 5 0 2 1 3 2 3v10"/></svg>`,
    kw:["cozinha","cozinheir","confeit","padaria","padeir","gastronom","aliment","salgad","panific","culinari","restaurante","barista","doceir","quitut","pizzai","churrasc","cervej","cafeteria","food truck","manipulacao de alimento"] },
  { id:"construcao", nome:"Construção civil", descricao:"Obras, acabamento e instalações prediais.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M2 16h20"/><path d="M9 8.5 12 3l3 5.5"/></svg>`,
    kw:["pedreiro","obras","canteiro de obra","construc","alvenaria","pintor","pintura predial","hidraulic","encanad","gesso","gesseir","azulej","acabamento","telhad","revestimento","reforma predial","marcenaria","marceneir","betoneira","assentamento","impermeabiliz","eletrica predial"] },
  { id:"moda", nome:"Moda, Costura e Confecção", descricao:"Costura, modelagem, moda e confecção têxtil.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2 12 7l-2.5-5L3 7v13h18V7l-6.5-5Z"/></svg>`,
    kw:["costur","corte e costura","costura industrial","confeccao","modelagem","modelista","estilis","vestuario","moda ","textile","textil","tecido","alfaiat","overloque","trico","croche"] },
  { id:"artesanato", nome:"Artesanato, Design e Produção Cultural", descricao:"Artesanato, design e produção cultural.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.7" r="1"/><circle cx="16.3" cy="11" r="1"/></svg>`,
    kw:["artesanat","artesa","design","producao cultural","gestao cultural","cultura popular","patrimonio cultural","artes visuais","artes plastic","artistic","bordad","ceramic","fotograf","audiovisual","edicao de video","producao musical","musica","ilustrac","serigrafia","joalheria","bijuteria","macrame","cenograf"] },
  { id:"tech", nome:"Tecnologia da Informação e Comunicação", descricao:"Informática, dados, sistemas e suporte.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>`,
    kw:["informat","tecnolog","programac","software","computad","geoinform","banco de dados","power bi","analise de dados","ciencia de dados","inteligencia artificial","machine learning","desenvolvimento de sistemas","desenvolvimento web","sistemas de informacao","suporte tecnico","help desk","seguranca da informacao","ciberseg","cybersec","cloud","nuvem","azure","aws","python","java ","javascript","robotica","internet das coisas","redes de computador"] },
  { id:"logistica", nome:"Logística / Operações", descricao:"Estoque, almoxarifado, transporte e operações.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>`,
    kw:["logistic","estoque","almoxarif","empilhad","transporte","entrega","motorist","frota","supply chain","cadeia de suprimento","expedic","armazen","armazem","distribuic","recebimento de mercadoria","inventario","gestao de estoque","carga e descarga","abastecimento","motoboy"] },
  { id:"mecanica", nome:"Mecânica e Serviços Gerais", descricao:"Mecânica, elétrica, manutenção e serviços gerais.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5a3.5 3.5 0 0 0-4.9 4.4L4 15.5 8.5 20l5.6-5.6a3.5 3.5 0 0 0 4.4-4.9l-2.5 2.5-2-2 2.5-2.5Z"/></svg>`,
    kw:["mecanic","automot","automovel","veicul","motocicl","injecao eletronic","solda","soldagem","montagem","manutenc","industr","producao industrial","linha de producao","operador de producao","auxiliar de producao","metalurg","usinag","fabricac","maquinas","torneiro","fresad","refrigerac","ar-condicionado","ar condicionado","eletric","eletrotecnic","eletronic","servicos gerais","limpeza","jardinag","zelador","portaria","conservac","manutencao predial","chaveiro"] },
  { id:"educacao", nome:"Desenvolvimento Educacional e Social", descricao:"Educação, idiomas, ação social e cidadania.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Z"/><path d="M19 18H6a2 2 0 0 0-2 2"/><path d="M9 7h6"/></svg>`,
    kw:["educac","pedagog","professor","docente","ensino","escolar","alfabetiz","assistencia social","acao social","servico social","projeto social","desenvolvimento social","impacto social","inclusao","libras","idioma","ingles","espanhol","monitoria","recreac","socioeducativ","socioemocional","primeira infancia","educacao infantil","cidadania","direitos humanos","terceiro setor","orientac educacional"] },
  { id:"jovemaprendiz", nome:"Jovem Aprendiz (14 a 24 anos)", descricao:"Programas de aprendizagem para jovens de 14 a 24 anos.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    kw:["jovem aprendiz","aprendiz","menor aprendiz","programa aprendiz","lei da aprendizagem","aprendizagem profissional","primeiro emprego","programa jovem","projov","patrulha mirim","camp ","clasa","abc aprendiz","espro","demà","renapsi","ciee","programa de aprendiz"] },
  { id:"gestao", nome:"Gestão, Negócios e Administrativo", descricao:"Administração, finanças, vendas e empreendedorismo.",
    icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>`,
    kw:["administr","gestao","secretar","escritori","recepc","financ","orcament","empreend","empresari","compliance","contabil","negoci","vend","caixa","comerci","varejo","loja","marketing","redes sociais","recursos humanos"," rh ","atendiment","pessoas","lideranc","projeto","planejament","estrategi","inovac","modelo de negocio","mei","microempreend","tribut","fiscal","juridic","leis","direito","mercado","precific","custos","lucro","fluxo de caixa","dre","processos","qualidade","produtividade","cliente","office"] }
];
const OUTROS = { id:"outros", nome:"Outros", descricao:"Capacitações gerais e cursos que não se encaixam nas demais áreas.",
  icone:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>` };

/* classificador central por palavras-chave (ignora acentos e caixa) */
function classificar(t){
  t = normTxt(t);
  for(const a of AREAS){ if(a.kw.some(k=>t.includes(k))) return a.id; }
  return "outros";
}
/* area de um curso: tenta pelos rotulos/tema; se nao achar, tenta pelo nome */
function areaDoCurso(nome){
  for(let i=1;i<arguments.length;i++){ const id=classificar(arguments[i]); if(id!=="outros") return id; }
  return classificar(nome);
}

/* registro das areas que chegam do Trampolim (chave = nome normalizado) */
const AREAS_DINAMICAS = new Map();
function normTxt(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase(); }
function todasAreas(){ return AREAS.concat([...AREAS_DINAMICAS.values()]).concat([OUTROS]); }

function areaInfo(id){ return todasAreas().find(a=>a.id===id) || OUTROS; }
