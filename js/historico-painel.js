/* =====================================================================
   PAINEL · aba "Histórico" (cursos e vagas)
   Lê dados/historico-cursos.json e dados/historico-vagas.json (gerados toda segunda por scripts/atualizar-historico.js).
   Cada item traz as semanas exatas em que esteve no portal (p = índices em "semanas").
   Filtros comuns: período, município, área, origem, situação, busca. Cursos: modalidade e carga. Vagas: contrato e
   "sem experiência". Downloads em CSV: o que está filtrado, só os novos da última semana, ou os novos desde uma data.
   Cada arquivo só é baixado quando o seletor é aberto.
   ===================================================================== */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var normal = function(s){ return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); };
  var fmt = function(n){ return (n || 0).toLocaleString('pt-BR'); };
  var dataBR = function(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; };

  var TIPOS = {
    cursos: { arquivo: 'dados/historico-cursos.json', campo: 'cursos', nome: 'curso', nomes: 'cursos', titulo: function(c){ return c.curso; },
              colunas: ['Curso', 'Origem', 'Modalidade', 'Carga', 'Área', 'Onde'],
              celulas: function(c){ return [esc(c.fonte), '<span class="tag ' + (c.classe === 'presencial' ? 'pres' : 'onl') + '">' + esc(c.modalidade || c.classe) + '</span>', esc(c.carga), esc(c.area), municipiosTxt(c)]; },
              csvCab: 'Curso;Instituicao;Origem;Modalidade;Carga;Area;Municipios;Entrou no portal;Ultima vez no portal;Semanas no portal;Situacao;Link',
              csvLinha: function(c){ return [c.curso, c.inst, c.fonte, c.modalidade || c.classe, c.carga, c.area, c.municipios.join(', ')]; } },
    vagas:  { arquivo: 'dados/historico-vagas.json', campo: 'vagas', nome: 'vaga', nomes: 'vagas', titulo: function(v){ return v.cargo; },
              colunas: ['Vaga', 'Empresa', 'Origem', 'Contrato', 'Área', 'Onde'],
              celulas: function(v){ return [esc(v.empresa), esc(v.fonte), esc(v.tipo || '–') + (/^sem experi/i.test(v.experiencia || '') ? ' <span class="tag pres">sem experiência</span>' : ''), esc(v.area), municipiosTxt(v)]; },
              csvCab: 'Vaga;Empresa;Origem;Cidade da vaga;Contrato;Experiencia;Escolaridade;Area;Municipios;Entrou no portal;Ultima vez no portal;Semanas no portal;Situacao;Link',
              csvLinha: function(v){ return [v.cargo, v.empresa, v.fonte, v.cidade, v.tipo, v.experiencia, v.escolaridade, v.area, v.municipios.join(', ')]; } }
  };
  var dados = {}, tipo = 'cursos', ligado = false, carregando = {};
  var H = function(){ return dados[tipo]; };
  var itens = function(){ return H()[TIPOS[tipo].campo] || []; };
  var ultima = function(){ var h = H(); return h.semanas[h.semanas.length - 1] || h.atualizado; };
  var noAr = function(c){ return c.ultima === ultima(); };

  function municipiosTxt(c){
    if(c.municipios.length === 1) return esc(c.municipios[0] === 'Online' ? 'Online (todos)' : c.municipios[0]);
    return '<span title="' + esc(c.municipios.join(', ')) + '">' + c.municipios.length + ' municípios</span>';
  }

  function abrir(){ carregar(tipo); }
  function carregar(t){
    if(dados[t]){ montar(); return; }
    if(carregando[t]) return;
    carregando[t] = true;
    $('hStatus').textContent = 'Carregando o histórico de ' + TIPOS[t].nomes + '…';
    fetch(TIPOS[t].arquivo + '?t=' + Date.now())
      .then(function(r){ if(r.status === 404) return null; if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j){
        carregando[t] = false;
        if(!j){
          if(t === tipo){ $('hStatus').textContent = 'O histórico de ' + TIPOS[t].nomes + ' ainda não existe: ele começa no próximo retrato semanal (segunda).'; $('hKpis').innerHTML = ''; $('hResultados').classList.add('oculto'); }
          return;
        }
        dados[t] = j;
        if(t === tipo) montar();
      })
      .catch(function(e){ carregando[t] = false; $('hStatus').textContent = 'Não consegui carregar ' + TIPOS[t].arquivo + ': ' + (e && e.message) + '.'; });
  }

  function opcoes(id, valores){
    var el = $(id), primeira = el.options[0].outerHTML, atual = el.value;
    el.innerHTML = primeira + valores.map(function(v){ return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    if(valores.indexOf(atual) >= 0) el.value = atual;
  }
  function unicos(f){
    var s = {};
    itens().forEach(function(c){ [].concat(f(c)).forEach(function(v){ if(v) s[v] = 1; }); });
    return Object.keys(s).sort(function(a, b){ return a.localeCompare(b, 'pt-BR'); });
  }

  function montar(){
    var T = TIPOS[tipo], h = H(), lista = itens(), ult = ultima();
    var novos = lista.filter(function(c){ return c.primeira === ult; }).length, agora = lista.filter(noAr).length;
    $('hStatus').textContent = 'Histórico de ' + T.nomes + ' de ' + dataBR(h.semanas[0]) + ' a ' + dataBR(ult) + ' · ' + h.semanas.length + ' retrato(s) semanal(is).';
    $('hKpis').innerHTML =
      '<div class="kpi"><p class="rotulo">' + (tipo === 'cursos' ? 'Cursos' : 'Vagas') + ' que já passaram</p><p class="valor num">' + fmt(lista.length) + '</p><p class="nota">sem repetir</p></div>' +
      '<div class="kpi"><p class="rotulo">No portal agora</p><p class="valor num">' + fmt(agora) + '</p><p class="nota">no retrato de ' + dataBR(ult) + '</p></div>' +
      '<div class="kpi"><p class="rotulo">' + (tipo === 'cursos' ? 'Novos' : 'Novas') + ' na última semana</p><p class="valor num" style="color:var(--verde)">' + fmt(novos) + '</p><p class="nota">entraram em ' + dataBR(ult) + '</p></div>' +
      '<div class="kpi"><p class="rotulo">Já ' + (tipo === 'cursos' ? 'saíram' : 'fecharam ou saíram') + '</p><p class="valor num">' + fmt(lista.length - agora) + '</p><p class="nota">não estão mais no portal</p></div>';
    $('hTitulo').textContent = tipo === 'cursos' ? 'Cursos' : 'Vagas';
    Array.prototype.forEach.call(document.querySelectorAll('#aba-historico .so-cursos'), function(el){ el.classList.toggle('oculto', tipo !== 'cursos'); });
    Array.prototype.forEach.call(document.querySelectorAll('#aba-historico .so-vagas'), function(el){ el.classList.toggle('oculto', tipo !== 'vagas'); });
    opcoes('hMunicipio', unicos(function(c){ return c.municipios; }).filter(function(m){ return m !== 'Online'; }));
    opcoes('hArea', unicos(function(c){ return c.area; }));
    opcoes('hFonte', unicos(function(c){ return c.fonte; }));
    if(tipo === 'vagas') opcoes('hContrato', unicos(function(c){ return c.tipo; }));
    ['hDe', 'hAte', 'hNovosDesde', 'hDesdeData'].forEach(function(id){ $(id).min = h.semanas[0]; $(id).max = ult; });
    $('hResultados').classList.remove('oculto');
    if(!ligado){
      ligado = true;
      ['hDe', 'hAte', 'hNovosDesde', 'hModalidade', 'hCarga', 'hMunicipio', 'hArea', 'hFonte', 'hSituacao', 'hComOnline', 'hContrato', 'hSemExp'].forEach(function(id){ $(id).addEventListener('change', desenhar); });
      $('hBusca').addEventListener('input', desenhar);
      $('hCsvFiltrado').addEventListener('click', function(){ baixar(filtrados(), 'superacao-historico-' + tipo, descreverFiltros()); });
      $('hCsvSemana').addEventListener('click', function(){
        baixar(filtrados().filter(function(c){ return c.primeira === ultima(); }), 'superacao-' + tipo + '-novos-semana', 'novos no retrato de ' + dataBR(ultima()) + filtrosTxt());
      });
      $('hCsvDesde').addEventListener('click', function(){
        var d = $('hDesdeData').value;
        if(!d){ $('hDesdeData').focus(); alert('Escolha a data ao lado do botão.'); return; }
        baixar(filtrados().filter(function(c){ return c.primeira >= d; }), 'superacao-' + tipo + '-novos-desde-' + d, 'novos desde ' + dataBR(d) + filtrosTxt());
      });
    }
    desenhar();
  }

  function filtrados(){
    var de = $('hDe').value, ate = $('hAte').value, desde = $('hNovosDesde').value;
    var mun = $('hMunicipio').value, area = $('hArea').value, fonte = $('hFonte').value, sit = $('hSituacao').value;
    var busca = normal($('hBusca').value);
    var mod = $('hModalidade').value, carga = $('hCarga').value, comOnline = $('hComOnline').checked;
    var faixa = carga && carga !== 'sem' ? carga.split('-').map(Number) : null;
    var contrato = $('hContrato').value, semExp = $('hSemExp').checked;
    var T = TIPOS[tipo];
    return itens().filter(function(c){
      if(de && c.ultima < de) return false;                  // esteve no portal em algum momento do período
      if(ate && c.primeira > ate) return false;
      if(desde && c.primeira < desde) return false;
      if(mun && c.municipios.indexOf(mun) === -1 && !(tipo === 'cursos' && comOnline && c.municipios.indexOf('Online') !== -1)) return false;
      if(area && c.area !== area) return false;
      if(fonte && c.fonte !== fonte) return false;
      if(sit === 'no_ar' && !noAr(c)) return false;
      if(sit === 'saiu' && noAr(c)) return false;
      if(busca && normal(T.titulo(c) + ' ' + (c.empresa || '')).indexOf(busca) === -1) return false;
      if(tipo === 'cursos'){
        if(mod && c.classe !== mod) return false;
        if(carga === 'sem' && c.carga_h != null) return false;
        if(faixa && (c.carga_h == null || c.carga_h < faixa[0] || c.carga_h > faixa[1])) return false;
      }else{
        if(contrato && c.tipo !== contrato) return false;
        if(semExp && !/^sem experi/i.test(c.experiencia || '')) return false;
      }
      return true;
    }).sort(function(a, b){ return (b.primeira > a.primeira ? 1 : b.primeira < a.primeira ? -1 : 0) || T.titulo(a).localeCompare(T.titulo(b), 'pt-BR'); });
  }

  function desenhar(){
    var T = TIPOS[tipo], lista = filtrados();
    $('hContagem').innerHTML = '<b>' + fmt(lista.length) + '</b> ' + T.nome + '(s) no recorte, de <b>' + fmt(itens().length) + '</b> no histórico' +
      (lista.length > 400 ? '. Exibindo os 400 primeiros (os mais recentes); o CSV traz todos.' : '.');
    var html = '<thead><tr>' + T.colunas.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '<th>Entrou</th><th>Última vez</th><th>Semanas</th><th>Link</th></tr></thead><tbody>';
    lista.slice(0, 400).forEach(function(c){
      html += '<tr><td class="trunc">' + esc(T.titulo(c)) + (noAr(c) ? '' : ' <span class="tag" title="não está mais no portal">saiu</span>') + '</td>' +
        T.celulas(c).map(function(x){ return '<td>' + x + '</td>'; }).join('') +
        '<td>' + dataBR(c.primeira) + '</td><td>' + dataBR(c.ultima) + '</td><td>' + (c.semanas || '') + '</td>' +
        '<td>' + (c.link ? '<a href="' + esc(c.link) + '" target="_blank" rel="noopener">abrir</a>' : '') + '</td></tr>';
    });
    $('hTabela').innerHTML = html + '</tbody>';
  }

  function filtrosTxt(){ var d = descreverFiltros(); return d === 'sem filtros' ? '' : '  ·  ' + d; }
  function descreverFiltros(){
    var r = [];
    var sel = function(id){ var el = $(id); return el.value && !el.closest('.oculto') ? el.options[el.selectedIndex].text : ''; };
    if($('hDe').value || $('hAte').value) r.push('no portal entre ' + (dataBR($('hDe').value) || 'o início') + ' e ' + (dataBR($('hAte').value) || 'hoje'));
    if($('hNovosDesde').value) r.push('entrou a partir de ' + dataBR($('hNovosDesde').value));
    [['hModalidade','modalidade'],['hCarga','carga'],['hContrato','contrato'],['hMunicipio','município'],['hArea','área'],['hFonte','origem'],['hSituacao','situação']].forEach(function(p){
      var v = sel(p[0]); if(v) r.push(p[1] + ': ' + v);
    });
    if(tipo === 'vagas' && $('hSemExp').checked) r.push('só sem experiência');
    if($('hBusca').value) r.push('busca: ' + $('hBusca').value);
    return r.length ? 'filtros: ' + r.join(', ') : 'sem filtros';
  }

  function baixar(lista, nome, observacao){
    var T = TIPOS[tipo];
    var campo = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var d = new Date();
    var linhas = [campo('Histórico de ' + T.nomes + ' baixado em ' + d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) +
                        '  ·  ' + lista.length + ' ' + T.nomes + '  ·  ' + observacao), T.csvCab];
    lista.forEach(function(c){
      linhas.push(T.csvLinha(c).concat([dataBR(c.primeira), dataBR(c.ultima), c.semanas, noAr(c) ? 'No portal' : 'Saiu', c.link]).map(campo).join(';'));
    });
    var blob = new Blob(['﻿' + linhas.join('\n')], {type: 'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome + '-' + d.toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', function(){
    Array.prototype.forEach.call(document.querySelectorAll('#hSeletor button'), function(b){
      b.addEventListener('click', function(){
        tipo = b.dataset.h;
        Array.prototype.forEach.call(document.querySelectorAll('#hSeletor button'), function(o){ o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        carregar(tipo);
      });
    });
  });

  window.HistoricoCursos = { abrir: abrir };
})();
