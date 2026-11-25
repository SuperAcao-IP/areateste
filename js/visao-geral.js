/* =====================================================================
   PAINEL · aba "Visão geral" (gráficos e números) e "Vazios do catálogo" automático
   Fontes:
   - uso do período: o mesmo /dash da aba "Uso do portal" (o painel avisa com o evento 'painel:uso');
   - dados/uso-semanal.json      linha do tempo do uso (robô semanal; precisa do Secret PAINEL_CHAVE);
   - dados/historico-cursos.json e dados/historico-vagas.json   cursos e vagas por semana e por município;
   - dados/cobertura.json         cursos presenciais por município × área (Vazios automático);
   - dados/municipios.js          os municípios do programa e o centro de cada um (mapa).
   Gráficos em SVG/HTML simples, uma cor de dado (azul), cinza para "sem dado", âmbar só para aviso.
   ===================================================================== */
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  /* dica (tooltip): só TEXTO, uma linha por item; a primeira linha sai em negrito. O tooltip monta os elementos com
     textContent, então nenhum texto vindo dos dados (nomes de curso, cidades) vira HTML. */
  var SEP_DICA = '␞';   // separador de linhas da dica (caractere que não aparece em nomes)
  var dicaTxt = function(linhas){ return esc(linhas.filter(function(x){ return x !== '' && x != null; }).join(SEP_DICA)); };
  var fmt = function(n){ return (n || 0).toLocaleString('pt-BR'); };
  var norm = function(s){ return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); };
  var dataBR = function(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; };
  var diaMes = function(iso){ return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };
  var COR = '#0C63AA', COR_SUAVE = '#cfe4f5', CINZA = '#B7C0CB', AMBAR = '#C26A0B';
  /* paleta FGV: azuis do programa + verde, âmbar e roxo de apoio (sempre com rótulo e número, nunca só a cor) */
  var PALETA = ['#003A79', '#0C63AA', '#2B8671', '#E29200', '#6F5CB5', '#7DB2DE', '#B7C0CB'];
  var FONTES_CURSO = { trampolim:'Trampolim SP', sebrae:'Sebrae SP', evg:'Escola Virtual de Governo', bradesco:'Fund. Bradesco', senac:'Senac', senai:'Senai',
                       ifmg:'+IFMG', mundi:'Mundi · IFSul', aprendamais:'Aprenda Mais · MEC', manual:'Planilha de cursos e outras origens', spme:'Emprega Brasil' };
  var FONTES_VAGA = { trampolim:'Trampolim SP', robo:'Robô de vagas', planilha:'Planilha de vagas', manual:'Planilha de vagas', spme:'Emprega Brasil (SINE)' };

  var MUNICIPIOS = (typeof CENTROS_MUNICIPIOS !== 'undefined') ? Object.keys(CENTROS_MUNICIPIOS).sort(function(a, b){ return a.localeCompare(b, 'pt-BR'); }) : [];
  var estado = { uso: null, dias: 30, semanal: undefined, cursos: undefined, vagas: undefined, cobertura: undefined, mapa: null, munFiltro: '' };

  /* ---------- carregamento dos arquivos (uma vez) ---------- */
  function json(arq){
    return fetch(arq + '?t=' + Date.now()).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(function(){ return null; });
  }
  var promessaArquivos = null;
  function carregarArquivos(){
    if(!promessaArquivos){
      promessaArquivos = Promise.all([json('dados/uso-semanal.json'), json('dados/historico-cursos.json'), json('dados/historico-vagas.json'), json('dados/cobertura.json')])
        .then(function(r){ estado.semanal = r[0]; estado.cursos = r[1]; estado.vagas = r[2]; estado.cobertura = r[3]; });
    }
    return promessaArquivos;
  }

  /* ---------- tooltip único (hover em qualquer elemento com data-dica) ---------- */
  var dica = document.createElement('div');
  dica.className = 'vg-dica oculto';
  document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(dica); });
  document.addEventListener('mouseover', function(e){
    var el = e.target.closest && e.target.closest('[data-dica]');
    if(!el){ dica.classList.add('oculto'); return; }
    dica.textContent = '';
    el.getAttribute('data-dica').split(SEP_DICA).forEach(function(t, i){
      var linha = document.createElement(i ? 'div' : 'b'); linha.textContent = t; dica.appendChild(linha);
    });
    dica.classList.remove('oculto');
  });
  document.addEventListener('mousemove', function(e){
    if(dica.classList.contains('oculto')) return;
    var x = Math.min(e.clientX + 14, window.innerWidth - dica.offsetWidth - 8);
    dica.style.left = x + 'px'; dica.style.top = (e.clientY + 14) + 'px';
  });

  /* ---------- peças de gráfico ---------- */
  /* barras horizontais ordenadas: [{rotulo, valor, nota}] */
  function barras(itens, opts){
    opts = opts || {};
    if(!itens.length) return '<p class="vazio">' + esc(opts.vazio || 'Sem dados no período.') + '</p>';
    var max = Math.max.apply(null, itens.map(function(i){ return i.valor; })) || 1;
    return '<div class="vg-barras">' + itens.map(function(i){
      var p = Math.max(1.5, (i.valor / max) * 100);
      return '<div class="vg-barra" data-dica="' + dicaTxt([i.rotulo, fmt(i.valor) + ' ' + (opts.unidade || ''), i.nota]) + '">' +
        '<span class="vg-rot">' + esc(i.rotulo) + '</span>' +
        '<span class="vg-trilho"><span class="vg-preenche" style="width:' + p + '%;background:' + (i.cor || COR) + '"></span></span>' +
        '<span class="vg-val num">' + fmt(i.valor) + '</span></div>';
    }).join('') + '</div>';
  }

  /* linha no tempo (uma série): pontos [{x:'2026-11-23', y:12, aproximado:bool}] */
  function linha(pontos, opts){
    opts = opts || {};
    if(pontos.length < 2) return '<p class="vazio">' + esc(opts.vazio || 'Ainda não há semanas suficientes para a linha do tempo.') + '</p>';
    var W = 520, H = 170, E = 44, D = 10, T = 12, B = 26;
    var max = Math.max.apply(null, pontos.map(function(p){ return p.y; })); if(!max) max = 1;
    var passo = Math.pow(10, Math.floor(Math.log10(max))); var topo = Math.ceil(max / passo) * passo; if(topo / passo > 5 && passo >= 1) topo = Math.ceil(max / (passo * 2)) * passo * 2;
    var X = function(i){ return E + (i / (pontos.length - 1)) * (W - E - D); };
    var Y = function(v){ return T + (1 - v / topo) * (H - T - B); };
    var grade = [0, topo / 2, topo].map(function(v){
      return '<line x1="' + E + '" x2="' + (W - D) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#E3E8EF" stroke-width="1"/>' +
             '<text x="' + (E - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" class="vg-eixo">' + fmt(Math.round(v)) + '</text>';
    }).join('');
    var d = pontos.map(function(p, i){ return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var rotulosX = [0, Math.floor((pontos.length - 1) / 2), pontos.length - 1].filter(function(v, i, a){ return a.indexOf(v) === i; })
      .map(function(i){ return '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle') + '" class="vg-eixo">' + diaMes(pontos[i].x) + '</text>'; }).join('');
    var ult = pontos[pontos.length - 1];
    var alvos = pontos.map(function(p, i){
      var x0 = i === 0 ? E : (X(i - 1) + X(i)) / 2, x1 = i === pontos.length - 1 ? W - D : (X(i) + X(i + 1)) / 2;
      return '<g class="vg-alvo" data-dica="' + dicaTxt(['Semana até ' + dataBR(p.x), fmt(p.y) + ' ' + (opts.unidade || ''), p.aproximado ? 'valor reconstruído (aproximado)' : '']) + '">' +
        '<rect x="' + x0 + '" y="' + T + '" width="' + Math.max(1, x1 - x0) + '" height="' + (H - T - B) + '" fill="transparent"/>' +
        '<line class="vg-mira" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#9AA7B6" stroke-width="1"/>' +
        '<circle class="vg-ponto" cx="' + X(i) + '" cy="' + Y(p.y) + '" r="4.5" fill="' + (p.aproximado ? '#fff' : COR) + '" stroke="' + COR + '" stroke-width="2"/></g>';
    }).join('');
    return '<svg class="vg-linha" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.titulo || 'linha do tempo') + '">' + grade +
      '<path d="' + d + '" fill="none" stroke="' + COR + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + X(pontos.length - 1) + '" cy="' + Y(ult.y) + '" r="4" fill="' + COR + '" stroke="#fff" stroke-width="2"/>' +
      rotulosX + alvos + '</svg>';
  }
  /* rosca: [{rotulo, valor}] -> círculo com o total no centro e legenda com número e % */
  function rosca(itens, opts){
    opts = opts || {};
    itens = itens.filter(function(i){ return i.valor > 0; });
    var total = itens.reduce(function(s, i){ return s + i.valor; }, 0);
    if(!total) return '<p class="vazio">' + esc(opts.vazio || 'Sem dados no período.') + '</p>';
    var R = 44, C = 2 * Math.PI * R, acum = 0;
    var arcos = itens.map(function(i, k){
      var cor = PALETA[k % PALETA.length], len = i.valor / total * C;
      var s = '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + cor + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) +
        '" stroke-dashoffset="' + (-acum).toFixed(2) + '" transform="rotate(-90 60 60)" data-dica="' + dicaTxt([i.rotulo, fmt(i.valor) + ' ' + (opts.unidade || '') + ' (' + Math.round(i.valor / total * 100) + '%)']) + '"/>';
      acum += len; return s;
    }).join('');
    var legenda = itens.map(function(i, k){
      return '<li><i style="background:' + PALETA[k % PALETA.length] + '"></i><span class="r-rot">' + esc(i.rotulo) + '</span><b class="num">' + fmt(i.valor) +
        '</b><span class="r-pct">' + Math.round(i.valor / total * 100) + '%</span></li>';
    }).join('');
    return '<div class="vg-rosca"><svg viewBox="0 0 120 120" role="img" aria-label="' + esc(opts.titulo || 'gráfico de rosca') + '">' + arcos +
      '<text x="60" y="58" text-anchor="middle" class="r-total">' + fmt(total) + '</text><text x="60" y="73" text-anchor="middle" class="r-un">' + esc(opts.unidade || '') + '</text></svg>' +
      '<ul class="r-legenda">' + legenda + '</ul></div>';
  }
  function kpi(rotulo, valor, nota, cor){
    return '<div class="kpi"><p class="rotulo">' + esc(rotulo) + '</p><p class="valor num"' + (cor ? ' style="color:' + cor + '"' : '') + '>' + valor + '</p>' +
           (nota ? '<p class="nota">' + nota + '</p>' : '') + '</div>';
  }

  /* ---------- contas a partir dos arquivos ---------- */
  function presentes(hist, campo){
    if(!hist) return [];
    var ult = hist.semanas.length - 1;
    return (hist[campo] || []).filter(function(c){ return c.p && c.p.indexOf(ult) >= 0; });
  }
  function porSemana(hist, campo){
    if(!hist) return [];
    var n = hist.semanas.map(function(){ return 0; });
    (hist[campo] || []).forEach(function(c){ (c.p || []).forEach(function(i){ n[i]++; }); });
    return hist.semanas.map(function(s, i){ return { x: s, y: n[i] }; });
  }
  function ultimaBusca(mun){
    var s = estado.semanal && estado.semanal.semanas || [];
    for(var i = s.length - 1; i >= 0; i--){ if((s[i].cidades || {})[mun]) return s[i].fim; }
    return '';
  }
  function municipiosComVazio(){
    var c = estado.cobertura, out = {};
    if(!c) return out;
    MUNICIPIOS.forEach(function(m){
      var linha = c.municipios[m] || {};
      out[m] = c.areas.filter(function(a){ return !(linha[a] && linha[a][0]); }).length;
    });
    return out;
  }

  /* ---------- Visão geral ---------- */
  function desenhar(){
    var alvo = $('aba-visao');
    if(!alvo) return;
    var j = estado.uso, dias = estado.dias;
    var buscasCidade = {};
    (j && j.cidades || []).forEach(function(c){ buscasCidade[c.cidade] = (buscasCidade[c.cidade] || 0) + (c.buscas || 0); });
    var alcancados = MUNICIPIOS.filter(function(m){ return buscasCidade[m]; });
    var semBusca = MUNICIPIOS.filter(function(m){ return !buscasCidade[m]; });
    var tot = function(ev){ var r = (j && j.resumo || []).filter(function(x){ return x.ev === ev; })[0]; return r ? r.total : 0; };
    var ses = function(ev){ var r = (j && j.resumo || []).filter(function(x){ return x.ev === ev; })[0]; return r ? r.sessoes : 0; };
    var cliquesPrep = (j && j.cursos || []).filter(function(c){ return c.fonte === 'preparacao'; }).reduce(function(s, c){ return s + (c.cliques || 0); }, 0);
    var cliquesCursos = Math.max(0, tot('clique_curso') - cliquesPrep);
    var cursosNoAr = presentes(estado.cursos, 'cursos'), vagasNoAr = presentes(estado.vagas, 'vagas');
    var vazios = municipiosComVazio();
    var semPresencial = Object.keys(vazios).filter(function(m){ return estado.cobertura && vazios[m] === estado.cobertura.areas.length; });

    $('vgPeriodo').textContent = (j ? 'Uso dos últimos ' + dias + ' dias' : 'Uso do portal ainda carregando (ou indisponível: veja a aba Uso do portal)') +
      (estado.cursos ? ' · cursos e vagas do retrato de ' + dataBR(estado.cursos.atualizado) : '');
    $('vgKpis').innerHTML =
      kpi('Pessoas que usaram', j ? fmt(ses('visitou')) : '–', 'sessões no período') +
      kpi('Municípios alcançados', j ? fmt(alcancados.length) + ' <small>de ' + MUNICIPIOS.length + '</small>' : '–', 'pesquisaram no período') +
      kpi('Cliques em cursos e vagas', j ? fmt(cliquesCursos + tot('clique_vaga')) : '–', j ? fmt(cliquesCursos) + ' em cursos · ' + fmt(tot('clique_vaga')) + ' em vagas' : 'encaminhamentos gerados') +
      kpi('Preparação para o trabalho', j ? fmt(cliquesPrep) : '–', j ? 'cliques nos 4 passos' : '') +
      kpi('Cursos no portal', estado.cursos ? fmt(cursosNoAr.length) : '–', estado.cursos ? 'no retrato de ' + dataBR(estado.cursos.atualizado) : 'histórico não carregou') +
      kpi('Vagas no portal', estado.vagas ? fmt(vagasNoAr.length) : '–', estado.vagas ? 'no retrato de ' + dataBR(estado.vagas.atualizado) : 'o histórico de vagas começa no próximo retrato') +
      kpi('Municípios sem curso presencial', estado.cobertura ? fmt(semPresencial.length) : '–', estado.cobertura ? 'em nenhuma área, na própria cidade' : '') +
      kpi('Semanas de histórico', estado.cursos ? fmt(estado.cursos.semanas.length) : '–', estado.cursos ? 'desde ' + dataBR(estado.cursos.semanas[0]) : '');

    /* municípios sem busca */
    $('vgSemBusca').innerHTML = !j ? '<p class="vazio">Carregando o uso do período…</p>' : !semBusca.length
      ? '<p class="vazio">Todos os ' + MUNICIPIOS.length + ' municípios do programa foram pesquisados nos últimos ' + dias + ' dias.</p>'
      : '<p class="sub" style="margin:0 0 10px">' + semBusca.length + ' de ' + MUNICIPIOS.length + ' municípios do programa não tiveram nenhuma busca nos últimos ' + dias + ' dias' +
        (estado.semanal ? ' (entre parênteses, a última semana em que alguém buscou):' : ':') + '</p><div class="vg-chips">' +
        semBusca.map(function(m){ var u = ultimaBusca(m); return '<span class="vg-chip">' + esc(m) + (estado.semanal ? ' <small>(' + (u ? dataBR(u) : 'nunca') + ')</small>' : '') + '</span>'; }).join('') + '</div>';

    /* barras */
    var topCidades = Object.keys(buscasCidade).map(function(c){ return { rotulo: c, valor: buscasCidade[c] }; }).sort(function(a, b){ return b.valor - a.valor; }).slice(0, 15);
    $('vgCidades').innerHTML = barras(topCidades, { unidade: 'buscas', vazio: 'Nenhuma busca no período.' });
    var porOrigem = function(lista, nomes, semPrep){
      var m = {};
      (lista || []).forEach(function(c){ if(semPrep && c.fonte === 'preparacao') return; var f = nomes[c.fonte] || c.fonte || 'Sem origem'; m[f] = (m[f] || 0) + (c.cliques || 0); });
      return Object.keys(m).map(function(f){ return { rotulo: f, valor: m[f] }; }).sort(function(a, b){ return b.valor - a.valor; });
    };
    $('vgFontesCursos').innerHTML = rosca(porOrigem(j && j.cursos, FONTES_CURSO, true), { unidade: 'cliques', titulo: 'Cliques em cursos por origem', vazio: 'Nenhum clique em curso no período.' });
    $('vgFontesVagas').innerHTML = (j && j.vagas)
      ? rosca(porOrigem(j.vagas, FONTES_VAGA, false), { unidade: 'cliques', titulo: 'Cliques em vagas por origem', vazio: 'Nenhum clique em vaga no período.' })
      : '<p class="vazio">A origem de cada vaga clicada ainda não chega do servidor de estatísticas (veja docs/PEDIDO-WORKER.md). Total de cliques em vagas no período: <b>' + fmt(tot('clique_vaga')) + '</b>.</p>';

    /* linhas do tempo */
    var sem = estado.semanal && estado.semanal.semanas || [];
    var serie = function(f){ return sem.map(function(s){ return { x: s.fim, y: f(s), aproximado: s.aproximado }; }); };
    var ev = function(s, e){ return (s.eventos || {})[e] || 0; };
    var vazioUso = estado.semanal === null ? 'A linha do tempo do uso começa quando o Secret PAINEL_CHAVE for cadastrado no GitHub (veja o README).' : undefined;
    $('vgTempoSessoes').innerHTML = linha(serie(function(s){ return s.sessoes; }), { unidade: 'sessões', titulo: 'Sessões por semana', vazio: vazioUso });
    $('vgTempoBuscas').innerHTML = linha(serie(function(s){ return ev(s, 'viu_resultados') + ev(s, 'busca_sem_resultado'); }), { unidade: 'buscas', titulo: 'Buscas por semana', vazio: vazioUso });
    var prepSem = function(s){ return (s.cursos || []).filter(function(c){ return c.fonte === 'preparacao'; }).reduce(function(n, c){ return n + (c.cliques || 0); }, 0); };
    $('vgTempoCliquesCursos').innerHTML = linha(serie(function(s){ return Math.max(0, ev(s, 'clique_curso') - prepSem(s)); }), { unidade: 'cliques em cursos', titulo: 'Cliques em cursos por semana', vazio: vazioUso });
    $('vgTempoCliquesVagas').innerHTML = linha(serie(function(s){ return ev(s, 'clique_vaga'); }), { unidade: 'cliques em vagas', titulo: 'Cliques em vagas por semana', vazio: vazioUso });
    $('vgTempoCursos').innerHTML = linha(porSemana(estado.cursos, 'cursos'), { unidade: 'cursos', titulo: 'Cursos no portal por semana' });
    $('vgTempoVagas').innerHTML = linha(porSemana(estado.vagas, 'vagas'), { unidade: 'vagas', titulo: 'Vagas no portal por semana', vazio: 'O histórico de vagas começou agora: a linha aparece a partir da segunda semana.' });
    $('vgNotaAprox').classList.toggle('oculto', !sem.some(function(s){ return s.aproximado; }));

    desenharTabelaMunicipios(cursosNoAr, vagasNoAr, buscasCidade);
    desenharMapa(buscasCidade, vazios);
  }

  /* cursos e vagas por município, hoje. "Todos": uma linha por município. Um município escolhido: o detalhe por área. */
  var linhasMun = [], linhasArea = [];
  function desenharTabelaMunicipios(cursosNoAr, vagasNoAr, buscasCidade){
    var sel = $('vgFiltroMun');
    if(sel && sel.options.length <= 1){
      sel.innerHTML = '<option value="">Todos os municípios</option>' + MUNICIPIOS.map(function(m){ return '<option>' + esc(m) + '</option>'; }).join('');
    }
    if(sel) sel.value = estado.munFiltro;
    var temOnline = function(c){ return c.municipios.indexOf('Online') >= 0; };
    var onlineTodos = cursosNoAr.filter(function(c){ return c.classe === 'online' && temOnline(c); });
    var doMun = function(lista, m){ return lista.filter(function(x){ return x.municipios.indexOf(m) >= 0; }); };
    var presDe = function(m){ return cursosNoAr.filter(function(c){ return c.classe === 'presencial' && c.municipios.indexOf(m) >= 0; }); };
    var onlDe = function(m){ return onlineTodos.concat(cursosNoAr.filter(function(c){ return c.classe === 'online' && !temOnline(c) && c.municipios.indexOf(m) >= 0; })); };
    linhasMun = MUNICIPIOS.map(function(m){
      return { m: m, pres: presDe(m).length, onl: onlDe(m).length, vag: doMun(vagasNoAr, m).length, buscas: buscasCidade[m] || 0 };
    });
    var m = estado.munFiltro;
    if(!m){
      $('vgTabelaMun').innerHTML = '<thead><tr><th>Município</th><th class="direita">Cursos presenciais</th><th class="direita">Cursos online</th><th class="direita">Vagas</th>' +
        '<th class="direita">Buscas (' + estado.dias + ' dias)</th></tr></thead><tbody>' +
        linhasMun.map(function(l){
          return '<tr><td>' + esc(l.m) + '</td><td class="direita num">' + fmt(l.pres) + '</td><td class="direita num">' + fmt(l.onl) + '</td><td class="direita num">' + (estado.vagas ? fmt(l.vag) : '–') + '</td>' +
            '<td class="direita num">' + (estado.uso ? fmt(l.buscas) : '–') + '</td></tr>';
        }).join('') + '</tbody>';
      linhasArea = [];
      return;
    }
    var pr = presDe(m), on = onlDe(m), vg = doMun(vagasNoAr, m);
    var conta = function(lista, a){ return lista.filter(function(x){ return (x.area || 'Outros') === a; }).length; };
    var nomes = estado.cobertura ? estado.cobertura.areas.slice() : [];
    [pr, on, vg].forEach(function(l){ l.forEach(function(x){ var a = x.area || 'Outros'; if(nomes.indexOf(a) < 0) nomes.push(a); }); });
    linhasArea = nomes.map(function(a){ return { a: a, pres: conta(pr, a), onl: conta(on, a), vag: conta(vg, a) }; });
    var zero = function(n){ return n ? fmt(n) : '<span class="zero-suave">0</span>'; };
    $('vgTabelaMun').innerHTML = '<thead><tr><th>Área (' + esc(m) + ')</th><th class="direita">Cursos presenciais</th><th class="direita">Cursos online</th><th class="direita">Vagas</th></tr></thead><tbody>' +
      linhasArea.map(function(l){
        return '<tr><td>' + esc(l.a) + '</td><td class="direita num">' + zero(l.pres) + '</td><td class="direita num">' + zero(l.onl) + '</td><td class="direita num">' + (estado.vagas ? zero(l.vag) : '–') + '</td></tr>';
      }).join('') + '<tr class="total"><td>Total</td><td class="direita num">' + fmt(pr.length) + '</td><td class="direita num">' + fmt(on.length) + '</td><td class="direita num">' + (estado.vagas ? fmt(vg.length) : '–') + '</td></tr></tbody>';
  }

  /* mapa: bolha = buscas no período; cinza = ninguém buscou; contorno âmbar = nenhum curso presencial na cidade */
  function desenharMapa(buscasCidade, vazios){
    var el = $('vgMapa');
    if(!el || typeof L === 'undefined' || typeof CENTROS_MUNICIPIOS === 'undefined') return;
    if(!estado.mapa){
      estado.mapa = L.map(el, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 12 }).addTo(estado.mapa);
      estado.camada = L.layerGroup().addTo(estado.mapa);
      var pts = MUNICIPIOS.map(function(m){ return [CENTROS_MUNICIPIOS[m].lat, CENTROS_MUNICIPIOS[m].lon]; });
      estado.mapa.fitBounds(pts, { padding: [18, 18] });
    }
    estado.camada.clearLayers();
    var max = Math.max.apply(null, MUNICIPIOS.map(function(m){ return buscasCidade[m] || 0; })) || 1;
    var nAreas = estado.cobertura ? estado.cobertura.areas.length : 0;
    MUNICIPIOS.forEach(function(m){
      var b = buscasCidade[m] || 0, v = vazios[m] || 0, semNenhum = nAreas && v === nAreas;
      var raio = b ? 6 + Math.sqrt(b / max) * 16 : 6;
      L.circleMarker([CENTROS_MUNICIPIOS[m].lat, CENTROS_MUNICIPIOS[m].lon], {
        radius: raio, weight: semNenhum ? 3 : 2, color: semNenhum ? AMBAR : '#ffffff', fillColor: b ? COR : CINZA, fillOpacity: b ? 0.75 : 0.9
      }).bindTooltip('<b>' + esc(m) + '</b><br>' + (estado.uso ? fmt(b) + ' buscas em ' + estado.dias + ' dias' : '') +
        (semNenhum ? '<br>nenhum curso presencial na cidade' : ''), { direction: 'top' }).addTo(estado.camada);
    });
    setTimeout(function(){ estado.mapa.invalidateSize(); }, 50);
  }

  function baixarCSV(nome, linhas, observacao){
    var d = new Date();
    linhas = ['"' + (observacao ? observacao + '  ·  ' : '') + 'baixado em ' + d.toLocaleDateString('pt-BR') + '"'].concat(linhas);
    var blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome + '-' + d.toISOString().slice(0, 10) + '.csv'; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }
  var campo = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };

  /* ---------- Vazios do catálogo: retrato automático da semana ---------- */
  function desenharCobertura(){
    var alvo = $('cobAuto');
    if(!alvo) return;
    var c = estado.cobertura;
    if(!c){ alvo.innerHTML = '<p class="vazio">O retrato automático ainda não foi gerado (ele sai todo domingo, no robô "Histórico de cursos"). Use a varredura ao vivo abaixo.</p>'; return; }
    var semNada = [], poucas = {};
    MUNICIPIOS.forEach(function(m){
      var l = c.municipios[m] || {}, vazias = 0;
      c.areas.forEach(function(a){ var v = l[a] || [0, 0]; if(!v[0]) vazias++; });
      poucas[m] = vazias;
      if(vazias === c.areas.length) semNada.push(m);
    });
    $('cobKpis').innerHTML =
      kpi('Municípios do programa', fmt(MUNICIPIOS.length), 'no retrato de ' + dataBR(c.atualizado)) +
      kpi('Sem nenhum curso presencial', fmt(semNada.length), 'em nenhuma área, na própria cidade', semNada.length ? AMBAR : '') +
      kpi('Com curso presencial', fmt(MUNICIPIOS.length - semNada.length), 'em pelo menos uma área');
    $('cobSemNada').innerHTML = semNada.length
      ? '<div class="vg-chips">' + semNada.map(function(m){ return '<span class="vg-chip">' + esc(m) + '</span>'; }).join('') + '</div>'
      : '<p class="vazio">Todos os municípios têm pelo menos um curso presencial.</p>';
    $('cobData').textContent = 'Retrato automático de ' + dataBR(c.atualizado) + ' (atualiza todo domingo).';
    var html = '<thead><tr><th>Município</th>' + c.areas.map(function(a){ return '<th title="' + esc(a) + '">' + esc(a.length > 16 ? a.slice(0, 15) + '…' : a) + '</th>'; }).join('') + '<th title="Áreas sem curso presencial na cidade">Áreas sem presencial</th></tr></thead><tbody>';
    MUNICIPIOS.forEach(function(m){
      var l = c.municipios[m] || {};
      html += '<tr><td>' + esc(m) + '</td>' + c.areas.map(function(a){
        var v = l[a] || [0, 0];
        var t = m + ' · ' + a;
        if(v[0]) return '<td class="tem" data-dica="' + dicaTxt([t, v[0] + ' curso(s) presencial(is) na cidade', v[1] ? '+ ' + v[1] + ' nas cidades vizinhas' : '']) + '">' + v[0] + '</td>';
        if(v[1]) return '<td class="vg-viz" data-dica="' + dicaTxt([t, 'nenhum na cidade; ' + v[1] + ' nas cidades vizinhas']) + '">0 <small>+' + v[1] + '</small></td>';
        return '<td class="zero" data-dica="' + dicaTxt([t, 'nenhum curso presencial, nem nas cidades vizinhas']) + '">0</td>';
      }).join('') + '<td class="' + (poucas[m] === c.areas.length ? 'zero' : '') + '"><b>' + poucas[m] + '</b> de ' + c.areas.length + '</td></tr>';
    });
    $('cobTabela').innerHTML = html + '</tbody>';
  }
  function csvCobertura(soVazios){
    var c = estado.cobertura; if(!c) return;
    var l = [];
    if(soVazios){
      l.push('Municipio;Area;Cursos nas cidades vizinhas');
      MUNICIPIOS.forEach(function(m){ c.areas.forEach(function(a){ var v = (c.municipios[m] || {})[a] || [0, 0]; if(!v[0]) l.push([m, a, v[1]].map(campo).join(';')); }); });
      baixarCSV('superacao-vazios-presencial-automatico', l, 'retrato de ' + dataBR(c.atualizado));
    }else{
      l.push(['Municipio'].concat(c.areas).map(campo).join(';'));
      MUNICIPIOS.forEach(function(m){ l.push([m].concat(c.areas.map(function(a){ var v = (c.municipios[m] || {})[a]; return v ? v[0] : 0; })).map(campo).join(';')); });
      baixarCSV('superacao-matriz-presencial-automatica', l, 'cursos presenciais na própria cidade · retrato de ' + dataBR(c.atualizado));
    }
  }

  /* ---------- ligações ---------- */
  function falhou(onde){ return function(e){ console.error('[painel] ' + onde + ':', e); var el = $(onde === 'vazios' ? 'cobData' : 'vgPeriodo'); if(el) el.textContent = 'Não consegui montar esta parte (' + (e && e.message) + '). Recarregue a página.'; }; }
  function abrirVisao(){ carregarArquivos().then(desenhar).catch(falhou('visão geral')); }
  function abrirVazios(){ carregarArquivos().then(desenharCobertura).catch(falhou('vazios')); }
  window.addEventListener('painel:uso', function(e){
    estado.uso = e.detail.j; estado.dias = e.detail.dias;
    carregarArquivos().then(desenhar).catch(falhou('visão geral'));
  });
  document.addEventListener('DOMContentLoaded', function(){
    var b = $('vgImprimir'); if(b) b.addEventListener('click', function(){ window.print(); });
    var t = $('vgCsvMun'); if(t) t.addEventListener('click', function(){
      if(estado.munFiltro){
        baixarCSV('superacao-' + norm(estado.munFiltro).replace(/[^a-z0-9]+/g, '-'), ['Area;Cursos presenciais;Cursos online;Vagas'].concat(linhasArea.map(function(l){ return [l.a, l.pres, l.onl, l.vag].map(campo).join(';'); })), estado.munFiltro + ' · cursos e vagas do último retrato');
        return;
      }
      baixarCSV('superacao-municipios', ['Municipio;Cursos presenciais;Cursos online;Vagas;Buscas no periodo']
        .concat(linhasMun.map(function(l){ return [l.m, l.pres, l.onl, l.vag, l.buscas].map(campo).join(';'); })), 'cursos e vagas do último retrato; buscas dos últimos ' + estado.dias + ' dias');
    });
    var fm = $('vgFiltroMun'); if(fm) fm.addEventListener('change', function(){ estado.munFiltro = fm.value; desenhar(); });
    var c1 = $('cobCsvMatriz'); if(c1) c1.addEventListener('click', function(){ csvCobertura(false); });
    var c2 = $('cobCsvVazios'); if(c2) c2.addEventListener('click', function(){ csvCobertura(true); });
  });

  /* texto para o "Copiar resumo" da aba Uso */
  function linhasResumo(){
    var j = estado.uso; if(!j) return [];
    var buscados = {}; (j.cidades || []).forEach(function(c){ buscados[c.cidade] = 1; });
    var sem = MUNICIPIOS.filter(function(m){ return !buscados[m]; });
    var out = [];
    out.push(sem.length ? 'Municípios sem nenhuma busca no período (' + sem.length + '): ' + sem.join(', ') + '.' : 'Todos os municípios do programa foram pesquisados no período.');
    if(estado.cursos) out.push('Cursos no portal (retrato de ' + dataBR(estado.cursos.atualizado) + '): ' + fmt(presentes(estado.cursos, 'cursos').length) + '.');
    if(estado.vagas) out.push('Vagas no portal (retrato de ' + dataBR(estado.vagas.atualizado) + '): ' + fmt(presentes(estado.vagas, 'vagas').length) + '.');
    if(estado.cobertura){
      var v = municipiosComVazio(), nA = estado.cobertura.areas.length;
      var semNada = Object.keys(v).filter(function(m){ return v[m] === nA; });
      out.push('Municípios sem nenhum curso presencial na própria cidade: ' + (semNada.length ? semNada.join(', ') : 'nenhum') + '.');
    }
    return out;
  }

  window.VisaoGeral = { abrir: abrirVisao, abrirVazios: abrirVazios, linhasResumo: linhasResumo, carregarArquivos: carregarArquivos,
                        historicos: function(){ return { cursos: estado.cursos, vagas: estado.vagas }; } };
})();
