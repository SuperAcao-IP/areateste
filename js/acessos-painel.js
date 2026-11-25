/* =====================================================================
   PAINEL · aba "Acessos": quem entrou no portal (login com e-mail institucional)
   Os dados ficam na planilha (abas "emails" e "acessos_log") e só chegam aqui pelo Apps Script, que confere a chave
   do painel (propriedade PAINEL_CHAVE do script). Nada disso é gravado no repositório nem em arquivo público.
   Configuração: apps-script/LEIA-ME.md.
   ===================================================================== */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var fmt = function(n){ return (n || 0).toLocaleString('pt-BR'); };
  var norm = function(s){ return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); };
  var dataBR = function(d){ return d ? d.toLocaleDateString('pt-BR') : ''; };
  var MUNICIPIOS = (typeof CENTROS_MUNICIPIOS !== 'undefined') ? Object.keys(CENTROS_MUNICIPIOS).sort(function(a, b){ return a.localeCompare(b, 'pt-BR'); }) : [];
  var COR = '#0C63AA';

  var D = null, carregando = false, ligado = false;

  /* datas da planilha chegam como ISO (o Apps Script converte); texto DD/MM/AAAA também é aceito */
  function data(v){
    if(!v) return null;
    var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    var d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function campo(obj, re){ var k = Object.keys(obj).filter(function(x){ return re.test(x); })[0]; return k ? obj[k] : ''; }

  function mensagem(html){ $('acStatus').innerHTML = html; $('acResultados').classList.add('oculto'); }
  var COMO_CONFIGURAR = 'Para ligar esta aba, atualize o Apps Script da planilha para a versão v8 e cadastre a propriedade <b>PAINEL_CHAVE</b> ' +
    '(passo a passo em <code>apps-script/LEIA-ME.md</code> no repositório).';

  function abrir(){
    if(D || carregando) return;
    var url = (typeof APPS_SCRIPT_URL !== 'undefined') ? APPS_SCRIPT_URL : '';
    var chave = sessionStorage.getItem('sa_chave') || '';
    if(!url){ mensagem('Endereço do Apps Script não encontrado (APPS_SCRIPT_URL em js/config.js).'); return; }
    carregando = true;
    $('acStatus').textContent = 'Buscando a lista de acessos na planilha…';
    fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ acao: 'painel_acessos', chave: chave }) })
      .then(function(r){ return r.json(); })
      .then(function(r){
        carregando = false;
        if(r.status === 200 && Array.isArray(r.pessoas)){ D = preparar(r); montar(); return; }
        if(r.status === 401) return mensagem('A planilha respondeu que a chave do painel não confere com a propriedade <b>PAINEL_CHAVE</b> do Apps Script. Confira as duas.');
        if(r.status === 503) return mensagem('O Apps Script já está na versão nova, mas falta cadastrar a propriedade <b>PAINEL_CHAVE</b>. ' + COMO_CONFIGURAR);
        mensagem('O Apps Script da planilha ainda não tem a função de acessos. ' + COMO_CONFIGURAR);
      })
      .catch(function(e){ carregando = false; mensagem('Não consegui falar com o Apps Script da planilha (' + esc(e && e.message) + '). Tente de novo em instantes.'); });
  }

  function preparar(r){
    var pessoas = r.pessoas.map(function(p){
      var email = String(campo(p, /^e-?mail$/) || '').trim().toLowerCase();
      return {
        email: email,
        municipio: String(campo(p, /munic/) || '').trim(),
        primeiro: data(campo(p, /primeir/)),
        ultimo: data(campo(p, /ultim/)),
        acessos: Number(campo(p, /^acessos?$/)) || 0
      };
    }).filter(function(p){ return p.email; });
    var logins = (r.logins || []).map(function(l){ return { email: String(campo(l, /e-?mail/) || '').toLowerCase(), quando: data(campo(l, /data|hora/)) }; })
      .filter(function(l){ return l.email && l.quando; });
    return { pessoas: pessoas, logins: logins, versao: r.versao || '' };
  }

  var hoje0 = function(){ var d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  var diasDesde = function(d){ return d ? Math.floor((hoje0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5) : null; };
  function inicioSemana(d){ var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }   // segunda-feira

  function barras(itens, unidade){
    if(!itens.length) return '<p class="vazio">Sem dados.</p>';
    var max = Math.max.apply(null, itens.map(function(i){ return i.valor; })) || 1;
    return '<div class="vg-barras">' + itens.map(function(i){
      return '<div class="vg-barra"><span class="vg-rot">' + esc(i.rotulo) + '</span><span class="vg-trilho"><span class="vg-preenche" style="width:' +
        Math.max(1.5, i.valor / max * 100) + '%;background:' + COR + '"></span></span><span class="vg-val num">' + fmt(i.valor) + '</span></div>';
    }).join('') + '</div>';
  }
  /* colunas por semana: sempre as 16 últimas semanas seguidas (semana sem registro = 0, em vez de sumir do gráfico).
     A semana em andamento fica em azul claro, porque ainda não terminou. Alturas em pixels (a altura em % dependia
     do tamanho das outras peças da coluna e estourava para cima). */
  var isoLocal = function(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  /* desde = primeira semana em que o registro existe; as anteriores aparecem como "sem registro" (e não como zero) */
  function colunasSemana(contagem, unidade, desde){
    var atual = inicioSemana(new Date()), semanas = [];
    for(var k = 15; k >= 0; k--){ var d = new Date(atual); d.setDate(d.getDate() - 7 * k); semanas.push(isoLocal(d)); }
    if(!Object.keys(contagem).length) return '<p class="vazio">Ainda não há registros.</p>';
    var max = Math.max.apply(null, semanas.map(function(s){ return contagem[s] || 0; })) || 1;
    var ultima = semanas[semanas.length - 1];
    return '<div class="ac-colunas">' + semanas.map(function(s){
      var d = s.slice(8, 10) + '/' + s.slice(5, 7);
      if(desde && s < desde) return '<div class="ac-col" title="Semana de ' + d + ': ainda não havia registro"><span class="ac-num num">–</span><span class="ac-barra vazia" style="height:2px"></span><span class="ac-rot">' + d + '</span></div>';
      var n = contagem[s] || 0;
      return '<div class="ac-col" title="Semana de ' + d + (s === ultima ? ' (em andamento)' : '') + ': ' + n + ' ' + unidade + '"><span class="ac-num num">' + n + '</span>' +
        '<span class="ac-barra' + (s === ultima ? ' parcial' : '') + (n ? '' : ' zero') + '" style="height:' + (n ? Math.max(4, Math.round(n / max * 110)) : 2) + 'px"></span><span class="ac-rot">' + d + '</span></div>';
    }).join('') + '</div>';
  }

  function montar(){
    var P = D.pessoas, temMun = P.some(function(p){ return p.municipio; });
    var ativos30 = P.filter(function(p){ var d = diasDesde(p.ultimo); return d != null && d <= 30; }).length;
    var novos7 = P.filter(function(p){ var d = diasDesde(p.primeiro); return d != null && d <= 7; }).length;
    var munComAlguem = {};
    P.forEach(function(p){ if(p.municipio) munComAlguem[norm(p.municipio)] = 1; });
    var semNinguem = MUNICIPIOS.filter(function(m){ return !munComAlguem[norm(m)]; });
    $('acStatus').textContent = P.length + ' pessoas na aba "emails"' + (D.logins.length ? ' · ' + D.logins.length + ' logins registrados na aba "acessos_log"' : '') + '.';
    $('acKpis').innerHTML =
      '<div class="kpi"><p class="rotulo">Pessoas que já entraram</p><p class="valor num">' + fmt(P.length) + '</p><p class="nota">e-mails diferentes</p></div>' +
      '<div class="kpi"><p class="rotulo">Ativas nos últimos 30 dias</p><p class="valor num">' + fmt(ativos30) + '</p><p class="nota">último acesso no período</p></div>' +
      '<div class="kpi"><p class="rotulo">Novas na última semana</p><p class="valor num" style="color:var(--verde)">' + fmt(novos7) + '</p><p class="nota">primeiro acesso nos últimos 7 dias</p></div>' +
      '<div class="kpi"><p class="rotulo">Municípios com alguém</p><p class="valor num">' + (temMun ? fmt(MUNICIPIOS.length - semNinguem.length) + ' <small>de ' + MUNICIPIOS.length + '</small>' : '–') + '</p><p class="nota">' + (temMun ? 'pela coluna município da planilha' : 'a aba "emails" não tem coluna de município') + '</p></div>';

    var novasPorSemana = {}, loginsPorSemana = {};
    P.forEach(function(p){ if(p.primeiro){ var s = isoLocal(inicioSemana(p.primeiro)); novasPorSemana[s] = (novasPorSemana[s] || 0) + 1; } });
    var vistos = {};
    D.logins.forEach(function(l){ var s = isoLocal(inicioSemana(l.quando)); var k = s + '|' + l.email; if(!vistos[k]){ vistos[k] = 1; loginsPorSemana[s] = (loginsPorSemana[s] || 0) + 1; } });
    $('acNovas').innerHTML = colunasSemana(novasPorSemana, 'pessoas novas', Object.keys(novasPorSemana).sort()[0]);
    /* Com menos de 4 semanas de registro de logins o gráfico "quem entrou em cada semana" não diz nada (uma semana com 2 e outra com 95).
       Enquanto isso, mostra a semana do ÚLTIMO acesso de cada pessoa, que existe para todo o período. */
    var inicioLog = Object.keys(loginsPorSemana).sort()[0] || null;
    var ddmm = function(s){ return s.slice(8, 10) + '/' + s.slice(5, 7); };
    if(Object.keys(loginsPorSemana).length >= 4){
      $('acAtivasTitulo').textContent = 'Pessoas que entraram por semana';
      $('acAtivasSub').textContent = 'Pessoas diferentes com login em cada semana. O registro começou na semana de ' + ddmm(inicioLog) + '.';
      $('acAtivas').innerHTML = colunasSemana(loginsPorSemana, 'pessoas que entraram', inicioLog);
    }else{
      var ultimaPorSemana = {};
      P.forEach(function(p){ if(p.ultimo){ var s = isoLocal(inicioSemana(p.ultimo)); ultimaPorSemana[s] = (ultimaPorSemana[s] || 0) + 1; } });
      $('acAtivasTitulo').textContent = 'Última vez que cada pessoa entrou';
      $('acAtivasSub').textContent = 'Cada pessoa conta uma vez, na semana do último acesso. O registro semanal de logins só começou em ' + (inicioLog ? ddmm(inicioLog) : 'breve') + '.';
      $('acAtivas').innerHTML = colunasSemana(ultimaPorSemana, 'pessoas (último acesso)', Object.keys(ultimaPorSemana).sort()[0]);
    }
    var porMun = {};
    P.forEach(function(p){ var m = p.municipio || 'Sem município'; porMun[m] = (porMun[m] || 0) + 1; });
    $('acMunicipios').innerHTML = barras(Object.keys(porMun).map(function(m){ return { rotulo: m, valor: porMun[m] }; }).sort(function(a, b){ return b.valor - a.valor; }).slice(0, 20), 'pessoas');
    $('acSemNinguem').innerHTML = !temMun ? '<p class="vazio">Sem a coluna município na planilha não dá para saber.</p>' : !semNinguem.length
      ? '<p class="vazio">Todos os municípios do programa têm pelo menos uma pessoa cadastrada.</p>'
      : '<div class="vg-chips">' + semNinguem.map(function(m){ return '<span class="vg-chip">' + esc(m) + '</span>'; }).join('') + '</div>';

    var opcoes = Object.keys(porMun).sort(function(a, b){ return a.localeCompare(b, 'pt-BR'); });
    $('acFMunicipio').innerHTML = '<option value="">Todos</option>' + opcoes.map(function(m){ return '<option>' + esc(m) + '</option>'; }).join('');
    $('acResultados').classList.remove('oculto');
    if(!ligado){
      ligado = true;
      ['acFMunicipio', 'acFSituacao'].forEach(function(id){ $(id).addEventListener('change', desenharTabela); });
      $('acFBusca').addEventListener('input', desenharTabela);
      $('acCsv').addEventListener('click', baixar);
    }
    desenharTabela();
  }

  function filtrados(){
    var mun = $('acFMunicipio').value, sit = $('acFSituacao').value, busca = norm($('acFBusca').value);
    return D.pessoas.filter(function(p){
      var d = diasDesde(p.ultimo);
      if(mun && (p.municipio || 'Sem município') !== mun) return false;
      if(sit === 'ativos' && !(d != null && d <= 30)) return false;
      if(sit === 'sumiu' && !(d == null || d > 30)) return false;
      if(busca && norm(p.email).indexOf(busca) === -1) return false;
      return true;
    }).sort(function(a, b){ return (b.ultimo || 0) - (a.ultimo || 0); });
  }
  function desenharTabela(){
    var l = filtrados();
    $('acContagem').innerHTML = '<b>' + fmt(l.length) + '</b> pessoa(s) no recorte, de <b>' + fmt(D.pessoas.length) + '</b>.';
    $('acTabela').innerHTML = '<thead><tr><th>E-mail</th><th>Município</th><th>Primeiro acesso</th><th>Último acesso</th><th class="direita">Acessos</th><th class="direita">Dias sem entrar</th></tr></thead><tbody>' +
      l.map(function(p){
        var d = diasDesde(p.ultimo);
        return '<tr><td>' + esc(p.email) + '</td><td>' + esc(p.municipio || '–') + '</td><td>' + dataBR(p.primeiro) + '</td><td>' + dataBR(p.ultimo) + '</td>' +
          '<td class="direita num">' + fmt(p.acessos) + '</td><td class="direita num"' + (d != null && d > 30 ? ' style="color:var(--ambar)"' : '') + '>' + (d == null ? '–' : d) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  function baixar(){
    var c = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var linhas = ['"Acessos ao portal · baixado em ' + new Date().toLocaleDateString('pt-BR') + ' · uso interno: contém e-mails"',
                  'Email;Municipio;Primeiro acesso;Ultimo acesso;Acessos;Dias sem entrar'];
    filtrados().forEach(function(p){ linhas.push([p.email, p.municipio, dataBR(p.primeiro), dataBR(p.ultimo), p.acessos, diasDesde(p.ultimo)].map(c).join(';')); });
    var blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'superacao-acessos-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  window.AcessosPainel = { abrir: abrir };
})();
