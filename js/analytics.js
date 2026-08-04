/* ==========================================================================
   SuperAcao SP · coleta de uso do portal   (versao 2)
   --------------------------------------------------------------------------
   Anota, de forma anonima, o que as pessoas fazem no portal e envia para o
   Worker da Cloudflare, que grava no banco D1.

   Nao usa cookie. Nao guarda nome, e-mail, telefone nem IP. O identificador
   de sessao e aleatorio e morre quando a pessoa fecha a aba.

   Diferenca para a versao 1: em vez de adivinhar pelos cliques, esta versao
   se pendura nas funcoes reais do portal (selecionarCidade, selecionarArea,
   initMapa) e le os nomes direto dos cartoes (.curso .nome e .vaga .cargo).
   Por isso registra o NOME DO CURSO, e nao o texto do botao.

   INSTALACAO
   1. Salve em  js/analytics.js
   2. No index.html, deixe esta linha como a ultima da lista de scripts:
        <script src="js/analytics.js"></script>
   3. Confira o endereco na constante API logo abaixo.
   ========================================================================== */

(function () {
  'use strict';

  /* ====================== AJUSTE AQUI ====================== */
  var API = 'https://superacao-analytics.beatrizgribas.workers.dev';
  /* ========================================================= */

  if (API.indexOf('https://superacao-analytics.beatrizgribas.workers.dev') !== -1) {
    console.warn('[analytics] endereco do Worker ainda nao configurado');
    return;
  }

  /* ---------- identidade anonima de sessao ---------- */
  var sid;
  try {
    sid = sessionStorage.getItem('sa_sid');
    if (!sid) {
      sid = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('sa_sid', sid);
    }
  } catch (e) {
    sid = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  var dispositivo = window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop';

  /* ---------- envio ---------- */
  function track(ev, p) {
    try {
      var corpo = JSON.stringify(Object.assign(
        { ev: ev, sid: sid, dispositivo: dispositivo }, p || {}
      ));
      var blob = new Blob([corpo], { type: 'text/plain;charset=UTF-8' });
      if (!navigator.sendBeacon || !navigator.sendBeacon(API + '/ev', blob)) {
        fetch(API + '/ev', { method: 'POST', body: corpo, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* a coleta nunca pode quebrar o portal */ }
  }
  window.saTrack = track;

  /* ---------- estado ---------- */
  var cidadeAtual = null;
  var areaAtual = null;      // nome legivel, ex.: "Beleza e Estetica"
  var chaveBusca = '';       // cidade|area da busca corrente
  var buscaContada = false;
  var timerBusca = null;
  var ultimoSenac = '';

  function ctx(extra) {
    return Object.assign({ cidade: cidadeAtual, area: areaAtual }, extra || {});
  }
  function limpar(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  function nomeDaArea(id) {
    try {
      if (typeof areaInfo === 'function') {
        var a = areaInfo(id);
        if (a && a.nome) return a.nome;
      }
    } catch (e) {}
    return id || null;
  }

  /* ---------- origem do curso, pelo endereco de destino ---------- */
  var PLATAFORMAS = [
    ['escolavirtual', 'evg'], ['evg.gov', 'evg'],
    ['sebrae', 'sebrae'],
    ['bradesco', 'bradesco'], ['ev.org.br', 'bradesco'],
    ['trampolim', 'trampolim'],
    ['senac', 'senac'],
    ['mte.gov', 'spme'], ['empregabrasil', 'spme']
  ];
  function origemDe(href) {
    var h = String(href || '').toLowerCase();
    for (var i = 0; i < PLATAFORMAS.length; i++) {
      if (h.indexOf(PLATAFORMAS[i][0]) !== -1) return PLATAFORMAS[i][1];
    }
    return 'manual';
  }

  /* ---------- 1. visita ---------- */
  track('visitou');

  /* =====================================================================
     2. Escolha de municipio  ·  envolve a funcao selecionarCidade do ui.js
     ===================================================================== */
  if (typeof window.selecionarCidade === 'function') {
    var origSelCidade = window.selecionarCidade;
    window.selecionarCidade = function (cidade) {
      cidadeAtual = limpar(cidade) || null;
      areaAtual = null;
      chaveBusca = '';
      track('selecionou_municipio', { cidade: cidadeAtual });
      return origSelCidade.apply(this, arguments);
    };
  }

  /* =====================================================================
     3. Escolha de area  ·  envolve selecionarArea
     O portal reexecuta selecionarArea a cada fonte que termina de carregar
     (Trampolim, Sebrae, planilha). Por isso so registramos quando a area
     realmente muda, e a contagem de resultados espera a tela sossegar.
     ===================================================================== */
  if (typeof window.selecionarArea === 'function') {
    var origSelArea = window.selecionarArea;
    window.selecionarArea = function (cidade, areaId, btn) {
      var nova = (limpar(cidade) || cidadeAtual) + '|' + areaId;
      if (nova !== chaveBusca) {
        chaveBusca = nova;
        buscaContada = false;
        cidadeAtual = limpar(cidade) || cidadeAtual;
        areaAtual = nomeDaArea(areaId);
        track('selecionou_area', ctx());
      }
      agendarContagem();
      return origSelArea.apply(this, arguments);
    };
  }

  /* =====================================================================
     4. Resultados encontrados
     Conta os cartoes reais (.curso e .vaga) 2,5s depois da ultima mudanca,
     para dar tempo de todas as fontes chegarem. Manda um evento por busca.
     ===================================================================== */
  function agendarContagem() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(contar, 2500);
  }
  function contar() {
    if (buscaContada || !cidadeAtual || !areaAtual) return;
    var painel = document.getElementById('painelCidade');
    if (!painel) return;
    var n = painel.querySelectorAll('.curso, .vaga').length;
    buscaContada = true;
    track(n > 0 ? 'viu_resultados' : 'busca_sem_resultado', ctx({ n: n }));
  }

  /* =====================================================================
     5. Abertura do mapa  ·  envolve initMapa
     ===================================================================== */
  if (typeof window.initMapa === 'function') {
    var origInitMapa = window.initMapa;
    var mapaContado = false;
    window.initMapa = function (cidade) {
      if (!mapaContado) {
        mapaContado = true;
        track('abriu_mapa', ctx({ cidade: limpar(cidade) || cidadeAtual }));
      }
      return origInitMapa.apply(this, arguments);
    };
  }

  /* =====================================================================
     6. Cliques em cursos e vagas
     O nome vem do cartao (.curso .nome / .vaga .cargo), nunca do botao.
     ===================================================================== */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href') || '';

    /* WhatsApp do rodape */
    if (href.indexOf('wa.me') !== -1) { track('clique_whatsapp'); return; }
    if (link.closest('footer')) return;

    /* curso */
    if (link.classList.contains('btn-curso')) {
      var cartao = link.closest('.curso');
      var nome = cartao ? limpar((cartao.querySelector('.nome') || {}).textContent) : '';
      var inst = cartao ? limpar((cartao.querySelector('.inst') || {}).textContent) : '';

      /* Senac abre o aviso antes de sair: guarda o nome para o evento seguinte */
      if (link.classList.contains('btn-senac')) {
        ultimoSenac = nome;
        return;
      }
      track('clique_curso', ctx({ fonte: origemDe(href), item: nome || inst || 'sem nome' }));
      return;
    }

    /* vaga individual */
    if (link.classList.contains('btn-vaga')) {
      var cv = link.closest('.vaga');
      var cargo = cv ? limpar((cv.querySelector('.cargo') || {}).textContent) : '';
      track('clique_vaga', ctx({ fonte: origemDe(href), item: cargo || 'sem nome' }));
      return;
    }

    /* atalhos para a lista completa no Trampolim e para o Emprega Brasil */
    if (link.classList.contains('btn-trampolim')) {
      var origem = origemDe(href);
      track('clique_vaga', ctx({
        fonte: origem,
        item: origem === 'spme' ? '[atalho] Portal Emprega Brasil'
                                : '[atalho] Lista completa de vagas no Trampolim SP'
      }));
    }
  }, true);

  /* =====================================================================
     7. Aviso de curso pago do Senac
     ===================================================================== */
  var modal = document.getElementById('modalSenac');
  if (modal) {
    var avisoAberto = false;
    new MutationObserver(function () {
      var visivel = modal.classList.contains('aberto');
      if (visivel && !avisoAberto) {
        avisoAberto = true;
        track('viu_aviso_senac', ctx({ fonte: 'senac', item: ultimoSenac || 'sem nome' }));
      } else if (!visivel) {
        avisoAberto = false;
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });

    var linkSenac = document.getElementById('modalSenacLink');
    if (linkSenac) {
      linkSenac.addEventListener('click', function () {
        track('prosseguiu_curso_pago', ctx({ fonte: 'senac', item: ultimoSenac || 'sem nome' }));
      });
    }
  }

  /* =====================================================================
     8. Cadastro manual pelo painel administrativo
     ===================================================================== */
  var admin = document.getElementById('admin');
  if (admin) {
    admin.addEventListener('click', function (e) {
      var b = e.target.closest('button, [type="submit"]');
      if (!b) return;
      var t = (b.textContent || '').toLowerCase();
      if (t.indexOf('salvar') !== -1 || t.indexOf('cadastrar') !== -1 || t.indexOf('adicionar') !== -1) {
        track('cadastro_manual', { cidade: cidadeAtual });
      }
    }, true);
  }

})();
