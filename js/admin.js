/* =====================================================================
   PAINEL ADMINISTRATIVO  ·  cadastro manual na planilha do Google
   Grava via Apps Script (APPS_SCRIPT_URL, em js/config.js).
   ===================================================================== */
/* ====== PAINEL ADMINISTRATIVO ====== */
(function(){
  if(document.getElementById("adm-estilo-obrig")) return;
  const st=document.createElement("style");
  st.id="adm-estilo-obrig";
  st.textContent=".a_obrig{color:#d32f2f;font-weight:800;margin-left:2px}"
    +".a_campo .a_dica{display:block;font-weight:400;font-size:.78rem;line-height:1.35;color:#5c6b7a;margin:2px 0 4px}"
    +".a_campo.erro input,.a_campo.erro select{border-color:#d32f2f!important;background:#fff6f6}"
    +".a_aviso_erro{color:#b71c1c;background:#fff5f5;border:1px solid #f0c2c2;border-radius:8px;padding:9px 11px;margin:10px 0 0;font-size:.85rem;line-height:1.4}"
    +".a_legenda_obrig{font-size:.8rem;color:#5c6b7a;margin:0}"
    +"#admin-form .a_legenda_obrig,#admin-form .a_botoes,#admin-form .a_aviso_erro{grid-column:1/-1;flex-basis:100%;width:100%}"
    +"#admin-form .a_campo{display:flex;flex-direction:column;align-self:stretch}"
    +"#admin-form .a_campo>input,#admin-form .a_campo>select{margin-top:auto}";
  document.head.appendChild(st);
})();
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
function acampo(lbl,inner,obrig,dica){
  return '<label class="a_campo"><span>'+lbl+(obrig?' <b class="a_obrig" title="Campo obrigatório">*</b>':'')+'</span>'
    +(dica?'<span class="a_dica">'+dica+'</span>':'')+inner+'</label>';
}
/* campos que nao podem ficar em branco */
const OBRIG_CURSOS=[["a_mun","Município"],["a_area","Área"],["a_curso","Curso"],["a_inst","Instituição"],["a_mod","Modalidade"],["a_carga","Carga horária"],["a_link","Link de inscrição ou endereço no mapa"],["a_ate","Inscrições até"],["a_status","Status"]];
const OBRIG_VAGAS=[["a_mun","Município"],["a_area","Área"],["a_cargo","Cargo / vaga"],["a_empresa","Empresa"],["a_cidade","Cidade"],["a_tipo","Tipo de contrato"],["a_link","Link da vaga"],["a_val","Validade (até)"],["a_status","Status"]];
function limparErrosAdm(){
  document.querySelectorAll("#admin-form .a_campo.erro").forEach(el=>el.classList.remove("erro"));
  const v=document.getElementById("a_erro"); if(v) v.remove();
}
function avisoAdm(msg){
  const div=document.createElement("div");
  div.id="a_erro"; div.className="a_aviso_erro"; div.textContent=msg;
  const bts=document.querySelector("#admin-form .a_botoes");
  if(bts&&bts.parentNode) bts.parentNode.insertBefore(div,bts.nextSibling);
  else document.getElementById("admin-form").appendChild(div);
}
function validarObrigatorios(campos){
  limparErrosAdm();
  const faltando=[];
  campos.forEach(([id,lbl])=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(!String(el.value||"").trim()){
      faltando.push(lbl);
      const box=el.closest(".a_campo"); if(box) box.classList.add("erro");
    }
  });
  if(!faltando.length) return true;
  avisoAdm("Preencha os campos obrigatórios antes de adicionar: "+faltando.join(", ")+".");
  const primeiro=document.querySelector("#admin-form .a_campo.erro");
  if(primeiro){
    primeiro.scrollIntoView({behavior:"smooth",block:"center"});
    const inp=primeiro.querySelector("input,select"); if(inp) inp.focus({preventScroll:true});
  }
  return false;
}
function abotoes(){ return '<div class="a_botoes"><button id="a_salvar" class="btn-prim" type="button">'+(editIdx>=0?"Salvar edição":"Adicionar")+'</button>'+(editIdx>=0?'<button id="a_cancelar" class="btn-sec" type="button">Cancelar</button>':'')+'</div>'; }
function aval(id){ const e=document.getElementById(id); return e?e.value.trim():""; }

