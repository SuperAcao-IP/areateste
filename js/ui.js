/* =====================================================================
   INTERFACE  ·  estado da pagina, render da cidade, areas, cartoes,
   mapa (Leaflet) e modal do Senac
   ===================================================================== */
const MUNICIPIOS = Object.keys(MAPA).sort((a,b)=>a.localeCompare(b,"pt-BR"));
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
  EVG.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:c.inst+" · EVG (online, gratuito)", modalidade:"Online", carga:c.carga, link:c.link}));
  EV.forEach(c=>add(areaDoCurso(c.titulo, c.area),"cursos",
    {nome:c.titulo, inst:"Fundação Bradesco · Escola Virtual (online, gratuito)", modalidade:"Online", carga:c.carga, link:c.link}));
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
function areasComConteudo(){ return todasAreas().filter(a=>{const c=DADOS_CIDADE[a.id]; return c&&(c.cursos.length||c.oportunidades.length);}); }

async function selecionarCidade(cidade){
  const token = ++buscaToken;
  cidadeAtual=cidade; areaAtual=null; montarChips();
  const alvo=document.getElementById("painelCidade");
  alvo.innerHTML='<div class="vazio-inicial"><p>Carregando cursos e vagas de <b>'+cidade+'</b>...</p></div>';
  window.scrollTo({top:alvo.offsetTop-70,behavior:"smooth"});
  await montarDados(cidade);
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
}
function renderCidade(cidade){
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
        <summary class="bloco-titulo mapa-summary"><span class="ic azul"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg></span><div><h3>Mapa de ${cidade}</h3><p>Pontos reais do seu My Maps: cursos (verde), empregadores (roxo) e serviços (rosa).</p></div><span class="toggle-lbl"></span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="mapa-card">
          <div id="mapaP" style="width:100%;height:440px;background:#dfe6f1"></div>
          <div class="mapa-legenda">>
            <span style="display:inline-flex;align-items:center;gap:.4rem"><span style="width:11px;height:11px;border-radius:50%;background:#7CB342;border:2px solid #fff;box-shadow:0 0 0 1px #ccc"></span> Cursos</span>
            <span style="display:inline-flex;align-items:center;gap:.4rem;margin-left:1rem"><span style="width:11px;height:11px;border-radius:50%;background:#673AB7;border:2px solid #fff;box-shadow:0 0 0 1px #ccc"></span> Empregadores</span>
            <span style="display:inline-flex;align-items:center;gap:.4rem;margin-left:1rem"><span style="width:11px;height:11px;border-radius:50%;background:#C2185B;border:2px solid #fff;box-shadow:0 0 0 1px #ccc"></span> Serviços (CRAS, PAT, Sebrae Aqui)</span>
          </div>
        </div>
      </details>
    </div>
    <div class="bloco">
      <details class="secao-suspenso" id="secaoQualificacao" open>
        <summary class="bloco-titulo secao-summary"><span class="ic azul"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span><div><h3>Escolha uma área de qualificação</h3><p>Cursos online do EVG, Fundação Bradesco, Trampolim SP, Sebrae SP e cadastros manuais da equipe.</p></div><span class="toggle-lbl"></span><svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="secao-conteudo">
          <div class="areas-grade" id="areasGrade" role="tablist"></div>
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
          <div class="trampolim-link-card">
            <div class="trampolim-link-info">
              <div>
                <strong>Trampolim SP</strong>
                <span>Plataforma oficial do Governo do Estado com vagas de emprego atualizadas diariamente para a região.</span>
              </div>
            </div>
            <a class="btn-trampolim" href="https://www.trampolim.sp.gov.br/pt/busca/?smart_filter=false&q=&type=vacancy&order_by=latest&page=1&page_limit=10&status=available&status=extended&locale=${encodeURIComponent(cidade)}&operation_range=50" target="_blank" rel="noopener noreferrer">
              Ver vagas em ${cidade} no Trampolim SP
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            </a>
          </div>
          <div class="trampolim-link-card">
            <div class="trampolim-link-info">
              <div>
                <strong>SINE — Emprega Brasil</strong>
                <span>Portal do Governo Federal com vagas do Sistema Nacional de Emprego em todo o país. Requer login com gov.br.</span>
              </div>
            </div>
            <a class="btn-trampolim" style="background:var(--azul);" href="https://servicos.mte.gov.br/spme-v2/#/login" target="_blank" rel="noopener noreferrer">
              Consultar vagas no Emprega Brasil
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            </a>
          </div>
          <div id="listaVagas"></div>
          <p class="dica-area" id="statusPlanilhaVagas" style="margin-top:.35rem"></p>
        </div>
      </details>
    </div>`;
  renderAreasGrade(cidade);
  renderVagas();
  initMapa(cidade);
}

function initMapa(cidade){
  if(MAP){MAP.remove();MAP=null;}
  const d=MAPA[cidade]||{};
  setTimeout(()=>{
    MAP=L.map("mapaP",{scrollWheelZoom:false}).setView([-23.1,-47.05],13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OpenStreetMap &copy; CARTO",subdomains:"abcd",maxZoom:19}).addTo(MAP);
    const b=[];
    ["curso","empregador","cras"].forEach(tp=>(d[tp]||[]).forEach(p=>{
      L.circleMarker([p.lat,p.lon],{radius:8,color:"#fff",weight:2,fillColor:COR[tp],fillOpacity:1}).bindPopup("<b>"+p.n+"</b>").addTo(MAP);
      b.push([p.lat,p.lon]);
    }));
    if(b.length) MAP.fitBounds(b,{padding:[40,40],maxZoom:14});
    MAP.invalidateSize();
    const dtl=document.getElementById("mapaSuspenso");
    if(dtl) dtl.addEventListener("toggle",()=>{ if(dtl.open && MAP) setTimeout(()=>MAP.invalidateSize(),60); });
  },80);
}

function selecionarArea(cidade,areaId,btn){
  areaAtual=areaId;
  document.querySelectorAll(".area-btn").forEach(x=>x.setAttribute("aria-selected",x===btn?"true":"false"));
  const dica=document.getElementById("dicaArea"); if(dica) dica.style.display="none";
  const area=areaInfo(areaId), c=conteudoDaArea(areaId);
  const cursosHTML=c.cursos.length?`<div class="lista">${c.cursos.map(cartaoCurso).join("")}</div>`:`<div class="vazio-area">Sem cursos nesta área.</div>`;
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
function todasVagasDaCidade(){
  const todas=[];
  for(const id of Object.keys(DADOS_CIDADE)){
    const c=DADOS_CIDADE[id];
    if(c&&c.oportunidades) c.oportunidades.forEach(v=>todas.push(v));
  }
  return todas;
}
function renderVagas(){
  const wrap=document.getElementById("listaVagas");
  if(!wrap) return;
  const vagas=todasVagasDaCidade();
  if(!vagas.length){
    wrap.innerHTML='<div class="vazio-area">Nenhuma vaga encontrada para esta cidade ainda. As vagas são carregadas ao vivo do Trampolim SP.</div>';
    return;
  }
  wrap.innerHTML=`<p class="dica-area" style="margin:0 0 1rem;text-align:left">${vagas.length} vaga${vagas.length!==1?"s":""} encontrada${vagas.length!==1?"s":""}</p><div class="lista">${vagas.map(cartaoVaga).join("")}</div>`;
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

function cartaoCurso(c){
  const rotulo = ehLinkMaps(c.link) ? "Local de inscrição" : "Como se inscrever";
  let acao = "";
  if(urlValida(c.link)){
    if(ehSenac(c)){
      acao = '<a class="btn-curso btn-senac" href="#" onclick="event.preventDefault();window._abrirModalSenac(\''+esc(c.link).replace(/'/g,"\\'")+'\')">'+rotulo+' '+linkExterno+'</a>';
    } else {
      acao = '<a class="btn-curso" href="'+esc(c.link)+'" target="_blank" rel="noopener noreferrer">'+rotulo+' '+linkExterno+'</a>';
    }
  }
  const badgeVizinha = c._deOutraCidade
    ? `<div class="badge-outra-cidade"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E65100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z"/><circle cx="12" cy="9" r="2.5"/></svg> Curso disponível em ${esc(c._deOutraCidade)} (município vizinho)</div>`
    : "";
  return `<div class="curso">${badgeVizinha}<div class="nome">${esc(c.nome)}</div>${c.inst?`<div class="inst"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-4 7 4v12M9 21v-6h6v6"/></svg> ${esc(c.inst)}</div>`:""}${c.desc?`<div class="desc">${esc(c.desc)}</div>`:""}<div class="meta">${c.modalidade?`<span class="item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(c.modalidade)}</span>`:""}${c.turno?`<span class="item">🕗 ${esc(c.turno)}</span>`:""}${c.carga?`<span class="item">⏱ ${c.carga}</span>`:""}${c.bolsa?`<span class="item">🎓 Bolsa auxílio</span>`:""}</div>${acao?`<div class="rodape">${acao}</div>`:""}</div>`;
}
function cartaoVaga(v){
  const rotulo = ehLinkMaps(v.link) ? "Local da vaga" : "Ver vaga";
  const acao = urlValida(v.link) ? '<a class="btn-vaga" href="'+esc(v.link)+'" target="_blank" rel="noopener noreferrer">'+rotulo+' '+linkExterno+'</a>' : "";
  return `<div class="vaga"><div class="cargo">${esc(v.cargo||"")}</div>${v.empresa?`<div class="empresa"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> ${esc(v.empresa)}</div>`:""}${v.desc?`<div class="desc">${esc(v.desc)}</div>`:""}<div class="meta">${v.modalidade?`<span class="item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${esc(v.modalidade)}</span>`:""}${v.tipo?`<span class="item">📋 ${esc(v.tipo)}</span>`:""}${v.cidade?`<span class="item">📍 ${esc(v.cidade)}</span>`:""}</div>${acao?`<div class="rodape">${acao}</div>`:""}</div>`;
}
