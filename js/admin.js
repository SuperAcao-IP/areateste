/* =====================================================================
   PAINEL ADMINISTRATIVO  ·  cadastro manual na planilha do Google
   Grava via Apps Script (APPS_SCRIPT_URL, em js/config.js).
   ===================================================================== */
/* ====== PAINEL ADMINISTRATIVO ====== */
const MODAL_ADM=["Presencial","Online","Híbrido"];
const CONTRATO_ADM=["CLT","Estágio","Jovem Aprendiz","Temporário","PJ / Autônomo","Outro"];
const MUN_ADM=["Online / Todos os municípios"].concat(MUNICIPIOS);
let abaAdm="cursos", editIdx=-1;
const elOverlay=document.getElementById("admin");
document.getElementById("abrirAdmin").addEventListener("click",async()=>{
  await carregarDados();
  /* carrega planilha para mostrar na lista do admin */
  try{ await buscarCursosPlanilha(); }catch(e){ console.warn("[Admin] planilha cursos:", e); }
  try{ await buscarVagasPlanilha(); }catch(e){ console.warn("[Admin] planilha vagas:", e); }
  elOverlay.hidden=false; editIdx=-1; renderAdmin();
});
document.getElementById("fecharAdmin").addEventListener("click",()=>{ elOverlay.hidden=true; });
elOverlay.addEventListener("click",e=>{ if(e.target===elOverlay) elOverlay.hidden=true; });
document.querySelectorAll(".admin-tabs button").forEach(b=>b.addEventListener("click",()=>{ abaAdm=b.dataset.t; editIdx=-1; document.querySelectorAll(".admin-tabs button").forEach(x=>x.classList.toggle("ativa",x===b)); renderAdmin(); }));

