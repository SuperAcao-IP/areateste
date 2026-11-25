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

  /* ---------- equipe do programa (administrativo) ----------
     Quem é da equipe não entra na contagem de uso: os cliques de teste e de conferência não são do público.
     A lista guarda só a "impressão digital" (SHA-256 com um prefixo) dos e-mails, nunca os e-mails. Para incluir
     alguém: node -e "console.log(require('crypto').createHash('sha256').update('superacao:'+'nome@fgv.br').digest('hex'))" */
  var EQUIPE = [
    '56daba22c1ed90ca8c56c1eb0bc8be59cf94d072012537fa7d55facfe8fdd38d',
    '6ea4afb71b7b3fc6d41257488aedb32fe37e64e49b36545f0828681c916bc532',
    '7310bf0de291c75e85b0494e951f84caf47397d98917a06f246789485ec5a488',
    '79fecef28acb591e2706564ea5408c40a08d468373b6bee684c17c8f16cba28a',
    '822592231e1efc80ad1fc4fa332a5bf7f2b353b53068e79c431b58b16cf14904',
    '609cedd4b3db357812b1f4a75d34aa8d44639c38a55519f4edebf515ad17456c',
    '6c1643740ba8dba5cfbcc70f991bdec89dc92e3b503f2591f952143dfbdea52a',
    '11410d606a60a49105a3a441a38e93edff54e14d49ff8a9b7e81adb9fcf22aad',
    '7e20391dd85f3c5b02ce4da9ac87017776ce2e7b93a8e7b0caf5862797c1f462',
    'bd5b1380c8a4752fe0dc5521f1f15b523d4cc33f45fd6fb0b545a38b13284ef7',
    '5a8ada437b06d21a3b3e04c978249609083da8f8721077f2f48474bb17f88a3b',
    'ce0143850143a3a2a905ba3e4e6ba8447112f839090b27091f68cc38109fe3b0',
    'ec5dfee75d409a17b4f5b310239b2d052709e6452e0d6156c613d65050677890',
    'b11c104682c410520e7fb91714c7ccb63f3fcfa9ee5304141749e2f4b64ba8c0',
    '0755b6bf622e456217006f7a88dbeacf5371439a67d106fe513374e43708d98e',
    '76c7fce06808c4d2f406b055807aa841dfc5cb7a601c2bfcbd214f329e61ade2',
    '5fe1dabc6c34dad8f9b7940542aab57be289c50248d187213af9ee209c86d070',
    'fd1afb5042f5c194e8dec147e7df11ec6ced1e25c6d6319e6e17ed4528affd03'
  ];
  var ehEquipe = false, liberado = false, espera = [];
  function liberar() {
    if (liberado) return;
    liberado = true;
    var f = espera; espera = [];
    if (!ehEquipe) f.forEach(function (a) { enviar(a[0], a[1]); });
  }
  (function conferirEquipe() {
    try {
      var email = window.Auth && Auth.usuario && Auth.usuario();
      if (!email || !window.crypto || !crypto.subtle || !window.TextEncoder) { liberar(); return; }
      setTimeout(liberar, 1500);   // se a conferência demorar, segue sem travar o portal
      crypto.subtle.digest('SHA-256', new TextEncoder().encode('superacao:' + String(email).trim().toLowerCase()))
        .then(function (buf) {
          var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
          ehEquipe = EQUIPE.indexOf(hex) !== -1;
          liberar();
        }, liberar);
    } catch (e) { liberar(); }
  })();

  /* ---------- envio ---------- */
  function enviar(ev, p) {
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
  function track(ev, p) {
    if (!liberado) { espera.push([ev, p]); return; }
    if (ehEquipe) return;
    enviar(ev, p);
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
    ['senac', 'senac'], ['senai', 'senai'],
    ['ifmg', 'ifmg'], ['mundi.ifsul', 'mundi'], ['aprendamais', 'aprendamais'],
    ['mte.gov', 'spme'], ['empregabrasil', 'spme']
  ];
  function origemDe(href) {
    var h = String(href || '').toLowerCase();
    for (var i = 0; i < PLATAFORMAS.length; i++) {
      if (h.indexOf(PLATAFORMAS[i][0]) !== -1) return PLATAFORMAS[i][1];
    }
    return 'manual';   // curso cadastrado pela equipe (planilha) ou de outra origem
  }
  /* origem da vaga: robô (Gupy, Catho, InfoJobs, vagas.com...), Trampolim, Emprega Brasil ou planilha da equipe */
  var SITES_ROBO = ['gupy', 'catho', 'infojobs', 'vagas.com', 'linkedin', 'indeed'];
  function origemVagaDe(href) {
    var h = String(href || '').toLowerCase();
    if (h.indexOf('trampolim') !== -1) return 'trampolim';
    if (h.indexOf('mte.gov') !== -1 || h.indexOf('empregabrasil') !== -1) return 'spme';
    for (var i = 0; i < SITES_ROBO.length; i++) if (h.indexOf(SITES_ROBO[i]) !== -1) return 'robo';
    return 'planilha';
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

    /* Preparação para o mundo do trabalho: os 4 passos (cursos do SENAI/EVG e currículo/entrevista no Trampolim) */
    if (link.classList.contains('prep-btn')) {
      var passo = link.closest('[data-prep]');
      var nomePasso = passo ? limpar((passo.querySelector('h5') || {}).textContent) : '';
      track('clique_curso', ctx({ fonte: 'preparacao', item: 'Preparação · ' + (nomePasso || 'passo') }));
      return;
    }

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
      track('clique_vaga', ctx({ fonte: origemVagaDe(href), item: cargo || 'sem nome' }));
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
     8. Cadastros feitos no próprio portal (cursos e vagas): o evento sai do js/admin.js,
        depois que a planilha confirma o cadastro (cadastro_curso / cadastro_vaga).
     ===================================================================== */

  /* =====================================================================
     9. Cliques nos pins do mapa, um evento por tipo de pin
        (vagas, cursos presenciais, serviços e computador/internet)
     ===================================================================== */
  var PINS = [['pino-vaga', 'clique_pin_vaga'], ['pino-escola', 'clique_pin_escola'],
              ['pino-servico', 'clique_pin_servico'], ['pino-pc', 'clique_pin_computador']];
  document.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('.leaflet-marker-icon');
    if (!m) return;
    for (var i = 0; i < PINS.length; i++) {
      if (m.classList.contains(PINS[i][0])) { track(PINS[i][1], ctx()); return; }
    }
  }, true);

})();
