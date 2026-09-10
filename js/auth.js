/* =============================================================
   SuperAção SP — controle de acesso por e-mail institucional
   -------------------------------------------------------------
   Barreira de conveniência (client-side). Impede o acesso casual,
   NÃO protege os dados: quem abrir o DevTools ou acessar
   dados.json direto continua vendo tudo.
   ============================================================= */
(function (global) {
  'use strict';

  var CONFIG = {
    // Domínios aceitos. Subdomínios entram automaticamente
    // (ex.: "fgv.br" também aceita "@alunos.fgv.br").
    dominiosPermitidos: ['fgv.br'],

    // Duração da sessão, em horas.
    horasDeSessao: 12,

    // URL do Apps Script, usada para registrar o e-mail na aba "emails".
    // Fica em branco de proposito: o valor vem do APPS_SCRIPT_URL do
    // js/config.js. So preencha aqui se a pagina de login nao carregar
    // o config.js.
    urlPlanilha: '',

    paginaLogin: 'login.html',
    paginaInicial: 'index.html',
    chave: 'superacao.sessao'
  };

  // Storage com fallback em memória (navegador em modo restrito,
  // iframe sem permissão, etc.) para nunca quebrar a página.
  var store = (function () {
    try {
      var teste = '__superacao_teste__';
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

  function normalizar(email) {
    return String(email || '').trim().toLowerCase();
  }

  function dominioValido(email) {
    var partes = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(normalizar(email));
    if (!partes) return false;
    var dominio = partes[1];
    for (var i = 0; i < CONFIG.dominiosPermitidos.length; i++) {
      var permitido = CONFIG.dominiosPermitidos[i];
      if (dominio === permitido) return true;
      if (dominio.length > permitido.length &&
          dominio.slice(-(permitido.length + 1)) === '.' + permitido) return true;
    }
    return false;
  }

  /* Pega o APPS_SCRIPT_URL do js/config.js.
     Nao da para ler como global.APPS_SCRIPT_URL: o config.js declara a
     constante com "const", e const/let no topo de um script NAO viram
     propriedade do window -- so "var" e funcao viram. Por isso o acesso
     e feito pelo nome puro, dentro de um try. */
  function urlDoConfig() {
    try {
      return (typeof APPS_SCRIPT_URL !== 'undefined') ? APPS_SCRIPT_URL : '';
    } catch (e) {
      return '';
    }
  }

  /* Marca na sessao que o e-mail ja foi registrado, para nao repetir
     a cada pagina aberta. */
  function marcarRegistrado() {
    try {
      var bruto = store.getItem(CONFIG.chave);
      if (!bruto) return;
      var s = JSON.parse(bruto);
      s.registrado = true;
      store.setItem(CONFIG.chave, JSON.stringify(s));
    } catch (e) { /* sem problema */ }
  }

  /* Registra o e-mail na planilha. E best-effort: se falhar, o login
     acontece do mesmo jeito e a pessoa nao ve erro nenhum.
     Devolve true se conseguiu disparar o envio. */
  function registrarAcesso(email) {
    try {
      var url = CONFIG.urlPlanilha || urlDoConfig();
      // Se a pagina atual nao carregou o config.js, o endereco ainda nao
      // existe aqui. Nao adianta insistir agora: a proxima pagina (que
      // carrega o config.js) tenta de novo, pela sessao.
      if (!url || String(url).indexOf('COLE_A_URL') >= 0) {
        console.warn('[auth] APPS_SCRIPT_URL nao encontrado nesta pagina; '
          + 'o e-mail sera registrado na proxima que carregar o config.js.');
        return false;
      }

      var corpo = JSON.stringify({ acao: 'registrar_email', email: email });

      // fetch com keepalive: sobrevive ao redirecionamento que vem logo
      // depois do login, igual ao sendBeacon, mas com resposta legivel no
      // console -- o que ajuda quando algo da errado.
      global.fetch(url, {
        method: 'POST',
        keepalive: true,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: corpo
      }).then(function (r) { return r.json(); })
        .then(function (r) { console.log('[auth] e-mail registrado:', r); })
        ['catch'](function (err) { console.warn('[auth] falhou o registro do e-mail:', err); });

      marcarRegistrado();
      return true;
    } catch (e) { return false; }
  }

  function sessao() {
    try {
      var bruto = store.getItem(CONFIG.chave);
      if (!bruto) return null;
      var s = JSON.parse(bruto);
      if (!s || !s.email || !s.expiraEm) return null;
      if (Date.now() > s.expiraEm) {
        store.removeItem(CONFIG.chave);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function entrar(email) {
    var e = normalizar(email);

    if (!e) {
      return { ok: false, erro: 'Informe seu e-mail institucional.' };
    }
    if (!dominioValido(e)) {
      return { ok: false, erro: 'E-mail institucional inválido.' };
    }

    var agora = Date.now();
    store.setItem(CONFIG.chave, JSON.stringify({
      email: e,
      criadaEm: agora,
      expiraEm: agora + CONFIG.horasDeSessao * 60 * 60 * 1000
    }));

    registrarAcesso(e);

    return { ok: true, email: e };
  }

  function sair() {
    store.removeItem(CONFIG.chave);
    global.location.replace(CONFIG.paginaLogin);
  }

  // Chame no <head>, antes do conteúdo renderizar.
  function proteger() {
    if (sessao()) return true;
    var atual = global.location.pathname.split('/').pop() ||
                CONFIG.paginaInicial;
    var destino = atual + global.location.search + global.location.hash;
    global.location.replace(
      CONFIG.paginaLogin + '?destino=' + encodeURIComponent(destino)
    );
    return false;
  }

  function usuario() {
    var s = sessao();
    return s ? s.email : null;
  }

  // Insere "nome@fgv.br · Sair" em qualquer elemento com
  // data-auth-usuario no HTML. Opcional.
  function montarBarra() {
    var alvos = global.document.querySelectorAll('[data-auth-usuario]');
    var email = usuario();
    if (!email) return;

    for (var i = 0; i < alvos.length; i++) {
      var span = global.document.createElement('span');
      span.textContent = email;

      var botao = global.document.createElement('button');
      botao.type = 'button';
      botao.textContent = 'Sair';
      botao.addEventListener('click', sair);

      alvos[i].appendChild(span);
      alvos[i].appendChild(global.document.createTextNode(' '));
      alvos[i].appendChild(botao);
    }
  }

  global.Auth = {
    config: CONFIG,
    entrar: entrar,
    sair: sair,
    proteger: proteger,
    sessao: sessao,
    usuario: usuario,
    dominioValido: dominioValido,
    registrarAcesso: registrarAcesso,
    montarBarra: montarBarra
  };

  /* Roda em toda pagina: monta a barra e, se a sessao ainda nao foi
     registrada na planilha, tenta agora. Assim o registro acontece mesmo
     que a pagina de login nao tenha o config.js carregado. */
  function aoCarregar() {
    montarBarra();
    var s = sessao();
    if (s && !s.registrado) registrarAcesso(s.email);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', aoCarregar);
  } else {
    aoCarregar();
  }
})(window);
