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
      return {
        ok: false,
        erro: 'Este acesso é restrito a e-mails @' + CONFIG.dominiosPermitidos[0] + '.'
      };
    }

    var agora = Date.now();
    store.setItem(CONFIG.chave, JSON.stringify({
      email: e,
      criadaEm: agora,
      expiraEm: agora + CONFIG.horasDeSessao * 60 * 60 * 1000
    }));

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
    montarBarra: montarBarra
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', montarBarra);
  } else {
    montarBarra();
  }
})(window);
