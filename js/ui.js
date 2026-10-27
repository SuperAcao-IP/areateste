/* =====================================================================
   INTERFACE  ·  estado da pagina, render da cidade, areas, cartoes,
   mapa (Leaflet) e modal do Senac
   ===================================================================== */
const MUNICIPIOS = Object.keys(CENTROS_MUNICIPIOS).sort((a,b)=>a.localeCompare(b,"pt-BR"));   // dados/municipios.js
let cidadeAtual=null, DADOS_CIDADE={}, MAP=null;

const grade=document.getElementById("cidadesSelect");

function montarChips(){
  grade.innerHTML="";
  const ph=document.createElement("option");
  ph.value="";
  ph.textContent="Selecione o seu município…";
  grade.appendChild(ph);
  MUNICIPIOS.forEach(m=>{
    const o=document.createElement("option");
    o.value=m; o.textContent=m;
    if(m===cidadeAtual) o.selected=true;
    grade.appendChild(o);
  });
  if(!cidadeAtual) ph.selected=true;
}

async function montarDados(cidade){
  DADOS_CIDADE={};
  await carregarDados();
  const add=(id,tipo,obj)=>{
    if(tipo==="cursos" && !cursoAtingeCargaMinima(obj.carga)) return;   // filtra cursos curtos
    (DADOS_CIDADE[id]=DADOS_CIDADE[id]||{cursos:[],oportunidades:[]})[tipo].push(obj);
  };

  /* Cada fonte de cursos online e opcional: se o arquivo de dados nao
     carregar (404, nome errado), a lista vira vazia e a pagina continua
     funcionando com as outras fontes, em vez de travar em "Carregando". */
  const EVG_LISTA = (typeof EVG !== "undefined" && Array.isArray(EVG)) ? catalogoPermitido(EVG,"evg") : [];
  const EV_LISTA  = (typeof EV  !== "undefined" && Array.isArray(EV))  ? catalogoPermitido(EV,"bradesco")  : [];
  const AM_LISTA  = (typeof APRENDA_MAIS !== "undefined" && Array.isArray(APRENDA_MAIS)) ? catalogoPermitido(APRENDA_MAIS,"aprendaMais") : [];
  if(!EVG_LISTA.length) console.warn("Lista EVG nao carregou (dados/cursos-evg.js)");
  if(!EV_LISTA.length)  console.warn("Lista Bradesco nao carregou (dados/cursos-bradesco.js)");
  if(!AM_LISTA.length)  console.warn("Lista Aprenda Mais nao carregou (dados/cursos-aprenda-mais.js)");
  /* Institutos Federais: fontes opcionais, mesmo filtro por titulo */
  const IFMG_LISTA  = (typeof IFMG  !== "undefined" && Array.isArray(IFMG))  ? catalogoPermitido(IFMG,"ifmg")   : [];
  const MUNDI_LISTA = (typeof MUNDI !== "undefined" && Array.isArray(MUNDI)) ? catalogoPermitido(MUNDI,"mundi") : [];

  EVG_LISTA.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:c.inst+" · EVG", modalidade:"Online", carga:c.carga, link:c.link}));
  EV_LISTA.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:"Fundação Bradesco · Escola Virtual", modalidade:"Online", carga:c.carga, link:c.link}));
  AM_LISTA.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:"Aprenda Mais · MEC (online, gratuito)", modalidade:"Online", carga:c.carga, link:c.link}));
  IFMG_LISTA.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:"Instituto Federal de Minas Gerais · +IFMG (online, gratuito)", modalidade:"Online", carga:c.carga, link:c.link}));
  MUNDI_LISTA.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:"Instituto Federal Sul-rio-grandense · Mundi (online, gratuito)", modalidade:"Online", carga:c.carga, link:c.link}));

  /* cursos manuais (dados.json) */
  (DADOS.cursos||[]).forEach(c=>{
    const daCidade = ehDaCidade(c.municipio,cidade) || ehOnline(c.municipio);
    const vizinhas = CIDADES_VIZINHAS[cidade] || [];
    const deVizinha = !daCidade && vizinhas.some(v=>ehDaCidade(c.municipio,v));
    if(!daCidade && !deVizinha) return;
    if(!aberto(c.status,c.inscricoes_ate)) return;
    add(areaDoCurso(c.curso, c.area),"cursos",{nome:c.curso, inst:c.instituicao, modalidade:c.modalidade, carga:c.carga, link:c.link,
      bolsa:(c.bolsa===true||(c.bolsa||"").toString().toLowerCase()==="sim"),
      _deOutraCidade: deVizinha ? c.municipio : null});
  });
  (DADOS.vagas||[]).forEach(v=>{
    if(!ehDaCidade(v.municipio,cidade)) return;
    if(!aberto(v.status,v.validade)) return;
    add(areaDoCurso(v.cargo, v.area),"oportunidades",{cargo:v.cargo, empresa:[v.empresa,v.cidade].filter(Boolean).join(" · "), tipo:v.tipo, link:v.link});
  });
}
function conteudoDaArea(id){ return DADOS_CIDADE[id]||{cursos:[],oportunidades:[]}; }
/* maior carga primeiro; carga desconhecida vai para o fim; empate mantem a ordem original */
function cargaOrdem(c){ const v=cargaEmHoras(c.carga); return v==null?-1:v; }
function ordenarPorCarga(cursos){
  return cursos.map((c,i)=>({c,i})).sort((a,b)=>cargaOrdem(b.c)-cargaOrdem(a.c)||a.i-b.i).map(x=>x.c);
}
function areasComConteudo(){ return todasAreas().filter(a=>{const c=DADOS_CIDADE[a.id]; return c&&(c.cursos.length||c.oportunidades.length);}); }