function renderAdmin(){
  const f=document.getElementById("admin-form");
  const it=editIdx>=0?(DADOS[abaAdm][editIdx]||{}):{};
  if(abaAdm==="cursos"){
    f.innerHTML='<p class="a_legenda_obrig">Os campos marcados com <b class="a_obrig">*</b> são obrigatórios.</p>'
      +acampo("Município",aselect("a_mun",MUN_ADM,it.municipio),true)
      +acampo("Área",aselect("a_area",todasAreas().map(a=>a.nome),it.area),true)
      +acampo("Curso",ainp("a_curso",it.curso),true)
      +acampo("Instituição",ainp("a_inst",it.instituicao),true)
      +acampo("Modalidade",aselect("a_mod",MODAL_ADM,it.modalidade),true)
      +acampo("Carga horária",ainp("a_carga",it.carga),true)
      +acampo("Link de inscrição ou endereço no mapa",ainp("a_link",it.link,"https://"),true)
      +acampo("Inscrições a partir de",ainp("a_de",it.inscricoes_de,"","date"))
      +acampo("Inscrições até",ainp("a_ate",it.inscricoes_ate,"","date"),true)
      +acampo("Status",aselect("a_status",["Aberto","Encerrado"],it.status||"Aberto"),true)
      +abotoes();
  }else{
    f.innerHTML='<p class="a_legenda_obrig">Os campos marcados com <b class="a_obrig">*</b> são obrigatórios.</p>'
      +acampo("Município",aselect("a_mun",MUNICIPIOS,it.municipio),true)
      +acampo("Área",aselect("a_area",todasAreas().map(a=>a.nome),it.area),true)
      +acampo("Cargo / vaga",ainp("a_cargo",it.cargo),true)
      +acampo("Empresa",ainp("a_empresa",it.empresa),true)
      +acampo("Cidade",ainp("a_cidade",it.cidade),true)
      +acampo("Tipo de contrato",aselect("a_tipo",CONTRATO_ADM,it.tipo),true)
      +acampo("Link da vaga",ainp("a_link",it.link,"https://"),true)
      +acampo("Validade (até)",ainp("a_val",it.validade,"","date"),true)
      +acampo("Status",aselect("a_status",["Aberto","Encerrado"],it.status||"Aberto"),true)
      +abotoes();
  }
  document.querySelectorAll("#admin-form input,#admin-form select").forEach(el=>{
    const limpa=()=>{ const b=el.closest(".a_campo"); if(b) b.classList.remove("erro"); };
    el.addEventListener("input",limpa); el.addEventListener("change",limpa);
  });
  document.getElementById("a_salvar").addEventListener("click",salvarAdm);
  const c=document.getElementById("a_cancelar"); if(c) c.addEventListener("click",()=>{editIdx=-1;renderAdmin();});
  renderListaAdm();
}
async function salvarAdm(){
  if(!validarObrigatorios(abaAdm==="cursos"?OBRIG_CURSOS:OBRIG_VAGAS)) return;
  const link=aval("a_link");
  if(link && !urlValida(link)){ alert("O link precisa começar com http:// ou https:// e ser um endereço válido."); return; }
  if(abaAdm==="cursos"){
    const de=aval("a_de"), ate=aval("a_ate");
    if(de && ate && de>ate){
      limparErrosAdm();
      const c=document.getElementById("a_de").closest(".a_campo"); if(c) c.classList.add("erro");
      avisoAdm("A data de abertura das inscrições não pode ser depois da data de encerramento.");
      return;
    }
  }
  let obj, ok;
  if(abaAdm==="cursos"){
    obj={municipio:aval("a_mun"),area:aval("a_area"),curso:aval("a_curso"),instituicao:aval("a_inst"),modalidade:aval("a_mod"),carga:aval("a_carga"),link:link,inscricoes_de:aval("a_de"),inscricoes_ate:aval("a_ate"),status:aval("a_status")||"Aberto",agente:"admin",origem:"painel"};
    ok=obj.curso&&obj.area&&obj.municipio;
  }else{
    obj={municipio:aval("a_mun"),area:aval("a_area"),cargo:aval("a_cargo"),empresa:aval("a_empresa"),tipo_contrato:aval("a_tipo"),modalidade:aval("a_mod")||"",descricao:"",link:link,status:aval("a_status")||"Aberto",agente:"admin",origem:"painel"};
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
        const novoItem = normalizarCursoPlanilha(Object.assign({}, obj, {origem:"painel"}));
        if(!cachePlanilha.cursos) cachePlanilha.cursos = [];
        cachePlanilha.cursos.push(novoItem);
      }else{
        const novoItem = normalizarVagaPlanilha(Object.assign({}, obj, {origem:"painel"}));
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
  if(abaAdm==="cursos" && it.inscricoes_de){
    const di=new Date(it.inscricoes_de+"T00:00:00");
    if(!isNaN(di.getTime()) && di>hoje0()) return '<span class="badge exp">Aguardando abertura</span>';
  }
  if(ate){ const d=new Date(ate); if(!isNaN(d.getTime()) && d<hoje0()) return '<span class="badge exp">Expirado</span>'; }
  return '<span class="badge ok">No ar</span>';
}
function renderListaAdm(){
  const wrap=document.getElementById("admin-lista");
  /* mostra APENAS os itens cadastrados pelo painel (origem=admin) */
  let arr;
  if(abaAdm==="cursos"){
    arr = (cachePlanilha.cursos||[]).filter(c=>c._origem==="painel").map(c=>({curso:c.nome, area:c._area||"", municipio:c._municipio||"", status:c._status||"Aberto", agente:c._agente||"", inscricoes_de:c._de||"", inscricoes_ate:c._ate||"", _raw:c}));
  }else{
    arr = (cachePlanilhaVagas.vagas||[]).filter(v=>v._origem==="painel").map(v=>({cargo:v.cargo, area:v._area||"", municipio:v._municipio||v.cidade||"", status:v._status||"Aberto", agente:v._agente||"", _raw:v}));
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
