/* Regras de classificação automática de curso novo.
   Público: famílias de baixa renda, em geral sem ensino médio completo.

   Só se aplicam a título que ainda NÃO tem decisão em dados/decisoes-catalogos.json.
   Decisão existente (manual ou automática) nunca é refeita por aqui.

   A carga mínima de 15h NÃO entra na decisão: ela é aplicada na hora de montar o
   que fica visível (ver atualizar-catalogos.js), para o curso voltar sozinho se a
   carga subir. Ordem: cópia "(extra)" -> idioma -> ocultar por perfil -> manter por
   tema -> padrão (ocultar).

   Para saber o quanto as regras concordam com as decisões já tomadas à mão:
   node scripts/validar-regras.js */
const { normalizarTitulo } = require("./util");

/* Tudo é testado sobre o título normalizado (sem acento, minúsculas). */
const OCULTAR = [
  ["nível avançado",
    /\bavancad[oa]s?\b|\bpara especialistas\b|\bapreciacao e reducao de risco\b/],

  /* Libras básico (I, II, III, "compreensão básica", "prática e inclusão") fica; o que é
     formação de intérprete, tradução, linguística ou audiovisual de Libras não. */
  ["Libras especializado (interpretação, tradução, linguística)",
    /libras.*(interpretac\w*|interprete|traducao|tradutor|linguistica|semiotica|analise do discurso|escrita de sinais|contrastes?|audiovisual|janelas|docencia)|(interpretac\w*|interprete|traducao|tradutor|linguistica|semiotica)\b.*\blibras\b|audiovisual.*libras|janelas de libras|contrastes? entre (a )?(libras|lingua brasileira de sinais)|escrita de sinais/],

  ["software técnico / de engenharia",
    /\bansys\b|\bautocad\b|\bsolidworks\b|\bmatlab\b|\bcad\b|\bplc\b|\bscada\b|dynamics 365|power platform|salesforce|\bsap\b|\berp\b|elementos finitos|simulacao numerica/],

  ["curso técnico de nível médio (exige ensino médio)",
    /^(curso )?tecnico\b/],

  ["preparatório (ENEM, vestibular, concurso, ingresso)",
    /\benem\b|pre-ifmg|vestibular|\bconcursos?\b|preparatorio/],
  ["contexto institucional / serviço público",
    /\b(receita federal|sistema prisional|penitenciari\w*|custodiad\w*|egress\w*|imigrantes?|migracoes|migratori\w*|refugiad\w*|cidadaos?|codigos? de obras|edificac\w*|licenciamento|indicadores de desempenho|transformacao digital|plano de governo|governos?|federal|federais|estadual|estaduais|suas|sisp|siafi|nacionais?|no ambito|reservas? particulares|rppn|drones?|lei n\w*|lei \d+|decreto|portaria|constituicao|direitos humanos|conselhos?|cooperativas? de credito|terceirizad\w*|institucion\w*|armas de fogo|investigac\w*|criminais?|penais?|penal|fiscal|fiscais|tributari\w*|aduan\w*|saneamento|vigilancia sanitaria|patologias em estruturas|obras|urban\w*|museus?|autarquias?|ministerio|secretaria|prefeituras?|municipios?|sistema s|uso publico|espacos? publicos?)\b/],
  ["voltado a servidor / gestão pública",
    /(administracao|gestao|contabilidade|financas|orcamento|marketing|direito|etica|compras|contratos?|politicas?|recursos humanos|planejamento|controle|processo)\b[^.]{0,30}\b(publica|publico|publicas|publicos|governamental|municipal|administrativo)\b|servico publico|servidores?\b|licitac|convenios?\b|controle interno|prestacao de contas|improbidade|estatais?\b|responsabilidade fiscal|gestao governamental|governanca(?! em hotelaria)|compliance|anticorrupcao|\bsei!?(\s|$)|\benap\b|patrimonio da uniao|pregao|\blgpd\b|protecao de dados|transparencia|orgaos? publicos?|setor publico|poder publico|\bcarf\b|tribunal|parlament\w*|legislativ\w*|ouvidoria|agencia reguladora|regulacao|\bppa\b|\bloa\b|\bldo\b/],

  ["voltado a professor / escola / EaD",
    /(?<!cozinhas? )\b(escola|escolar|escolares|professor(es)?|docentes?|educadores?|pedagog\w*|ensino|educacao (a distancia|infantil|inclusiva|basica|escolar|especial|superior|profissional e tecnologica)|ead|moodle|didatic\w*|curricul\w*|sala de aula|aprendizagem|letramento|alfabetizacao|bncc|alunos?|estudantes?|autores de cursos|mooc\w*|a distancia|institutos? federais?|bibliotec\w+|gestao democratica|planejamento educacional|educacional|na educacao|docencia|tutoria)\b/],

  ["matéria de ensino médio / acadêmica",
    /^(fisica|quimica|biologia|filosofia|sociologia|geografia|historia|matematica|literatura|estatistica|calculo|topografia|era vargas|geopolitica|movimentos na fisica|a poesia|algebra|geometria|trigonometria|ciencias|psicologia|antropologia|ciencia politica|logica)|historia (do brasil|geral)|geografia e geopolitica|pesquisa cientifica|comunicacao cientifica|metodologia (cientifica|da pesquisa)|trabalhos? academic\w*|artigo cientifico/],

  ["TI técnica (programação, redes, dados, IA)",
    /\b(python|java|javascript|typescript|php|node\.?js|react|angular|vue|sql|mysql|postgres\w*|mongodb|banco de dados|bancos de dados|estrutura de dados|redes de computadores|redes neurais|sistemas operacionais|windows server|linux|html\d?|css|apis?|programacao|desenvolvimento (web|backend|back-end|front\w*|de software|de sistemas|mobile|de aplicativos)|(engenharia|projeto|projetos|testes?|qualidade) de software|softwares? de seguranca|algoritmos?|inteligencia artificial|machine learning|aprendizado de maquina|ciencia de dados|analise de dados|big data|power bi|azure|aws|cloud|nuvem|devops|scrum|pmbok|itil|seguranca da informacao|ciberseguranca|blockchain|automacao de sistemas|analise e projeto|ia|ai-\d+|(gestao|governanca|infraestrutura|servicos|projetos) de ti|tics?|governo digital|engenharia de \w+|redes sem fio|ia generativa|prompts?|chatbots?|(modelagem|mineracao|estruturas?) de dados|dados abertos)\b/],

  ["laboratório / pesquisa / saúde pública",
    /bioquimica|microbiologia|toxicologia|laborator\w*|fisico-quimic\w*|analises? fisico|epidemiolog\w*|vigilancia (em saude|sanitaria|epidemiologica)|saude coletiva|biosseguranca|histologia|farmacolog\w*|patologia|parasitolog\w*|imunologia|genetica|citologia|anatomia|fisiologia|\bsus\b|sistema unico de saude|saude publica|atencao basica|indicadores (na|de) saude|planejamento em saude/],

  ["voltado a profissional já formado",
    /profissionais? (da|do|de|das|dos) (justica|direito|saude|engenharia|contabilidade)|magistrad\w*|advogad\w*|\bjuiz(es)?\b|promotor\w*|auditor\w*|contador\w*|medicos?\b|enfermeir\w*|\bmba\b|pos-graduacao|especializacao/],

  ["gestão / jurídico / logística especializados",
    /(gestao|administracao) (estrategica|financeira|tributaria|de financas)|contabilidade (de custos|comercial|empresarial|publica)|direito (empresarial|publico|administrativo|tributario|autoral|do trabalho,|do trabalho:)|responsabilidade civil|legislacao (aplicada|fisco|empresarial|tributaria|turistica|escolar|cooperativista)|custos e orcamento|orcamento empresarial|escrita fiscal|textos (empresariais|oficiais)|cerimonial|resolucao de conflitos|constituicao e desenvolvimento|cooperativ\w*.*(gestao|governanca|financeira|estrategica|implementacao)|(gestao|governanca) (\w+ )?(de |em )?cooperativ\w*|logistica internacional|roteirizacao|supply chain|cadeia de suprimentos|custos logisticos|controle de transportes|limnologia|oceanografia|meteorologia|praticas em saude e seguranca/]
];