async function selecionarCidade(cidade){
  const token = ++buscaToken;
  cidadeAtual=cidade; areaAtual=null; buscaTermo=""; montarChips();
  const alvo=document.getElementById("painelCidade");
  alvo.innerHTML='<div class="vazio-inicial"><p>Carregando cursos e vagas de <b>'+cidade+'</b>...</p></div>';
  window.scrollTo({top:alvo.offsetTop-70,behavior:"smooth"});

  /* Se algo falhar ao montar os dados, a pessoa ve o erro em vez de
     ficar presa na tela de "Carregando..." para sempre. */
  try{
    await montarDados(cidade);
  }catch(e){
    console.error("Erro ao montar os dados da cidade:",e);
    if(token!==buscaToken) return;
    alvo.innerHTML='<div class="vazio-inicial"><p>Não foi possível carregar os cursos de <b>'+cidade
      +'</b>. Recarregue a página e tente de novo.</p></div>';
    return;
  }

  if(token!==buscaToken) return;          // o usuario ja clicou em outra cidade
  renderCidade(cidade);
  if(TRAMPOLIM_ATIVO) carregarTrampolimEAtualizar(cidade, token);
  if(TRAMPOLIM_VAGAS_ATIVO) carregarTrampolimVagasEAtualizar(cidade, token);
  if(SEBRAE_ATIVO) carregarSebraeEAtualizar(cidade, token);
  if(PLANILHA_ATIVA) carregarPlanilhaEAtualizar(cidade, token);
  if(PLANILHA_VAGAS_ATIVA) carregarPlanilhaVagasEAtualizar(cidade, token);
}
function renderAreasGrade(cidade){
  const wrap = document.getElementById("areasGrade");
  if(!wrap) return;
  const areas = areasComConteudo();
  wrap.innerHTML = areas.map(a=>{
    const c=conteudoDaArea(a.id), nC=c.cursos.length;
    return `<button class="area-btn" role="tab" aria-selected="false" data-area="${a.id}"><span class="ico">${a.icone}</span><span class="titulo">${a.nome}</span><span class="conta">${nC} curso${nC!==1?"s":""}</span></button>`;
  }).join("");
  wrap.querySelectorAll(".area-btn").forEach(btn=>{
    if(btn.dataset.area===areaAtual) btn.setAttribute("aria-selected","true");
    btn.addEventListener("click",()=>selecionarArea(cidade,btn.dataset.area,btn));
  });
  /* as fontes chegam em etapas; com busca aberta, refaz com o que ja veio */
  if(typeof renderBusca === "function") renderBusca();
  /* o mapa também precisa saber dos cursos que chegam em etapas (endereço do Trampolim, planilha) */
  if(typeof atualizarCamadasMapa === "function") atualizarCamadasMapa();
}
function renderCidade(cidade){
  vagasFiltro=null;
  vagasRaioAmpliado=0;
  vagasPendentes=(TRAMPOLIM_VAGAS_ATIVO?1:0)+(PLANILHA_VAGAS_ATIVA?1:0);
  const alvo=document.getElementById("painelCidade");
  alvo.innerHTML=`
    <div class="cidade-cabec">
      <div><div class="rotulo">Sua cidade</div><h2>${cidade}</h2></div>
      <div class="acoes">
        <button class="btn-sec" onclick="window.print()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg> Imprimir</button>
        <button class="btn-sec" onclick="document.getElementById('topo').scrollIntoView({behavior:'smooth'})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg> Trocar cidade</button>
      </div>
    </div>
    <div class="bloco">
      <details class="mapa-suspenso" id="mapaSuspenso" open>
        <summary class="bloco-titulo mapa-summary"><span class="ic azul"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg></span><div><h3>Mapa de ${cidade}</h3><p>Serviços de apoio (CRAS, PAT, Sebrae Aqui), escolas com cursos presenciais e lugares com computador ou internet. Ligue e desligue as camadas abaixo do mapa.</p></div><span class="toggle-lbl"></span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="mapa-card">
          <div id="mapaP" style="width:100%;height:440px;background:#dfe6f1"></div>
          <div id="mapaCamadas" class="mapa-camadas" aria-label="Camadas do mapa"></div>
        </div>
      </details>
    </div>
    <div class="bloco">
      <details class="secao-suspenso" id="secaoQualificacao" open>
        <summary class="bloco-titulo secao-summary"><span class="ic azul"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span><div><h3>Escolha uma área de qualificação</h3><p>Cursos online do EVG, Fundação Bradesco, Aprenda Mais (MEC), Trampolim SP, Sebrae SP e cadastros manuais da equipe.</p></div><span class="toggle-lbl"></span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="secao-conteudo">
          <div class="busca-cursos">
            <svg class="busca-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
            <input type="search" id="buscaCursos" autocomplete="off" aria-label="Buscar curso por palavra-chave" placeholder="Buscar curso por palavra-chave — ex.: libras, excel, costura">
            <button type="button" class="busca-limpar" id="buscaLimpar" aria-label="Limpar busca" hidden>&times;</button>
          </div>
          <div class="areas-grade" id="areasGrade" role="tablist"></div>
          <div id="resultadoBusca" hidden></div>
          <p class="dica-area" id="dicaArea">Selecione uma área acima para ver os cursos disponíveis.</p>
          <p class="dica-area" id="statusTrampolim" style="margin-top:.35rem"></p>
          <p class="dica-area" id="statusSebrae" style="margin-top:.35rem"></p>
          <p class="dica-area" id="statusPlanilha" style="margin-top:.35rem"></p>
          <div class="painel" id="painelArea"></div>
        </div>
      </details>
    </div>
    <div class="bloco" id="blocoVagas">
      <details class="secao-suspenso" id="secaoVagas" open>
        <summary class="bloco-titulo secao-summary"><span class="ic verde"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg></span><div><h3>Veja as vagas disponíveis</h3><p>Vagas de emprego na região de ${cidade}.</p></div><span class="toggle-lbl"></span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="secao-conteudo">
          <div id="listaVagas"></div>
          <p class="dica-area" id="statusPlanilhaVagas" style="margin-top:.35rem"></p>
        </div>
      </details>
    </div>`;
  renderAreasGrade(cidade);
  renderVagas();
  ligarBusca();
  initMapa(cidade);
}

