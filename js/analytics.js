/* ==========================================================================
   SuperAcao SP · coleta de uso do portal
   --------------------------------------------------------------------------
   Anota, de forma anonima, o que as pessoas fazem no portal e envia
   para o Worker da Cloudflare, que grava no banco D1.

   Nao usa cookie. Nao guarda nome, e-mail, telefone nem IP.
   O identificador de sessao e aleatorio e morre ao fechar a aba.

   COMO INSTALAR
   1. Salve este arquivo em  js/analytics.js
   2. No index.html, adicione a linha abaixo DEPOIS de app.js:
        <script src="js/analytics.js"></script>
   3. Troque o endereco na constante API logo abaixo.
   ========================================================================== */

(function () {
  'use strict';

  /* ====================== AJUSTE AQUI ====================== */
  var API = 'https://superacao-analytics.beatrizgribas.workers.dev';
  /* ========================================================= */

  if (API.indexOf('SEU-SUBDOMINIO') !== -1) {
    console.warn('[analytics] endereco do Worker ainda nao foi configurado');
    return;
  }

  /* ---------- identidade anonima de sessao ---------- */
  var sid;
  try {
    sid = sessionStorage.getItem('sa_sid');
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
      sessionStorage.setItem('sa_sid', sid);
    }
  } catch (e) {
    sid = String(Date.now()) + Math.random();
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
    } catch (e) { /* nunca deixa a coleta quebrar o portal */ }
  }

  /* Disponivel para o time do portal chamar de dentro do app.js / ui.js:
     saTrack('viu_resultados', { cidade: c, area: a, n: 12 });            */
  window.saTrack = track;

  /* ---------- estado observado ---------- */
  var cidadeAtual = null;
  var areaAtual = null;

  window.saSetCidade = function (v) { cidadeAtual = v || null; };
  window.saSetArea = function (v) { areaAtual = v || null; };

  function ctx(extra) {
    return Object.assign({ cidade: cidadeAtual, area: areaAtual }, extra || {});
  }

  /* ---------- 1. visita ---------- */
  track('visitou');

  /* ---------- 2. escolha de municipio ---------- */
  var sel = document.getElementById('cidadesSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      var texto = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : sel.value;
      if (!texto || !sel.value) { return; }
      cidadeAtual = texto.trim();
      areaAtual = null;
      track('selecionou_municipio', { cidade: cidadeAtual });
      agendarContagem();
    });
  }

  /* ---------- 3. escolha de area ---------- */
  /* Pega qualquer elemento clicado que carregue a area num atributo de dados
     ou numa classe. Se o portal mudar, basta chamar saSetArea() no app.js.   */
  document.addEventListener('click', function (e) {
    var alvo = e.target.closest('[data-area], [data-slug], [data-categoria]');
    if (!alvo || !document.getElementById('painelCidade')) { return; }
    if (!document.getElementById('painelCidade').contains(alvo)) { return; }
    var a = alvo.getAttribute('data-area') ||
            alvo.getAttribute('data-categoria') ||
            alvo.getAttribute('data-slug');
    if (!a) { return; }
    areaAtual = String(a).trim();
    track('selecionou_area', ctx());
    agendarContagem();
  }, true);

  /* ---------- 4. abertura do mapa ---------- */
  var mapaJaContado = false;
  function vigiarMapa() {
    if (mapaJaContado) { return; }
    if (document.querySelector('.leaflet-container')) {
      mapaJaContado = true;
      track('abriu_mapa', ctx());
    }
  }

  /* ---------- 5. cliques em cursos e vagas ---------- */
  var PLATAFORMAS = [
    ['escolavirtual', 'evg'], ['evg', 'evg'],
    ['sebrae', 'sebrae'],
    ['bradesco', 'bradesco'], ['ev.org.br', 'bradesco'],
    ['trampolim', 'trampolim'],
    ['senac', 'senac']
  ];

  function origemDe(href) {
    var h = String(href).toLowerCase();
    for (var i = 0; i < PLATAFORMAS.length; i++) {
      if (h.indexOf(PLATAFORMAS[i][0]) !== -1) { return PLATAFORMAS[i][1]; }
    }
    return 'outro';
  }

  /* Distingue curso de vaga olhando o texto do bloco que contem o link.
     Heuristica: se o bloco ou um titulo proximo fala em vaga/emprego, e vaga. */
  function ehVaga(el) {
    var no = el;
    for (var i = 0; i < 5 && no; i++) {
      var cls = (no.className && typeof no.className === 'string') ? no.className.toLowerCase() : '';
      if (cls.indexOf('vaga') !== -1) { return true; }
      if (cls.indexOf('curso') !== -1) { return false; }
      no = no.parentElement;
    }
    var txt = (el.textContent || '').toLowerCase();
    return txt.indexOf('vaga') !== -1 || txt.indexOf('candidatar') !== -1;
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="http"]');
    if (!link) { return; }
    var href = link.getAttribute('href') || '';

    /* WhatsApp do rodape */
    if (href.indexOf('wa.me') !== -1) {
      track('clique_whatsapp');
      return;
    }

    /* Links institucionais do rodape nao contam como oportunidade */
    if (link.closest('footer')) { return; }

    var painel = document.getElementById('painelCidade');
    if (!painel || !painel.contains(link)) { return; }

    var nome = (link.getAttribute('title') || link.textContent || '').replace(/\s+/g, ' ').trim();
    track(ehVaga(link) ? 'clique_vaga' : 'clique_curso', ctx({
      fonte: origemDe(href),
      item: nome.slice(0, 200)
    }));
  }, true);

  /* ---------- 6. aviso de curso pago do Senac ---------- */
  var modal = document.getElementById('modalSenac');
  if (modal) {
    var avisoAberto = false;
    new MutationObserver(function () {
      var visivel = modal.offsetParent !== null &&
                    getComputedStyle(modal).display !== 'none';
      if (visivel && !avisoAberto) {
        avisoAberto = true;
        track('viu_aviso_senac', ctx());
      } else if (!visivel) {
        avisoAberto = false;
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });

    var linkSenac = document.getElementById('modalSenacLink');
    if (linkSenac) {
      linkSenac.addEventListener('click', function () {
        var nome = (linkSenac.textContent || '').replace(/\s+/g, ' ').trim();
        track('prosseguiu_curso_pago', ctx({ fonte: 'senac', item: nome.slice(0, 200) }));
      });
    }
  }

  /* ---------- 7. cadastro manual pelo painel administrativo ---------- */
  var admin = document.getElementById('admin');
  if (admin) {
    admin.addEventListener('click', function (e) {
      var b = e.target.closest('button, [type="submit"]');
      if (!b) { return; }
      var t = (b.textContent || '').toLowerCase();
      if (t.indexOf('salvar') !== -1 || t.indexOf('cadastrar') !== -1 || t.indexOf('adicionar') !== -1) {
        track('cadastro_manual', { cidade: cidadeAtual });
      }
    }, true);
  }

  /* ---------- 8. resultados encontrados (aproximacao) ---------- *
     Conta quantos links de oportunidade existem no painel depois que
     a tela para de mudar. Zero links = ninguem achou nada.
     Esta e a unica medida aproximada do arquivo. Ver observacao no final.  */
  var painel = document.getElementById('painelCidade');
  var timer = null;
  var ultimaAssinatura = '';

  function agendarContagem() {
    if (!painel) { return; }
    clearTimeout(timer);
    timer = setTimeout(contar, 900);
  }

  function contar() {
    if (!painel || !cidadeAtual) { return; }
    var links = painel.querySelectorAll('a[href^="http"]');
    var n = links.length;
    var assinatura = cidadeAtual + '|' + (areaAtual || '') + '|' + n;
    if (assinatura === ultimaAssinatura) { return; }
    ultimaAssinatura = assinatura;
    track(n > 0 ? 'viu_resultados' : 'busca_sem_resultado', ctx({ n: n }));
  }

  if (painel) {
    new MutationObserver(function () {
      vigiarMapa();
      agendarContagem();
    }).observe(painel, { childList: true, subtree: true });
  }

})();