const MANTER = [
  ["cuidado e saúde básica",
    /primeiros socorros(?!.*profissionais)|saude (da|do) (crianca|mulher|homem|idoso|adolescente|trabalhador)|saude mental|cuidador\w*|cuidados? (com|para|de|na)|\bidosos?\b|\bgestantes?\b|puericultura|alimentacao saudavel|autocuidado|prevencao (de|do|da) (acidentes|violencia|drogas)|saude e seguranca no trabalho|protecao e cuidados|\bnr-?\d+|brigada de incendio|\bcipa\b/],
  ["segurança do trabalho (básico)",
    /seguranca do trabalho|\bepi\b|\bepc\b|prevencao de acidentes|riscos ambientais/],
  ["renda e negócio próprio",
    /empreendedor\w*|microempreendedor|\bmei\b|\bvendas?\b|varejo|atendimento|\bclientes?\b|negociacao|marketing (pessoal|digital)|redes sociais|comercio eletronico|e-commerce|operador de caixa|\bcaixa\b|\bestoques?\b|almoxarif\w*|valores monetarios|contabilidade basica|economia solidaria|cooperativismo|associativismo|formalizacao|precificacao|preco de venda/],
  ["dinheiro do dia a dia",
    /educacao financeira|planejamento financeiro|financas pessoais|financas para empreendedores|orcamento (domestico|familiar)|protecao financeira|endividamento|consumo consciente|\bcredito\b/],
  ["trabalho e carreira",
    /gestao de tempo|desenvolvimento (pessoal|profissional)|lideranca e trabalho em equipe|trabalho em equipe|etica profissional|\bemprego\b|curriculo|entrevista|primeiro emprego|jovem aprendiz|postura profissional|etiqueta profissional|direitos? (do trabalhador|trabalhistas)|direito do trabalho|trabalho decente|competencias socioemocionais|inteligencia emocional|controle de impulso/],
  ["comunicação e português",
    /portugues instrumental|lingua portuguesa|interpretacao de texto|comunicacao (escrita|oral|e atendimento)|falar em publico|oratoria|redacao|leitura e producao|ortografia|gramatica/],
  ["inclusão",
    /\blibras\b|acessibilidade|inclusao digital/],
  ["informática do dia a dia",
    /\bexcel\b|informatica basica|manutencao de computadores|montagem de computadores|alfabetizacao digital|cultura digital|\boffice\b|\bword\b|planilhas?|celular|smartphone|edicao de videos?|fotografia\w*|design grafico|canva/],
  ["construção e reparos",
    /materiais de construcao|alvenaria|pintura|eletric(a|idade) (residencial|basica|predial)|hidraulica|instalac(oes|ao) (eletricas|hidraulicas)|pedreiro|carpintaria|marcenaria|reparos|manutencao (predial|residencial)|energia (solar|fotovoltaica)[^.]*residencial|fotovoltaica residencial/],
  ["alimentação",
    /panificacao|confeitaria|cardapios?|manipulacao de alimentos|higiene (e controle de qualidade )?de alimentos|conservacao de alimentos|alimentacao e nutricao|\bcozinhas?\b|culinaria|boas praticas (de|na|em) (manipulacao|alimentos|servicos de alimentacao)|\bsalgados\b|\bdoces\b/],
  /* culinária e estética acessíveis: cursos práticos que dão renda sem exigir escolaridade */
  ["culinária e confeitaria",
    /\bbolos?\b|\btortas?\b|\bdoces?\b|\bsalgad\w*|\b(paes|pao)\b|\bpizzas?\b|\bmassas? (artesanais|caseiras|frescas)|sobremesas?|\breceitas? (de|caseiras?|culinarias?|doces?|salgadas?|saudaveis|faceis|praticas?|para)\b|culinaria|\bcozinha (basica|brasileira|vegana|vegetariana|arabe|italiana|japonesa|caseira|pratica)\b|mise en place|estacao de trabalho|brigadeir\w*|chocolates?|sorvetes?|geleias?|compotas?|canapes|finger food|salgadinhos?|marmitas?|quentinhas?|\bbuffet\b|barista|bartender|coquetel|drinques?|churrasco|hamburguer|\blanches?\b/],
  ["beleza e estética (curso prático)",
    /maquiagem|\bunhas?\b|manicure|pedicure|nail art|sobrancelhas?|depilacao|\bcilios?\b|cabeleireir\w*|\bpenteados?\b|\btrancas?\b|barbearia|barbeiro|visagismo|cuidados com a pele|esteticista|estetica (facial|corporal|basica|capilar)|massagem (relaxante|modeladora|estetica)|drenagem linfatica|cabelos? (crespos?|cacheados?|afro)|\bescova\b|coloracao capilar|alisamento|micropigmentacao/],
  ["agricultura e produção rural familiar",
    /agricultura|agroecolog\w*|horticultura|olericultura|fruticultura|frutas e hortalicas|frutiferas|pomares|piscicultura|aquicultura|\bpesca\b|pecuaria|bovinocultura|suinocultura|cunicultura|avicultura|apicultura|cafeicultura|cafeeiro|agroindustri\w*|processamento de (leite|carnes?)|abate e processamento|producao e industrializacao de alimentos|higiene agroindustrial|instalacoes agroindustriais|materias-primas de origem animal|bem-estar e ambiencia das aves|\bjardins?\b|jardinagem|viveiros|\bmudas\b|\bhorta\b|\bsolos\b|adubacao|\bpragas\b|defensivos|\bracoes\b|hidroponi\w*|compostagem|reciclagem|residuos solidos|educacao ambiental|seguranca agricola|\bcriacao de (galinhas?|aves|animais|peixes|coelhos?|porcos|suinos|bovinos|abelhas|caprinos|ovinos)\b|manejo e sanidade|producao de peixes/],
  ["hotelaria, turismo e eventos",
    /recepcao e reserva|meios de hospedagem|lavanderia na hotelaria|camareira|garcom|alimentos e bebidas na hotelaria|eventos?: (layout e )?decoracao|eventos?: layout|governanca em hotelaria/],
  ["ofícios e serviços",
    /costura|cabeleireir\w*|manicure|estetica|barbeir\w*|artesanato|motorista|entregador|armazenagem|movimentacao (e|de)|empilhadeira|operador de|auxiliar de|assistente|porteiro|zelador|limpeza|processamento de pedidos|vigilante|seguranca patrimonial|^logistica$/]
];