/* ============================================================
   BUSCA DE CURSOS POR PALAVRA-CHAVE
   ------------------------------------------------------------
   Procura em TODAS as areas de uma vez (nome do curso,
   instituicao, modalidade, descricao e nome da area). Ignora
   acento e maiuscula, e exige que todas as palavras digitadas
   aparecam -- "libras basico" so traz quem tem as duas.
   ============================================================ */
(function(){
  if(document.getElementById("estilo-busca")) return;
  const st=document.createElement("style");
  st.id="estilo-busca";
  st.textContent=
     ".busca-cursos{position:relative;display:flex;align-items:center;margin:0 0 1.1rem}"
    +".busca-cursos .busca-ico{position:absolute;left:14px;color:var(--texto-suave,#5a6473);pointer-events:none}"
    +".busca-cursos input{width:100%;padding:12px 42px;font:inherit;color:var(--texto,#29303d);"
      +"background:var(--branco,#fff);border:1px solid var(--linha-forte,#cdd6e6);border-radius:11px;"
      +"transition:border-color .15s,box-shadow .15s}"
    +".busca-cursos input::placeholder{color:var(--texto-suave,#5a6473);opacity:.85}"
    +".busca-cursos input:focus{outline:none;border-color:var(--azul-vivo,#1f7ec4);box-shadow:0 0 0 3px rgba(31,126,196,.16)}"
    +".busca-cursos input::-webkit-search-cancel-button,.busca-cursos input::-webkit-search-decoration"
      +"{-webkit-appearance:none;appearance:none}"
    +".busca-limpar{position:absolute;right:8px;width:28px;height:28px;display:flex;align-items:center;"
      +"justify-content:center;font-size:1.35rem;line-height:1;color:var(--texto-suave,#5a6473);"
      +"background:transparent;border:0;border-radius:50%;cursor:pointer}"
    +".busca-limpar:hover{background:#eef2f8;color:var(--texto,#29303d)}"
    +".tag-area-busca{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.03em;"
      +"text-transform:uppercase;color:var(--azul,#0D5A94);background:var(--azul-suave,#eaf0fb);"
      +"border-radius:6px;padding:3px 8px;margin:0 0 9px}";
  document.head.appendChild(st);
})();

