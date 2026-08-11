/* =============================================================
   SuperAção SP — aviso de uso da plataforma
   -------------------------------------------------------------
   Bloqueia a página até o usuário confirmar que leu o aviso.
   Depende de js/auth.js (opcional) para reaparecer a cada
   nova sessão de login.

   As cores vêm das variáveis do portal (--azul, --ambar, --raio
   etc.). Os valores após a vírgula são só fallback, caso o CSS
   do portal não tenha carregado.
   ============================================================= */
(function (global) {
  'use strict';

  var CONFIG = {
    // 'sessao'  → uma vez por login
    // 'sempre'  → toda vez que a página abrir
    frequencia: 'sessao',
    chave: 'superacao.aviso'
  };

  var doc = global.document;

  var store = (function () {
    try {
      var teste = '__superacao_aviso__';
      localStorage.setItem(teste, '1');
      localStorage.removeItem(teste);
      return localStorage;
    } catch (e) {
      var memoria = {};
      return {
        getItem: function (k) { return k in memoria ? memoria[k] : null; },
        setItem: function (k, v) { memoria[k] = String(v); },
        removeItem: function (k) { delete memoria[k]; }
      };
    }
  })();

  // Identifica a sessão atual pelo horário do login.
  function marcaDaSessao() {
    if (CONFIG.frequencia === 'sempre') return null;
    var s = global.Auth && global.Auth.sessao ? global.Auth.sessao() : null;
    return s ? String(s.criadaEm) : 'sem-sessao';
  }

  function jaConfirmou() {
    var marca = marcaDaSessao();
    if (marca === null) return false;
    return store.getItem(CONFIG.chave) === marca;
  }

  function registrarConfirmacao() {
    var marca = marcaDaSessao();
    if (marca !== null) store.setItem(CONFIG.chave, marca);
  }

  var CSS = [
    '.aviso-uso-fundo{position:fixed;inset:0;z-index:9999;display:flex;',
    'align-items:center;justify-content:center;padding:24px;',
    'background:rgba(8,58,94,.62);backdrop-filter:blur(3px);',
    'animation:avisoEntra .18s ease-out;}',

    '.aviso-uso-caixa{width:100%;max-width:520px;max-height:90vh;overflow-y:auto;',
    'background:var(--branco,#ffffff);border-radius:var(--raio,16px);',
    'padding:32px 34px 26px;',
    'box-shadow:var(--sombra-forte,0 4px 12px rgba(16,32,64,.10),',
    '0 20px 48px rgba(16,32,64,.12));',
    'font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;',
    'color:var(--texto,#29303d);line-height:1.55;}',

    '.aviso-uso-titulo{display:flex;align-items:center;gap:10px;',
    'margin:0 0 18px;font-size:1.25rem;font-weight:700;',
    'color:var(--azul,#0D5A94);}',

    '.aviso-uso-icone{flex:none;width:28px;height:28px;display:grid;',
    'place-items:center;border-radius:50%;',
    'background:var(--azul-suave,#eaf0fb);color:var(--azul,#0D5A94);',
    'font-size:1rem;font-weight:700;line-height:1;}',

    '.aviso-uso-caixa p{margin:0 0 14px;font-size:.95rem;}',
    '.aviso-uso-caixa p:last-of-type{margin-bottom:0;}',
    '.aviso-uso-caixa strong{font-weight:650;}',

    '.aviso-uso-destaque{padding:14px 16px;',
    'background:var(--ambar-suave,#fef3df);',
    'border-left:3px solid var(--ambar,#F79620);',
    'border-radius:0 var(--raio-sm,11px) var(--raio-sm,11px) 0;}',

    '.aviso-uso-acao{margin-top:24px;padding-top:20px;',
    'border-top:1px solid var(--linha,#e2e8f3);text-align:right;}',

    '.aviso-uso-botao{padding:12px 30px;font:inherit;font-weight:600;',
    'color:var(--branco,#ffffff);background:var(--azul,#0D5A94);border:0;',
    'border-radius:var(--raio-sm,11px);cursor:pointer;transition:background .15s;}',
    '.aviso-uso-botao:hover{background:var(--azul-escuro,#083a5e);}',
    '.aviso-uso-botao:focus-visible{outline:2px solid var(--texto,#29303d);',
    'outline-offset:2px;}',

    '.aviso-uso-travado{overflow:hidden !important;}',

    '@keyframes avisoEntra{from{opacity:0}to{opacity:1}}',

    '@media(max-width:520px){',
    '.aviso-uso-caixa{padding:26px 22px 20px;}',
    '.aviso-uso-acao{text-align:stretch;}',
    '.aviso-uso-botao{width:100%;}}',

    '@media(prefers-reduced-motion:reduce){',
    '.aviso-uso-fundo{animation:none;}',
    '.aviso-uso-botao{transition:none;}}'
  ].join('');

  function montar() {
    if (jaConfirmou()) return;

    var estilo = doc.createElement('style');
    estilo.textContent = CSS;
    doc.head.appendChild(estilo);

    var fundo = doc.createElement('div');
    fundo.className = 'aviso-uso-fundo';
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.setAttribute('aria-labelledby', 'aviso-uso-titulo');

    fundo.innerHTML =
      '<div class="aviso-uso-caixa">' +
        '<h2 class="aviso-uso-titulo" id="aviso-uso-titulo">' +
          '<span class="aviso-uso-icone" aria-hidden="true">!</span>Atenção' +
        '</h2>' +
        '<p>Esta plataforma reúne <strong>vagas de cursos e de emprego</strong> ' +
        'para consulta, e é de <strong>uso exclusivo de supervisores e agentes ' +
        'do Programa SuperAção</strong>.</p>' +
        '<p class="aviso-uso-destaque">As famílias atendidas não acessam o ' +
        'portal. Cabe a você pesquisar as oportunidades, selecionar as que ' +
        'fazem sentido para cada família e encaminhar a elas os links e as ' +
        'informações.</p>' +
        '<div class="aviso-uso-acao">' +
          '<button type="button" class="aviso-uso-botao" id="aviso-uso-ciente">' +
          'Ciente, acessar a plataforma</button>' +
        '</div>' +
      '</div>';

    doc.body.appendChild(fundo);
    doc.documentElement.classList.add('aviso-uso-travado');
    doc.body.classList.add('aviso-uso-travado');

    var botao = doc.getElementById('aviso-uso-ciente');
    var focoAnterior = doc.activeElement;
    botao.focus();

    // Mantém o foco dentro do modal enquanto ele estiver aberto.
    function prenderFoco(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        botao.focus();
      }
    }
    doc.addEventListener('keydown', prenderFoco, true);

    function liberar() {
      registrarConfirmacao();
      doc.removeEventListener('keydown', prenderFoco, true);
      doc.documentElement.classList.remove('aviso-uso-travado');
      doc.body.classList.remove('aviso-uso-travado');
      fundo.remove();
      estilo.remove();
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    }

    botao.addEventListener('click', liberar);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})(window);
