/* Moodle do IFRS · cursos livres (MOOC) gratuitos e abertos, 100% online.
   Coletado de moodle.ifrs.edu.br · atualizado em 2026-10-21 (34 cursos visíveis de 265 coletados).
   Só título, carga e link públicos; o conteúdo fica na plataforma de origem.
   Gerado por scripts/atualizar-catalogos.js: não edite à mão, a próxima coleta sobrescreve.
   Este arquivo guarda SÓ os cursos que aparecem no site (para a página ficar leve). A lista
   completa coletada e as decisões estão em dados/decisoes-catalogos.json. */
const IFRS = [
 {titulo:"Planilhas Google: Planilha Eletrônica",carga:"60h",area:"Tecnologia da Informação",link:"https://moodle.ifrs.edu.br/course/view.php?id=10565"},
 {titulo:"Cultura Digital e Educação Midiática",carga:"30h",area:"Outros",link:"https://moodle.ifrs.edu.br/course/view.php?id=10448"},
 {titulo:"Libras: compreensão básica",carga:"90h",area:"Outros",link:"https://moodle.ifrs.edu.br/course/view.php?id=10538"},
 {titulo:"Língua Portuguesa e Cultura Brasileira para Estrangeiros Básico",carga:"",area:"Outros",link:"https://moodle.ifrs.edu.br/course/view.php?id=10542"},
 {titulo:"Língua Portuguesa e Cultura Brasileira para Estrangeiros Intermediário",carga:"200h",area:"Outros",link:"https://moodle.ifrs.edu.br/course/view.php?id=10543"},
 {titulo:"Agente de Gestão de Resíduos Sólidos",carga:"200h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10396"},
 {titulo:"Cuidador de Idoso",carga:"200h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10445"},
 {titulo:"Cuidador Infantil",carga:"200h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10446"},
 {titulo:"Cuidados na infância: conceitos iniciais",carga:"40h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10447"},
 {titulo:"Exercitando a Paternidade: cuidado e autocuidado",carga:"20h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10604"},
 {titulo:"Maquiagem: produtos",carga:"40h",area:"Saúde e Cuidados",link:"https://moodle.ifrs.edu.br/course/view.php?id=10547"},
 {titulo:"Agente de Recepção e Reservas em Meios de Hospedagem",carga:"200h",area:"Turismo e Hotelaria",link:"https://moodle.ifrs.edu.br/course/view.php?id=10397"},
 {titulo:"Camareira em Meios de Hospedagem",carga:"200h",area:"Turismo e Hotelaria",link:"https://moodle.ifrs.edu.br/course/view.php?id=10595"},
 {titulo:"Condutor de Turismo de Pesca",carga:"200h",area:"Turismo e Hotelaria",link:"https://moodle.ifrs.edu.br/course/view.php?id=10435"},
 {titulo:"Operações de Hotelaria e Atendimento",carga:"90h",area:"Turismo e Hotelaria",link:"https://moodle.ifrs.edu.br/course/view.php?id=10319"},
 {titulo:"Almoxarife",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10402"},
 {titulo:"Assistente Administrativo",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10409"},
 {titulo:"Assistente de Contabilidade",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10411"},
 {titulo:"Assistente de Logística",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10412"},
 {titulo:"Assistente de Recursos Humanos",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10414"},
 {titulo:"Assistente de Serviços em Comércio Exterior",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10416"},
 {titulo:"Assistente de Tesouraria",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10417"},
 {titulo:"Assistente Financeiro",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10419"},
 {titulo:"Atendimento, Comunicação e Práticas Administrativas",carga:"160h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10420"},
 {titulo:"Finanças Pessoais",carga:"30h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10477"},
 {titulo:"Logística Operacional e Gestão de Estoques",carga:"100h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10318"},
 {titulo:"Logística, Estoques e Distribuição",carga:"140h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10610"},
 {titulo:"Microempreendedor Individual",carga:"200h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10558"},
 {titulo:"Trilha para o Empreendedorismo: Organizando a sua ideia para criar um negócio",carga:"40h",area:"Administração e Gestão",link:"https://moodle.ifrs.edu.br/course/view.php?id=10636"},
 {titulo:"Bolos caseiros: técnicas essenciais",carga:"20h",area:"Alimentação",link:"https://moodle.ifrs.edu.br/course/view.php?id=10642"},
 {titulo:"Organização de Estação de Trabalho e Mise en Place",carga:"20h",area:"Alimentação",link:"https://moodle.ifrs.edu.br/course/view.php?id=10006"},
 {titulo:"Auxiliar de Agroecologia",carga:"200h",area:"Meio Ambiente e Agro",link:"https://moodle.ifrs.edu.br/course/view.php?id=10422"},
 {titulo:"Zelador",carga:"200h",area:"Construção e Manutenção",link:"https://moodle.ifrs.edu.br/course/view.php?id=10591"},
 {titulo:"Assistente de Produção Cultural",carga:"200h",area:"Outros",link:"https://moodle.ifrs.edu.br/course/view.php?id=10413"}
];