let buscaTermo="", buscaTimer=null;

/* junta os cursos de todas as areas, guardando de qual area cada um veio */
function todosCursosDaCidade(){
  const todos=[];
  for(const id of Object.keys(DADOS_CIDADE)){
    const c=DADOS_CIDADE[id];
    if(!c || !c.cursos) continue;
    const nomeArea=areaInfo(id).nome;
    c.cursos.forEach(curso=>todos.push(Object.assign({},curso,{_areaNome:nomeArea})));
  }
  return todos;
}

/* Nota de relevancia do curso para o que foi digitado.
   Zero = alguma palavra nao aparece em lugar nenhum, curso fica de fora.
   Quanto mais a palavra ABRE o nome do curso, maior a nota -- assim
   "ia" poe "IA no Azure" na frente de "tecnologIA" e "mIdiA". */
function pontuarCurso(c,palavras){
  const nome=normTxt(c.nome||"");
  const resto=normTxt([c.inst,c.modalidade,c.desc,c._areaNome].filter(Boolean).join(" "));
  let total=0;
  for(const p of palavras){
    const i=nome.indexOf(p);
    if(i!==-1){
      if(i===0) total+=100;                                  // abre o nome do curso
      else if(/[^a-z0-9]/.test(nome.charAt(i-1))) total+=60; // abre uma palavra do nome
      else total+=25;                                        // no meio de uma palavra
      continue;
    }
    if(resto.indexOf(p)!==-1){ total+=8; continue; }         // so na instituicao/area
    return 0;
  }
  return total;
}

function renderBusca(){
  const wrap=document.getElementById("resultadoBusca");
  if(!wrap) return;
  const grade=document.getElementById("areasGrade");
  const painel=document.getElementById("painelArea");
  const dica=document.getElementById("dicaArea");
  const limpar=document.getElementById("buscaLimpar");

  const termo=normTxt(buscaTermo);
  const ativo=termo.length>=2;          // 1 letra traria quase tudo
  if(limpar) limpar.hidden=!buscaTermo;

  /* com a busca aberta, a grade de areas e o painel saem da frente */
  if(grade)  grade.style.display  = ativo ? "none" : "";
  if(painel) painel.style.display = ativo ? "none" : "";
  if(dica && ativo) dica.style.display="none";

  if(!ativo){ wrap.hidden=true; wrap.innerHTML=""; return; }

  const palavras=termo.split(/\s+/).filter(Boolean);
  const achados=todosCursosDaCidade()
    .map(c=>({c:c,nota:pontuarCurso(c,palavras)}))
    .filter(x=>x.nota>0)
    .sort((a,b)=>cargaOrdem(b.c)-cargaOrdem(a.c) || b.nota-a.nota || (a.c.nome||"").localeCompare(b.c.nome||"","pt-BR"))   // maior carga primeiro; relevancia desempata
    .map(x=>x.c);
  wrap.hidden=false;

  if(!achados.length){
    if(grade) grade.style.display="";   // devolve as areas para a pessoa ter por onde seguir
    wrap.innerHTML='<div class="vazio-area">Nenhum curso com \u201c'+esc(buscaTermo)
      +'\u201d nesta cidade. Tente outra palavra ou escolha uma área abaixo.</div>';
    return;
  }

  const LIMITE=48;
  const mostrar=achados.slice(0,LIMITE);
  const aviso=achados.length>LIMITE
    ? '<p class="dica-area" style="margin:.8rem 0 0;text-align:left">Mostrando os '+LIMITE
      +' primeiros. Acrescente outra palavra para afinar a busca.</p>'
    : "";
  wrap.innerHTML=
     '<div class="sub-cabec"><span class="tag cursos">Busca</span>'
    +'<h4>Resultados para \u201c'+esc(buscaTermo)+'\u201d</h4>'
    +'<span class="qtd">'+achados.length+' curso'+(achados.length!==1?"s":"")+'</span></div>'
    +'<div class="lista">'+mostrar.map(cartaoCurso).join("")+'</div>'+aviso;
}

function ligarBusca(){
  const campo=document.getElementById("buscaCursos");
  const limpar=document.getElementById("buscaLimpar");
  if(!campo) return;
  campo.value=buscaTermo;
  campo.addEventListener("input",()=>{
    buscaTermo=campo.value;
    clearTimeout(buscaTimer);
    buscaTimer=setTimeout(renderBusca,120);
  });
  campo.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ buscaTermo=""; campo.value=""; renderBusca(); }
  });
  if(limpar) limpar.addEventListener("click",()=>{
    buscaTermo=""; campo.value=""; campo.focus(); renderBusca();
  });
  renderBusca();
}

