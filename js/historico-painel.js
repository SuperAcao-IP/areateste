/* =====================================================================
   PAINEL · aba "Histórico de cursos"
   Lê dados/historico-cursos.json (gerado toda segunda por scripts/atualizar-historico.js) e deixa filtrar por período,
   modalidade, carga horária, município, área, origem e situação. Baixa CSV do que está filtrado, só dos novos da
   última semana ou dos novos desde uma data, sem repetir curso.
   O arquivo só é baixado quando a aba é aberta.
   ===================================================================== */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var normal = function(s){ return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); };
  var fmt = function(n){ return (n || 0).toLocaleString('pt-BR'); };
  var dataBR = function(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; };

  var H = null, carregando = false, ligado = false;

  function abrir(){
    if(H || carregando) return;
    carregando = true;
    fetch('dados/historico-cursos.json?t=' + Date.now())
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j){ H = j; carregando = false; montar(); })
      .catch(function(e){
        carregando = false;
        $('hStatus').textContent = 'Não consegui carregar o histórico (dados/historico-cursos.json): ' + (e && e.message) + '. Tente de novo em instantes.';
      });
  }

  function opcoes(id, valores){
    var el = $(id), primeira = el.options[0].outerHTML;
    el.innerHTML = primeira + valores.map(function(v){ return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
  }
  function unicos(f){
    var s = {};
    H.cursos.forEach(function(c){ [].concat(f(c)).forEach(function(v){ if(v) s[v] = 1; }); });
    return Object.keys(s).sort(function(a, b){ return a.localeCompare(b, 'pt-BR'); });
  }
  var ultima = function(){ return H.semanas[H.semanas.length - 1] || H.atualizado; };
  var noAr = function(c){ return c.ultima === ultima(); };

  function montar(){
    var cursos = H.cursos, ult = ultima();
    var novos = cursos.filter(function(c){ return c.primeira === ult; }).length;
    $('hStatus').textContent = 'Histórico de ' + dataBR(H.semanas[0]) + ' a ' + dataBR(ult) + ' · ' + H.semanas.length + ' retratos semanais.';
    $('hKpis').innerHTML =
      '<div class="kpi"><p class="rotulo">Cursos que já passaram</p><p class="valor num">' + fmt(cursos.length) + '</p><p class="nota">sem repetir</p></div>' +
      '<div class="kpi"><p class="rotulo">No portal agora</p><p class="valor num">' + fmt(cursos.filter(noAr).length) + '</p><p class="nota">no retrato de ' + dataBR(ult) + '</p></div>' +
      '<div class="kpi"><p class="rotulo">Novos na última semana</p><p class="valor num" style="color:var(--verde)">' + fmt(novos) + '</p><p class="nota">entraram em ' + dataBR(ult) + '</p></div>' +
      '<div class="kpi"><p class="rotulo">Já saíram</p><p class="valor num">' + fmt(cursos.length - cursos.filter(noAr).length) + '</p><p class="nota">não estão mais no portal</p></div>';
    var muns = unicos(function(c){ return c.municipios; }).filter(function(m){ return m !== 'Online'; });
    opcoes('hMunicipio', muns);
    opcoes('hArea', unicos(function(c){ return c.area; }));
    opcoes('hFonte', unicos(function(c){ return c.fonte; }));
    $('hDe').min = $('hAte').min = $('hNovosDesde').min = $('hDesdeData').min = H.semanas[0];
    $('hDe').max = $('hAte').max = $('hNovosDesde').max = $('hDesdeData').max = ult;
    $('hResultados').classList.remove('oculto');
    if(!ligado){
      ligado = true;
      ['hDe','hAte','hNovosDesde','hModalidade','hCarga','hMunicipio','hArea','hFonte','hSituacao','hComOnline'].forEach(function(id){ $(id).addEventListener('change', desenhar); });
      $('hBusca').addEventListener('input', desenhar);
      $('hCsvFiltrado').addEventListener('click', function(){ baixar(filtrados(), 'superacao-historico-cursos', descreverFiltros()); });
      $('hCsvSemana').addEventListener('click', function(){
        var lista = filtrados().filter(function(c){ return c.primeira === ultima(); });
        baixar(lista, 'superacao-cursos-novos-semana', 'novos no retrato de ' + dataBR(ultima()) + filtrosTxt());
      });
      $('hCsvDesde').addEventListener('click', function(){
        var d = $('hDesdeData').value;
        if(!d){ $('hDesdeData').focus(); alert('Escolha a data ao lado do botão.'); return; }
        var lista = filtrados().filter(function(c){ return c.primeira >= d; });
        baixar(lista, 'superacao-cursos-novos-desde-' + d, 'novos desde ' + dataBR(d) + filtrosTxt());
      });
    }
    desenhar();
  }

  function filtrados(){
    var de = $('hDe').value, ate = $('hAte').value, desde = $('hNovosDesde').value;
    var mod = $('hModalidade').value, carga = $('hCarga').value, mun = $('hMunicipio').value;
    var area = $('hArea').value, fonte = $('hFonte').value, sit = $('hSituacao').value;
    var busca = normal($('hBusca').value), comOnline = $('hComOnline').checked;
    var faixa = carga && carga !== 'sem' ? carga.split('-').map(Number) : null;
    return H.cursos.filter(function(c){
      if(de && c.ultima < de) return false;                  // esteve no portal em algum momento do período
      if(ate && c.primeira > ate) return false;
      if(desde && c.primeira < desde) return false;
      if(mod && c.classe !== mod) return false;
      if(carga === 'sem' && c.carga_h != null) return false;
      if(faixa && (c.carga_h == null || c.carga_h < faixa[0] || c.carga_h > faixa[1])) return false;
      if(mun && c.municipios.indexOf(mun) === -1 && !(comOnline && c.municipios.indexOf('Online') !== -1)) return false;
      if(area && c.area !== area) return false;
      if(fonte && c.fonte !== fonte) return false;
      if(sit === 'no_ar' && !noAr(c)) return false;
      if(sit === 'saiu' && noAr(c)) return false;
      if(busca && normal(c.curso).indexOf(busca) === -1) return false;
      return true;
    }).sort(function(a, b){ return (b.primeira > a.primeira ? 1 : b.primeira < a.primeira ? -1 : 0) || a.curso.localeCompare(b.curso, 'pt-BR'); });
  }

  function municipiosTxt(c){
    if(c.municipios.length === 1) return c.municipios[0] === 'Online' ? 'Online (todos)' : c.municipios[0];
    return c.municipios.length + ' municípios';
  }

  function desenhar(){
    var lista = filtrados();
    $('hContagem').innerHTML = '<b>' + fmt(lista.length) + '</b> curso(s) no recorte, de <b>' + fmt(H.cursos.length) + '</b> no histórico' +
      (lista.length > 400 ? '. Exibindo os 400 primeiros (os mais recentes); o CSV traz todos.' : '.');
    var html = '<thead><tr><th>Curso</th><th>Origem</th><th>Modalidade</th><th>Carga</th><th>Área</th><th>Onde</th>' +
               '<th>Entrou</th><th>Última vez</th><th>Semanas</th><th>Link</th></tr></thead><tbody>';
    lista.slice(0, 400).forEach(function(c){
      html += '<tr>' +
        '<td class="trunc">' + esc(c.curso) + (noAr(c) ? '' : ' <span class="tag" title="não está mais no portal">saiu</span>') + '</td>' +
        '<td>' + esc(c.fonte) + '</td>' +
        '<td><span class="tag ' + (c.classe === 'presencial' ? 'pres' : 'onl') + '">' + esc(c.modalidade || c.classe) + '</span></td>' +
        '<td>' + esc(c.carga) + '</td>' +
        '<td>' + esc(c.area) + '</td>' +
        '<td title="' + esc(c.municipios.join(', ')) + '">' + esc(municipiosTxt(c)) + '</td>' +
        '<td>' + dataBR(c.primeira) + '</td>' +
        '<td>' + dataBR(c.ultima) + '</td>' +
        '<td>' + (c.semanas || '') + '</td>' +
        '<td>' + (c.link ? '<a href="' + esc(c.link) + '" target="_blank" rel="noopener">abrir</a>' : '') + '</td>' +
      '</tr>';
    });
    $('hTabela').innerHTML = html + '</tbody>';
  }

  function filtrosTxt(){ var d = descreverFiltros(); return d === 'sem filtros' ? '' : '  ·  ' + d; }
  function descreverFiltros(){
    var r = [];
    var sel = function(id){ var el = $(id); return el.value ? el.options[el.selectedIndex].text : ''; };
    if($('hDe').value || $('hAte').value) r.push('no portal entre ' + (dataBR($('hDe').value) || 'o início') + ' e ' + (dataBR($('hAte').value) || 'hoje'));
    if($('hNovosDesde').value) r.push('entrou a partir de ' + dataBR($('hNovosDesde').value));
    [['hModalidade','modalidade'],['hCarga','carga'],['hMunicipio','município'],['hArea','área'],['hFonte','origem'],['hSituacao','situação']].forEach(function(p){
      var v = sel(p[0]); if(v) r.push(p[1] + ': ' + v);
    });
    if($('hBusca').value) r.push('busca: ' + $('hBusca').value);
    return r.length ? 'filtros: ' + r.join(', ') : 'sem filtros';
  }

  function baixar(lista, nome, observacao){
    var campo = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var d = new Date();
    var linhas = [campo('Histórico de cursos baixado em ' + d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) +
                        '  ·  ' + lista.length + ' cursos  ·  ' + observacao),
                  'Curso;Instituicao;Origem;Modalidade;Carga;Area;Municipios;Entrou no portal;Ultima vez no portal;Semanas no portal;Situacao;Link'];
    lista.forEach(function(c){
      linhas.push([c.curso, c.inst, c.fonte, c.modalidade || c.classe, c.carga, c.area, c.municipios.join(', '), dataBR(c.primeira), dataBR(c.ultima),
                   c.semanas, noAr(c) ? 'No portal' : 'Saiu', c.link].map(campo).join(';'));
    });
    var blob = new Blob(['﻿' + linhas.join('\n')], {type: 'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  window.HistoricoCursos = { abrir: abrir };
})();
