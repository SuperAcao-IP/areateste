/* Cursos do Trampolim SP: o que aparece no portal.
   Os cursos do Trampolim chegam ao vivo e passam pelas MESMAS regras de perfil dos catálogos fixos
   (scripts/lib/regras.js): fica o curso de tema que serve ao público do programa; o resto não aparece.
   Este arquivo é para a EQUIPE ajustar à mão, e vence as regras:

   - manter / ocultar: títulos exatos como aparecem no site (maiúsculas, acentos e espaços não importam).
   - temas_manter: pedaços de título (expressão regular, sem acento e em minúsculas) que também mantêm o curso.
     Servem para temas que as regras gerais não pegam pela forma da palavra ("trancista", "biscoitos"...),
     sem mexer nos catálogos fixos.

   Para ver quantos cursos do Trampolim entram e saem, veja a issue semanal do histórico de cursos. */
const TRAMPOLIM_DECISOES = {
  manter: [
  ],
  ocultar: [
  ],
  temas_manter: [
    "trancista",                       // beleza: tranças (as regras pegam "tranças", não "trancista")
    "\\bbiscoitos?\\b",                // culinária
    "\\bvender\\b|marketplaces?",      // renda: vendas pelo WhatsApp, marketplaces
    "pequenos negocios",               // renda e negócio próprio
    "embalage\\w*"                     // artesanato e renda: embalagens, caixas de presente
  ]
};