function initMapa(cidade){
  if(MAP){MAP.remove();MAP=null;}
  const centro=CENTROS_MUNICIPIOS[cidade];
  setTimeout(()=>{
    MAP=L.map("mapaP",{scrollWheelZoom:false}).setView([-23.1,-47.05],13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"&copy; OpenStreetMap",maxZoom:19}).addTo(MAP);
    MAP.getPane("tilePane").style.filter="grayscale(1) contrast(.92) brightness(1.06)";
    // o enquadramento começa no centro do município; as camadas (js/mapa-camadas.js) ajustam o zoom quando chegam
    const b=centro?[[centro.lat,centro.lon]]:[];
    mapaBoundsBase=b;
    if(centro) MAP.setView([centro.lat,centro.lon],12);
    MAP.invalidateSize();
    if(typeof atualizarCamadasMapa === "function") atualizarCamadasMapa();
    const dtl=document.getElementById("mapaSuspenso");
    if(dtl) dtl.addEventListener("toggle",()=>{ if(dtl.open && MAP) setTimeout(()=>MAP.invalidateSize(),60); });
  },80);
}

function selecionarArea(cidade,areaId,btn){
  areaAtual=areaId;
  document.querySelectorAll(".area-btn").forEach(x=>x.setAttribute("aria-selected",x===btn?"true":"false"));
  const dica=document.getElementById("dicaArea"); if(dica) dica.style.display="none";
  const area=areaInfo(areaId), c=conteudoDaArea(areaId);
  const cursosHTML=c.cursos.length?`<div class="lista">${ordenarPorCarga(c.cursos).map(cartaoCurso).join("")}</div>`:`<div class="vazio-area">Sem cursos nesta área.</div>`;
  const painel=document.getElementById("painelArea");
  painel.innerHTML=`
    <div class="painel-cabec"><span class="ico">${area.icone}</span><div><h3>${area.nome}</h3><p>${area.descricao}</p></div></div>
    <div class="painel-corpo">
      <div class="painel-conteudo">
        <div class="sub-cabec"><span class="tag cursos">Cursos</span><h4>Cursos disponíveis em ${area.nome}</h4><span class="qtd">${c.cursos.length} disponíve${c.cursos.length!==1?"is":"l"}</span></div>
        ${cursosHTML}
      </div>
    </div>`;
  painel.classList.add("aberto"); painel.scrollIntoView({behavior:"smooth",block:"start"});
}