/* Série de idioma: níveis 1 a 4 ficam; do 5 em diante, não. */
function decidirIdioma(norm){
  const m = norm.match(/^(ingles|espanhol|portugues como lingua adicional)\s+(\d+)\b/);
  if(!m) return null;
  return +m[2] <= 4
    ? { d: "manter", m: "idioma, nível básico (1 a 4)" }
    : { d: "ocultar", m: "idioma, nível acima do 4" };
}

/* Repetido entre fontes NÃO é decidido aqui: o script esconde, na hora de montar o que
   aparece, o curso automático cujo título já aparece numa fonte de prioridade maior. */
function classificar(titulo){
  const norm = normalizarTitulo(titulo);

  if(/\(extra\b/.test(norm)) return { d: "ocultar", m: "cópia “(extra …)” de outro curso" };

  const idioma = decidirIdioma(norm);
  if(idioma) return idioma;

  for(const [motivo, re] of OCULTAR) if(re.test(norm)) return { d: "ocultar", m: motivo };

  for(const [motivo, re] of MANTER){
    if(re.test(norm)) return { d: "manter", m: motivo };
  }
  return { d: "ocultar", m: "sem regra de manter (fora do perfil por padrão)" };
}

/* ---------- Perfil: Público-alvo e Requisitos que o próprio curso declara ----------
   Só o Aprenda Mais publica esses campos (course/info.php). Devolve, por grupo, o trecho
   que disparou a regra (vazio = grupo não se aplica):
     a  público-alvo só de profissionais/professores/servidores, ou requisito de ser/atuar na área
     b  requisito de escolaridade (ensino médio, superior, graduação, técnico, ...)
     b2 sinal mais fraco: público-alvo é só estudante de ensino médio/superior (não é requisito)
     c  requisito de conhecimento prévio (informática, HTML, outro curso, noções de...)
   "Ensino fundamental completo" NÃO conta: é compatível com o público do programa. */
const PERFIL_PROF  = /\b(profissionais?|professor(es)?|docentes?|servidor(es)?|gestor(es)?|desenvolvedor(es)?|tecnic[oa]s?|educador(es)?|pedagog\w*|enfermeir\w*|medic[oa]s?|agentes?|analistas?|engenheir\w*|administrador(es)?|contador(es)?|empresari\w*|supervisor(es)?|coordenador(es)?|trabalhador(es)?|operador(es)?)\b/;
const PERFIL_GERAL = /\b(estudantes?|alunos?|interessad[oa]s?|qualquer|em geral|comunidade|refugiad\w*|imigrant\w*|brasileiros|pessoas|jovens|adultos|todos|cidad\w*|empreendedor\w*|famil\w*)\b/;
const PERFIL_GERAL_SEM_ESTUDANTE = /\b(interessad[oa]s?|qualquer|em geral|comunidade|refugiad\w*|imigrant\w*|brasileiros|pessoas|jovens|adultos|todos|cidad\w*|empreendedor\w*|famil\w*|profissionais?)\b/;
const REQ_SER_DA_AREA = /\bser (estudante|profissional|servidor|professor|trabalhador|da area|atuante|tecnico|aluno)\b|\bprofissionais? (da|do|de) (area|setor)\b|\bserem?\b.*\b(da area|atuante)\b|\batua(r|ndo)? (na|no|em)\b/;
const REQ_ESCOLARIDADE = /\b(ensino medio( completo| incompleto)?|ensino superior( completo| incompleto)?|graduacao|graduad\w*|licenciatura|curso tecnico|curso superior|superior (completo|incompleto)|nivel superior|pos-graduacao|mestrado)\b/;
const REQ_PREVIO = /\bconhecimentos?( basicos?)? (em|de|do|da|sobre)\b|\bnocoes( basicas)? (de|em|do|da)\b|\bter (realizado|cursado|concluido|feito)\b|\bsaber (manusear|usar|programar|operar)\b|\bexperiencia\b|\bdominio (de|em)\b|\bpre-?requisito|\blogica de programacao\b|\binstalacao do\b/;

function perfil(publico, requisitos){
  const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const pa = semAc(publico), rq = semAc(requisitos);
  // mostra a cláusula do texto ORIGINAL (com acentos) que casou com a regra
  const trecho = (original, re) => String(original || "").split(/[,;]/).map(x => x.trim()).find(x => re.test(semAc(x))) || "";
  const saida = { a: [], b: [], b2: [], c: [] };
  if(pa && PERFIL_PROF.test(pa) && !PERFIL_GERAL.test(pa)) saida.a.push("público-alvo: " + publico.trim());
  if(rq && REQ_SER_DA_AREA.test(rq)){
    const cl = trecho(requisitos, REQ_SER_DA_AREA);
    // "profissionais da área X ou interessados..." aceita qualquer interessado: não restringe
    if(cl && !/interessad|qualquer/.test(semAc(cl))) saida.a.push("requisito: " + cl);
  }
  if(rq && REQ_ESCOLARIDADE.test(rq)) saida.b.push("requisito: " + trecho(requisitos, REQ_ESCOLARIDADE));
  if(pa && /\b(ensino medio|ensino superior|educacao superior|graduacao)\b/.test(pa) && !PERFIL_GERAL_SEM_ESTUDANTE.test(pa))
    saida.b2.push("público-alvo: " + publico.trim());
  if(rq && REQ_PREVIO.test(rq)) saida.c.push("requisito: " + trecho(requisitos, REQ_PREVIO));
  return saida;
}

/* Decisão AUTOMÁTICA = regras de título (classificar) + perfil que o próprio curso declara
   (Público-alvo e Requisitos, hoje só no Aprenda Mais, lidos de course/info.php).
   Só os sinais fortes ocultam: (a) público só de profissionais, professores ou servidores (ou exige
   ser/atuar na área), (b) exige escolaridade, (c) exige conhecimento prévio. Sinais fracos
   ("estudantes do ensino médio/superior") e público de uma área (alimentos, construção civil...)
   NÃO ocultam. Vale só para decisões automáticas: quem chama só usa isto em decisões "auto";
   decisão manual nunca é sobreposta. */
function decidir(titulo, publico, requisitos){
  const r = classificar(titulo);
  if(r.d === "manter" && (publico || requisitos)){
    const p = perfil(publico, requisitos);
    if(p.a.length) return { d: "ocultar", m: "perfil declarado: público-alvo profissional (" + p.a[0] + ")" };
    if(p.b.length) return { d: "ocultar", m: "perfil declarado: exige escolaridade (" + p.b[0] + ")" };
    if(p.c.length) return { d: "ocultar", m: "perfil declarado: exige conhecimento prévio (" + p.c[0] + ")" };
  }
  return r;
}

module.exports = { classificar, perfil, decidir, OCULTAR, MANTER };