function aopt(v,sel){ return '<option'+(v===sel?' selected':'')+'>'+v+'</option>'; }
function aselect(id,arr,sel){ return '<select id="'+id+'"><option value=""></option>'+arr.map(v=>aopt(v,sel)).join('')+'</select>'; }
function ainp(id,val,ph,type){ return '<input id="'+id+'" type="'+(type||"text")+'" value="'+(val?String(val).replace(/"/g,'&quot;'):"")+'"'+(ph?' placeholder="'+ph+'"':'')+'>'; }
function acampo(lbl,inner){ return '<label class="a_campo"><span>'+lbl+'</span>'+inner+'</label>'; }
function abotoes(){ return '<div class="a_botoes"><button id="a_salvar" class="btn-prim" type="button">'+(editIdx>=0?"Salvar edição":"Adicionar")+'</button>'+(editIdx>=0?'<button id="a_cancelar" class="btn-sec" type="button">Cancelar</button>':'')+'</div>'; }
function aval(id){ const e=document.getElementById(id); return e?e.value.trim():""; }

function renderAdmin(){
  const f=document.getElementById("admin-form");
  const it=editIdx>=0?(DADOS[abaAdm][editIdx]||{}):{};
  if(abaAdm==="cursos"){
    f.innerHTML=acampo("Município",aselect("a_mun",MUN_ADM,it.municipio))
      +acampo("Área",aselect("a_area",todasAreas().map(a=>a.nome),it.area))
      +acampo("Curso",ainp("a_curso",it.curso))
      +acampo("Instituição",ainp("a_inst",it.instituicao))
      +acampo("Modalidade",aselect("a_mod",MODAL_ADM,it.modalidade))
      +acampo("Carga horária",ainp("a_carga",it.carga))
      +acampo("Link de inscrição",ainp("a_link",it.link,"https://"))
      +acampo("Inscrições até",ainp("a_ate",it.inscricoes_ate,"","date"))
      +acampo("Status",aselect("a_status",["Aberto","Encerrado"],it.status||"Aberto"))
      +abotoes();
  }else{
    f.innerHTML=acampo("Município",aselect("a_mun",MUNICIPIOS,it.municipio))
      +acampo("Área",aselect("a_area",todasAreas().map(a=>a.nome),it.area))
      +acampo("Cargo / vaga",ainp("a_cargo",it.cargo))
      +acampo("Empresa",ainp("a_empresa",it.empresa))
      +acampo("Cidade",ainp("a_cidade",it.cidade))
      +acampo("Tipo de contrato",aselect("a_tipo",CONTRATO_ADM,it.tipo))
      +acampo("Link da vaga",ainp("a_link",it.link,"https://"))
      +acampo("Validade (até)",ainp("a_val",it.validade,"","date"))
      +acampo("Status",aselect("a_status",["Aberto","Encerrado"],it.status||"Aberto"))
      +abotoes();
  }
  document.getElementById("a_salvar").addEventListener("click",salvarAdm);
  const c=document.getElementById("a_cancelar"); if(c) c.addEventListener("click",()=>{editIdx=-1;renderAdmin();});
  renderListaAdm();
}
async function salvarAdm(){
  const link=aval("a_link");
  if(link && !urlValida(link)){ alert("O link precisa começar com http:// ou https:// e ser um endereço válido."); return; }
  let obj, ok;
  if(abaAdm==="cursos"){
    obj={municipio:aval("a_mun"),area:aval("a_area"),curso:aval("a_curso"),instituicao:aval("a_inst"),modalidade:aval("a_mod"),carga:aval("a_carga"),link:link,inscricoes_ate:aval("a_ate"),status:aval("a_status")||"Aberto"};
    ok=obj.curso&&obj.area&&obj.municipio;
  }else{
    obj={municipio:aval("a_mun"),area:aval("a_area"),cargo:aval("a_cargo"),empresa:aval("a_empresa"),tipo_contrato:aval("a_tipo"),modalidade:aval("a_mod")||"",descricao:"",link:link,status:aval("a_status")||"Aberto"};
    ok=obj.cargo&&obj.area&&obj.municipio;
  }
  if(!ok){ alert("Preencha pelo menos Município, Área e o "+(abaAdm==="cursos"?"Curso":"Cargo")+"."); return; }
  /* envia para o Apps Script */
  const btnSalvar = document.getElementById("a_salvar");
  const textoOriginal = btnSalvar.textContent;
  btnSalvar.textContent = "Salvando...";
  btnSalvar.disabled = true;
  try{
    if(APPS_SCRIPT_URL.includes("COLE_A_URL")){
      alert("Configure a constante APPS_SCRIPT_URL no código com a URL do Google Apps Script implantado.");
      return;
    }
    const resp = await fetch(APPS_SCRIPT_URL, {
      method:"POST", redirect:"follow",
      headers:{"Content-Type":"text/plain"},
      body: JSON.stringify({ acao:"adicionar", tipo:abaAdm, dados:obj })
    });
    const result = await resp.json();
    if(result.status===200){
      /* injeta o item direto no cache local para aparecer na lista imediatamente
         (o CSV publicado do Google Sheets pode levar alguns minutos para atualizar) */
      if(abaAdm==="cursos"){
        const novoItem = normalizarCursoPlanilha(Object.assign({}, obj, {origem:"admin"}));
        if(!cachePlanilha.cursos) cachePlanilha.cursos = [];
        cachePlanilha.cursos.push(novoItem);
      }else{
        const novoItem = normalizarVagaPlanilha(Object.assign({}, obj, {origem:"admin"}));
        if(!cachePlanilhaVagas.vagas) cachePlanilhaVagas.vagas = [];
        cachePlanilhaVagas.vagas.push(novoItem);
      }
      editIdx=-1;
      renderAdmin();
      alert((abaAdm==="cursos"?"Curso":"Vaga")+" adicionado(a) com sucesso!");
      if(cidadeAtual) selecionarCidade(cidadeAtual);
    }else{
      alert("Erro ao salvar: "+(result.mensagem||"desconhecido"));
    }
  }catch(e){
    console.error("[Admin] Erro ao salvar:", e);
    alert("Erro de conexão ao salvar. Verifique sua internet e tente novamente.");
  }finally{
    btnSalvar.textContent = textoOriginal;
    btnSalvar.disabled = false;
  }
}
function badgeAdm(it){
  const ate=abaAdm==="cursos"?it.inscricoes_ate:it.validade;
  if((it.status||"").toLowerCase()==="encerrado") return '<span class="badge enc">Encerrado</span>';
  if(ate){ const d=new Date(ate); if(!isNaN(d.getTime()) && d<hoje0()) return '<span class="badge exp">Expirado</span>'; }
  return '<span class="badge ok">No ar</span>';
}
function renderListaAdm(){
  const wrap=document.getElementById("admin-lista");
  /* mostra APENAS os itens cadastrados pelo painel (origem=admin) */
  let arr;
  if(abaAdm==="cursos"){
    arr = (cachePlanilha.cursos||[]).filter(c=>c._origem==="admin").map(c=>({curso:c.nome, area:c._area||"", municipio:c._municipio||"", status:c._status||"Aberto", inscricoes_ate:c._ate||"", _raw:c}));
  }else{
    arr = (cachePlanilhaVagas.vagas||[]).filter(v=>v._origem==="admin").map(v=>({cargo:v.cargo, area:v._area||"", municipio:v._municipio||v.cidade||"", status:v._status||"Aberto", _raw:v}));
  }
  if(!arr.length){ wrap.innerHTML='<p class="a_vazio">Nenhum '+(abaAdm==="cursos"?"curso":"vaga")+' cadastrado(a) na planilha ainda. Use o formulário acima para adicionar.</p>'; return; }
  wrap.innerHTML='<table class="a_tabela"><thead><tr><th>'+(abaAdm==="cursos"?"Curso":"Cargo")+'</th><th>Área</th><th>Município</th><th>Situação</th><th></th></tr></thead><tbody>'
    +arr.map((it,i)=>'<tr><td>'+esc((abaAdm==="cursos"?it.curso:it.cargo)||"")+'</td><td>'+esc(it.area||"")+'</td><td>'+esc(it.municipio||"")+'</td><td>'+badgeAdm(it)+'</td><td><button class="a_link del" data-del="'+i+'" type="button">Excluir</button></td></tr>').join('')
    +'</tbody></table>';
  wrap.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",async()=>{
    if(!confirm("Excluir este item da planilha? Esta ação é permanente.")) return;
    const idx = +b.dataset.del;
    const item = arr[idx];
    const campoChave = abaAdm==="cursos" ? "curso" : "cargo";
    b.textContent = "Excluindo...";
    b.disabled = true;
    try{
      if(APPS_SCRIPT_URL.includes("COLE_A_URL")){
        alert("Configure a constante APPS_SCRIPT_URL no código.");
        return;
      }
      const resp = await fetch(APPS_SCRIPT_URL, {
        method:"POST", redirect:"follow",
        headers:{"Content-Type":"text/plain"},
        body: JSON.stringify({
          acao:"excluir",
          tipo:abaAdm,
          linha_id:{ [campoChave]: item[campoChave], municipio: item.municipio }
        })
      });
      const result = await resp.json();
      if(result.status===200){
        alert("Excluído com sucesso!");
        cachePlanilha.cursos = null;
        cachePlanilhaVagas.vagas = null;
        /* recarrega a planilha para atualizar a lista */
        if(abaAdm==="cursos"){ await buscarCursosPlanilha(); } else { await buscarVagasPlanilha(); }
        renderListaAdm();
        if(cidadeAtual) selecionarCidade(cidadeAtual);
      }else{
        alert("Erro ao excluir: "+(result.mensagem||"desconhecido"));
        b.textContent = "Excluir";
        b.disabled = false;
      }
    }catch(e){
      console.error("[Admin] Erro ao excluir:", e);
      alert("Erro de conexão. Verifique sua internet e tente novamente.");
      b.textContent = "Excluir";
      b.disabled = false;
    }
  }));
}