/* --- renderiza a seção de vagas (separada das áreas de qualificação) --- */
/* ===== Vagas: lista única, mais recentes primeiro ===== */
const URL_SINE = "https://servicos.mte.gov.br/spme-v2/#/login";
const AVISO_GOLPE_VAGAS = '<p class="vagas-aviso"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.500 20h19L12 3Z"/><path d="M12 10v4M12 17.500v.01"/></svg><span><strong>Vaga de verdade nunca cobra taxa.</strong> Desconfie de pedidos de pagamento ou de conversa fora da plataforma.</span></p>';
function urlVagasTrampolimSite(cidade){
  return "https://www.trampolim.sp.gov.br/pt/busca/?smart_filter=false&q=&type=vacancy&order_by=latest&page=1&page_limit=10&status=available&status=extended&locale="+encodeURIComponent(cidade)+"&operation_range=50";
}
const VAGAS_MIN_FILTROS = 8;      // com menos vagas que isso a lista aparece direta, sem botões de filtro
let vagasFiltro = null;           // null | "semexp" | "fund" | "area:<id>"
let vagasRaioAmpliado = 0;        // 0 = raio normal; senão, o raio (km) usado quando a busca foi ampliada
let vagasPendentes = 0;           // fontes de vagas ainda carregando (não mostrar "0 vagas" antes da hora)
function fonteDeVagasConcluida(){ vagasPendentes = Math.max(0, vagasPendentes-1); renderVagas(); }
const vagaSemExperiencia = v => /^\s*sem\s+experi/i.test(v.experiencia||"");
const vagaAteFundamental = v => /fundamental|sem\s+escolaridade/i.test(v.escolaridade||"");
function vagaPassaFiltro(v,f){
  if(!f) return true;
  if(f==="semexp") return vagaSemExperiencia(v);
  if(f==="fund") return vagaAteFundamental(v);
  if(f.indexOf("area:")===0) return v._areaId===f.slice(5);
  return true;
}
function dataDaVaga(v){ return dataDaPlanilha(v.publicadaEm||v._data); }
/* vaga da própria cidade (ou sem cidade informada, como as da planilha para todas as cidades) */
const vagaDaPropriaCidade = v => !v.cidade || normTxt(v.cidade)===normTxt(cidadeAtual||"");
function vagasOrdenadas(lista){
  return lista.map((v,i)=>({v,i,d:dataDaVaga(v),p:vagaDaPropriaCidade(v)?0:1})).sort((a,b)=>{
    const ta=a.d?a.d.getTime():-Infinity, tb=b.d?b.d.getTime():-Infinity;
    return a.p-b.p || tb-ta || a.i-b.i;               // própria cidade primeiro; depois mais recente primeiro; sem data vai para o fim
  }).map(x=>x.v);
}
function todasVagasDaCidade(){
  const todas=[], vistos=new Set();
  for(const id of Object.keys(DADOS_CIDADE)){
    const c=DADOS_CIDADE[id];
    if(!c||!c.oportunidades) continue;
    c.oportunidades.forEach(v=>{
      const chave=v._id!=null ? "id:"+v._id : "t:"+normTxt([v.cargo,v.empresa,v.link].join("|"));
      if(vistos.has(chave)) return;
      vistos.add(chave);
      todas.push(Object.assign({},v,{_areaId:id}));
    });
  }
  return vagasOrdenadas(todas);
}
/* botões de filtro: só com ${VAGAS_MIN_FILTROS}+ vagas; nunca com 0 vagas, nunca "Outros", nem botão que não separa nada */
function opcoesFiltroVagas(vagas){
  if(vagas.length<VAGAS_MIN_FILTROS) return [];
  const ops=[], total=vagas.length;
  const nSem=vagas.filter(vagaSemExperiencia).length, nFund=vagas.filter(vagaAteFundamental).length;
  if(nSem>0&&nSem<total) ops.push(["semexp","Sem experiência",nSem]);
  if(nFund>0&&nFund<total) ops.push(["fund","Até fundamental completo",nFund]);
  const porArea={};
  vagas.forEach(v=>{ if(v._areaId&&v._areaId!=="outros") porArea[v._areaId]=(porArea[v._areaId]||0)+1; });
  const areas=Object.entries(porArea).sort((a,b)=>b[1]-a[1]);
  if(areas.length>=2) areas.forEach(([id,n])=>ops.push(["area:"+id,areaInfo(id).nome,n]));
  return ops;
}
function renderVagas(){
  const wrap=document.getElementById("listaVagas");
  if(!wrap) return;
  if(!wrap.dataset.ligado){
    wrap.dataset.ligado="1";
    wrap.addEventListener("click",e=>{
      const b=e.target.closest("[data-filtro-vaga]");
      if(!b) return;
      vagasFiltro=b.dataset.filtroVaga||null;
      renderVagas();
    });
  }
  const todas=todasVagasDaCidade();
  if(!todas.length){
    if(vagasPendentes>0){ wrap.innerHTML='<div class="vazio-area">Buscando vagas\u2026</div>'; return; }
    wrap.innerHTML=`<div class="vazio-area vagas-vazio"><strong>Ainda não há vagas abertas em ${esc(cidadeAtual||"esta cidade")} neste momento.</strong><p>As vagas mudam com frequência. Veja as mais atuais nos sites oficiais:</p><div class="vagas-vazio-links"><a class="btn-trampolim" href="${esc(urlVagasTrampolimSite(cidadeAtual||""))}" target="_blank" rel="noopener noreferrer">Vagas no Trampolim SP ${linkExterno}</a><a class="btn-trampolim" style="background:var(--azul);" href="${URL_SINE}" target="_blank" rel="noopener noreferrer">Vagas no SINE — Emprega Brasil ${linkExterno}</a></div>${AVISO_GOLPE_VAGAS}</div>`;
    return;
  }
  const ops=opcoesFiltroVagas(todas);
  if(vagasFiltro && !ops.some(o=>o[0]===vagasFiltro)) vagasFiltro=null;
  const vagas=todas.filter(v=>vagaPassaFiltro(v,vagasFiltro));
  const chips=ops.length
    ? `<div class="filtros-vagas" role="group" aria-label="Filtrar vagas"><button type="button" class="chip-vaga" data-filtro-vaga="" aria-pressed="${!vagasFiltro}">Todas <small>${todas.length}</small></button>${ops.map(o=>`<button type="button" class="chip-vaga" data-filtro-vaga="${esc(o[0])}" aria-pressed="${vagasFiltro===o[0]}">${esc(o[1])} <small>${o[2]}</small></button>`).join("")}</div>`
    : "";
  const resumo=vagasFiltro ? `${vagas.length} de ${todas.length} vagas` : `${vagas.length} vaga${vagas.length!==1?"s":""} encontrada${vagas.length!==1?"s":""}, as da sua cidade primeiro, depois as mais recentes`;
  const ampliado=vagasRaioAmpliado ? `<p class="vagas-ampliado">Incluindo vagas em cidades a até ${vagasRaioAmpliado} km de ${esc(cidadeAtual||"")}.</p>` : "";
  const maisLinks=`<p class="vagas-mais"><a href="${esc(urlVagasTrampolimSite(cidadeAtual||""))}" target="_blank" rel="noopener noreferrer">Ver todas as vagas no Trampolim SP ${linkExterno}</a><a href="${URL_SINE}" target="_blank" rel="noopener noreferrer">Mais vagas no SINE – Emprega Brasil ${linkExterno}</a></p>${AVISO_GOLPE_VAGAS}`;
  wrap.innerHTML=`<p class="dica-area" style="margin:0 0 .8rem;text-align:left">${resumo}</p>${ampliado}${chips}<div class="lista">${vagas.map(cartaoVaga).join("")}</div>${maisLinks}`;
}

const linkExterno=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
/* ============================================================
   DETECCAO DE LINK DO GOOGLE MAPS
   ------------------------------------------------------------
   Quando o cadastrante nao tem uma URL de inscricao online e
   coloca apenas o link do Google Maps apontando para o local
   fisico da instituicao, mostramos um botao com rotulo
   diferente ("Local de inscricao" no lugar de "Como se
   inscrever" / "Local da vaga" no lugar de "Ver vaga") para
   sinalizar ao supervisor que a inscricao/candidatura sera
   presencial no endereco indicado pelo mapa.
   ============================================================ */
function ehLinkMaps(link){
  if(!link || typeof link !== "string") return false;
  return /google\.[a-z.]+\/maps/i.test(link)
      || /maps\.google\./i.test(link)
      || /goo\.gl\/maps/i.test(link)
      || /maps\.app\.goo\.gl/i.test(link);
}

/* --- detecta curso Senac --- */
function ehSenac(c){
  const t = ((c.nome||"")+" "+(c.inst||"")).toLowerCase();
  return t.includes("senac") || t.includes("orango");
}
/* --- modal Senac (inicialização lazy — o HTML fica após o script) --- */
window._abrirModalSenac = function(url){
  const overlay = document.getElementById("modalSenac");
  const linkEl  = document.getElementById("modalSenacLink");
  const fechar  = document.getElementById("modalSenacFechar");
  if(!overlay) return;
  linkEl.href = url;
  overlay.classList.add("aberto");
  function close(){ overlay.classList.remove("aberto"); }
  fechar.onclick = close;
  overlay.onclick = function(e){ if(e.target===overlay) close(); };
  document.onkeydown = function(e){ if(e.key==="Escape" && overlay.classList.contains("aberto")) close(); };
};

/* ============================================================
   INSCRICOES QUE AINDA NAO ABRIRAM
   ------------------------------------------------------------
   Curso com "inscricoes_de" no futuro aparece na lista normal-
   mente, mas com um selo avisando a data e o botao desativado.
   Na data, libera sozinho e o selo some.
   ============================================================ */
(function(){
  if(document.getElementById("estilo-abertura")) return;
  const st=document.createElement("style");
  st.id="estilo-abertura";
  st.textContent=".selo-abertura{display:inline-flex;align-items:center;gap:6px;background:#fff4e5;border:1px solid #ffd9a8;color:#8a4b00;font-size:.78rem;font-weight:700;line-height:1.3;border-radius:8px;padding:5px 9px;margin:0 0 9px}"
    +".btn-curso.btn-bloqueado{background:#e8ebee!important;color:#8a949e!important;border:1px solid #dde1e6!important;cursor:not-allowed;pointer-events:none;box-shadow:none!important}";
  document.head.appendChild(st);
})();
function _dataSimples(v){
  if(!v) return null;
  const s=String(v).trim(); if(!s) return null;
  const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let d=null;
  if(br) d=new Date(+br[3],+br[2]-1,+br[1]);
  else if(iso) d=new Date(+iso[1],+iso[2]-1,+iso[3]);
  else { const t=new Date(s); if(!isNaN(t.getTime())) d=new Date(t.getFullYear(),t.getMonth(),t.getDate()); }
  return d && !isNaN(d.getTime()) ? d : null;
}
function aindaNaoAbriu(c){
  const d=_dataSimples(c && c._de);
  if(!d) return null;
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  return d>hoje ? d : null;
}
function _dataCurta(d){
  const dd=String(d.getDate()).padStart(2,"0"), mm=String(d.getMonth()+1).padStart(2,"0");
  return dd+"/"+mm+(d.getFullYear()!==new Date().getFullYear()?"/"+d.getFullYear():"");
}

function cartaoCurso(c){
  const rotulo = ehLinkMaps(c.link) ? "Local de inscrição" : "Como se inscrever";
  const abreEm = aindaNaoAbriu(c);
  let acao = "";
  if(abreEm && urlValida(c.link)){
    acao = '<span class="btn-curso btn-bloqueado" aria-disabled="true" title="As inscrições ainda não começaram">'+rotulo+' '+linkExterno+'</span>';
  } else if(urlValida(c.link)){
    if(ehSenac(c)){
      acao = '<a class="btn-curso btn-senac" href="#" onclick="event.preventDefault();window._abrirModalSenac(\''+esc(c.link).replace(/'/g,"\\'")+'\')">'+rotulo+' '+linkExterno+'</a>';
    } else {
      acao = '<a class="btn-curso" href="'+esc(c.link)+'" target="_blank" rel="noopener noreferrer">'+rotulo+' '+linkExterno+'</a>';
    }
  }
  const seloAbertura = abreEm
    ? `<div class="selo-abertura"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a4b00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg> Inscrições a partir de ${_dataCurta(abreEm)}</div>`
    : "";
  const tagArea = c._areaNome ? '<div class="tag-area-busca">'+esc(c._areaNome)+'</div>' : "";
  const badgeVizinha = c._deOutraCidade
    ? `<div class="badge-outra-cidade"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E65100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"/><circle cx="12" cy="9" r="2.5"/></svg> Curso disponível em ${esc(c._deOutraCidade)} (município vizinho)</div>`
    : "";
  return `<div class="curso">${seloAbertura}${tagArea}${badgeVizinha}<div class="nome">${esc(c.nome)}</div>${c.inst?`<div class="inst"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-4 7 4v12M9 21v-6h6v6"/></svg> ${esc(c.inst)}</div>`:""}${c.desc?`<div class="desc">${esc(c.desc)}</div>`:""}<div class="meta">${c.modalidade?`<span class="item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(c.modalidade)}</span>`:""}${c.turno?`<span class="item">🕗 ${esc(c.turno)}</span>`:""}${c.carga?`<span class="item">⏱ ${c.carga}${cargaNaFaixaTolerada(c.carga)?" (15–19h)":""}</span>`:""}${c.bolsa?`<span class="item">🎓 Bolsa auxílio</span>`:""}</div>${acao?`<div class="rodape">${acao}</div>`:""}</div>`;
}
function cartaoVaga(v){
  const rotulo = ehLinkMaps(v.link) ? "Local da vaga" : "Ver vaga";
  const acao = urlValida(v.link) ? '<a class="btn-vaga" href="'+esc(v.link)+'" target="_blank" rel="noopener noreferrer">'+rotulo+' '+linkExterno+'</a>' : "";
  const ic = (d)=>'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
  const item = (txt,icone,classe)=>'<span class="item'+(classe?" "+classe:"")+'">'+(icone||"")+esc(txt)+'</span>';
  const semExp = vagaSemExperiencia(v);
  const area = (v._areaId && v._areaId!=="outros") ? areaInfo(v._areaId).nome : "";
  const data = dataDaVaga(v);
  const publicada = data ? data.toLocaleDateString("pt-BR") : "";
  const meta = [
    area ? item(area, ic('<path d="M3 7h18M3 12h18M3 17h18"/>')) : "",
    semExp ? item("Aceita sem experiência", ic('<path d="m5 12 5 5 9-10"/>'), "destaque") : (v.experiencia ? item(v.experiencia, ic('<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>')) : ""),
    v.escolaridade ? item(/sem\s+escolaridade/i.test(v.escolaridade) ? "Sem escolaridade mínima" : "Escolaridade: "+v.escolaridade, ic('<path d="M3 9l9-5 9 5-9 5-9-5Z"/><path d="M7 11.5V16c0 1 2.2 2 5 2s5-1 5-2v-4.5"/>')) : "",
    v.turno ? item("Turno: "+v.turno, ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')) : (v.modalidade ? item(v.modalidade, ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')) : ""),
    v.tipo ? item(v.tipo, ic('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>')) : "",
    v.cidade ? item(v.cidade, ic('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11Z"/><circle cx="12" cy="10" r="2.500"/>')) : "",
    (v.telefone && !v.anonima) ? item(v.telefone, ic('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>')) : "",
    publicada ? item("Publicada em "+publicada, ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')) : ""
  ].filter(Boolean).join("");
  return '<div class="vaga"><div class="cargo">'+esc(v.cargo||"")+'</div>'+
    (v.empresa ? '<div class="empresa"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>'+esc(v.empresa)+(v._trampolim ? ' <small class="via">via Trampolim SP</small>' : "")+'</span></div>' : "")+
    (v.desc ? '<div class="desc">'+esc(v.desc)+'</div>' : "")+
    '<div class="meta">'+meta+'</div>'+(acao ? '<div class="rodape">'+acao+'</div>' : "")+'</div>';
}
