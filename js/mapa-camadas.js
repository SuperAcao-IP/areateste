/* =====================================================================
   CAMADAS DO MAPA
   Duas camadas que a pessoa liga e desliga sobre o mapa de cada município:
   1) "Cursos presenciais": unidades de ensino (Senac, Senai e locais de cursos do Trampolim);
      ao clicar, aparecem os cursos dali.
   2) "Computador e internet": bibliotecas (cadastro estadual) e pontos cadastrados à mão pela
      equipe (aba "pontos_digitais" da planilha), com o selo "Tem computador" ou "Só Wi-Fi".

   Dados:
   - dados/unidades.js            UNIDADES               (script semanal: Senac e Senai)
   - dados/pontos-computador.js   PONTOS_COMPUTADOR      (script semanal: bibliotecas)
   - dados/pontos-geocodificados.js  PONTOS_GEOCODIFICADOS (endereço -> lat/lon dos pontos da aba
     que a equipe deixou sem latitude/longitude; calculado pelo script semanal)
   - aba "pontos_digitais" (CSV publicado, PLANILHA_PONTOS_CSV_URL em config.js), lida ao vivo.

   A primeira parte deste arquivo são funções PURAS (sem tela e sem Leaflet): o script semanal
   (scripts/atualizar-mapa.js) as carrega para usar exatamente a mesma regra do navegador.
   ===================================================================== */

/* ---------- funções puras ---------- */
function _nm(s){ return (typeof normTxt === "function" ? normTxt(s) : String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()); }
function _normalizarChave(s){
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/* "Rua das Flores, 123 - Centro" -> {rua, numero, bairro}. Aceita "Av. X 456" e "Rua 7 de Setembro, 100". */
function separarEndereco(texto){
  const t = String(texto || "").trim();
  let m = t.match(/^(.*?),\s*(\d+[A-Za-z]?)\b\s*(?:[-–,]\s*(.*))?$/);
  if(m) return { rua: m[1].trim(), numero: m[2], bairro: (m[3] || "").trim() };
  m = t.match(/^(.*\D)\s+(\d+[A-Za-z]?)\s*(?:[-–,]\s*(.*))?$/);
  if(m) return { rua: m[1].trim().replace(/,$/, ""), numero: m[2], bairro: (m[3] || "").trim() };
  return { rua: t, numero: "", bairro: "" };
}

/* mesma chave do cache de geocodificação do script semanal: "rua, número (só dígitos), cidade" */
function chaveEnderecoPonto(endereco, cidade){
  const e = separarEndereco(endereco);
  return _normalizarChave([e.rua, String(e.numero || "").replace(/\D/g, ""), cidade].filter(Boolean).join(", "));
}

function numeroDecimal(x){
  const n = parseFloat(String(x == null ? "" : x).trim().replace(",", "."));
  return isNaN(n) ? null : n;
}

/* Senai/Senac da planilha -> unidade. Não chuta: onde há mais de uma unidade na cidade e nada
   no texto da instituição desempata (ex.: "SENAC - Faccini"), devolve "ambigua". */
function instituicaoDeUnidade(inst){
  const n = _nm(inst);
  if(/senai/.test(n)) return "Senai";
  if(/senac/.test(n)) return "Senac";
  return null;
}
function vincularCursoAUnidade(inst, municipio, unidades, unidadeTexto){
  const chave = instituicaoDeUnidade(inst);
  if(!chave) return { motivo: "instituicao_sem_unidade" };
  const cand = (unidades || []).filter(u => u.inst === chave && _nm(u.cidade) === _nm(municipio));
  if(cand.length === 1) return { unidade: cand[0] };
  if(cand.length === 0) return { motivo: "sem_unidade_na_cidade" };
  /* desempate: a coluna "unidade" da planilha (ex.: "Dutra") ou o resto do texto da instituição ("SENAC - Faccini") */
  const limpo = x => _nm(x).replace(/sena[ic]/g, " ").replace(/[-–·:]/g, " ").replace(/\s+/g, " ").trim();
  for(const detalhe of [limpo(unidadeTexto || ""), limpo(inst)]){
    if(!detalhe) continue;
    const achou = cand.filter(u => _nm(u.nome + " " + (u.endereco || "")).includes(detalhe));
    if(achou.length === 1) return { unidade: achou[0] };
  }
  return { motivo: "ambigua", candidatos: cand };
}

const PONTOS_TIPOS = {
  telecentro: "Telecentro", biblioteca: "Biblioteca", acessa_sp: "Acessa SP", lan_house: "Lan house", outro: "Outro local"
};
function tipoDePonto(txt){
  const n = _nm(txt).replace(/[^a-z]/g, "_");
  if(/telecentro/.test(n)) return "telecentro";
  if(/biblioteca/.test(n)) return "biblioteca";
  if(/acessa/.test(n)) return "acessa_sp";
  if(/lan/.test(n)) return "lan_house";
  return "outro";
}
function recursosDePonto(txt){
  const n = _nm(txt);
  const wifi = /wi-?fi|internet/.test(n), comp = /computador|pc\b/.test(n);
  if(comp) return { computador: true, wifi };
  if(wifi) return { computador: false, wifi: true };
  return { computador: true, wifi: false };      // vazio: um lugar para usar computador
}

/* ---------- camadas no mapa (navegador) ---------- */
var CAMADAS_ESTADO = { servicos: true, escolas: true, computador: true };   // a escolha da pessoa vale ao trocar de cidade
var CAMADAS_MAPA = { cidade: null, servicos: null, escolas: null, computador: null };
var _pontosPlanilhaCache = null;

function _escM(s){ return (typeof esc === "function") ? esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function _cidadesDoMapa(cidade){
  const lista = [cidade].concat((typeof CIDADES_VIZINHAS !== "undefined" && CIDADES_VIZINHAS[cidade]) || []);
  return new Set(lista.map(_nm));
}

/* cursos presenciais do Trampolim viram "locais": agrupa os que têm o mesmo endereço */
function _locaisDoTrampolim(cursos){
  const grupos = new Map();
  cursos.forEach(c => {
    (c._enderecos || []).forEach(e => {
      const k = e.lat.toFixed(5) + "," + e.lon.toFixed(5);
      if(!grupos.has(k)) grupos.set(k, { id: "tramp-" + k, inst: "Trampolim SP", nome: "Local de curso (Trampolim SP)", endereco: e.texto, cidade: e.cidade, lat: e.lat, lon: e.lon, link: "", cursos: [], psg: false });
      const g = grupos.get(k);
      if(!g.cursos.some(x => _nm(x.n) === _nm(c.nome))) g.cursos.push({ n: c.nome, ch: cargaEmHoras(c.carga), l: c.link || "" });
    });
  });
  return [...grupos.values()];
}

/* junta tudo que vira ponto de "cursos presenciais" para a cidade escolhida */
function unidadesParaMapa(cidade){
  const ok = _cidadesDoMapa(cidade);
  const base = (typeof UNIDADES !== "undefined" ? UNIDADES : []).filter(u => ok.has(_nm(u.cidade))).map(u => Object.assign({}, u, { cursos: (u.cursos || []).slice() }));
  const todosCursos = [];
  Object.values(DADOS_CIDADE || {}).forEach(a => (a.cursos || []).forEach(c => todosCursos.push(c)));
  // cursos da planilha (Senai/Senac) -> unidade, só quando a unidade é única ou o texto desempata
  const todasUnidades = (typeof UNIDADES !== "undefined" ? UNIDADES : []);
  todosCursos.filter(c => c._planilha && /presencial/i.test(c.modalidade || "") && c._municipio).forEach(c => {
    const r = vincularCursoAUnidade(c._inst || c.inst, c._municipio, todasUnidades, c._unidade);
    if(!r.unidade) return;
    const u = base.find(x => x.id === r.unidade.id);
    if(!u) return;
    if(!u.cursos.some(x => _nm(x.n) === _nm(c.nome))) u.cursos.push({ n: c.nome, ch: cargaEmHoras(c.carga), l: c.link || "", planilha: true });
  });
  // locais do Trampolim (endereço vem junto com o curso)
  const locais = _locaisDoTrampolim(todosCursos.filter(c => c._trampolim && /presencial/i.test(c.modalidade || "")))
    .filter(l => ok.has(_nm(l.cidade)));
  return base.concat(locais);
}

async function _lerPontosPlanilha(){
  if(_pontosPlanilhaCache) return _pontosPlanilhaCache;
  if(typeof PLANILHA_PONTOS_CSV_URL === "undefined" || !PLANILHA_PONTOS_CSV_URL) return (_pontosPlanilhaCache = []);
  try{
    const resp = await fetch(PLANILHA_PONTOS_CSV_URL);
    if(!resp.ok) throw new Error("HTTP " + resp.status);
    const rows = csvParaObjetos(await resp.text(), "nome");
    _pontosPlanilhaCache = rows.filter(r => !statusFechado(r.status) && !/inativ/i.test(r.status || ""));
  }catch(e){
    console.warn("[Pontos digitais] aba não carregou:", e);
    _pontosPlanilhaCache = [];
  }
  return _pontosPlanilhaCache;
}

function _pontoDaLinha(r){
  const cidade = r.municipio || "";
  let lat = numeroDecimal(r.lat), lon = numeroDecimal(r.lon);
  if(lat == null || lon == null){
    const g = (typeof PONTOS_GEOCODIFICADOS !== "undefined") ? PONTOS_GEOCODIFICADOS[chaveEnderecoPonto(r.endereco, cidade)] : null;
    if(!g) return null;      // sem coordenada ainda: o script semanal calcula pelo endereço
    lat = g.lat; lon = g.lon;
  }
  const rec = recursosDePonto(r.recursos);
  return {
    id: "manual-" + _normalizarChave(r.nome + cidade), tipo: tipoDePonto(r.tipo), nome: r.nome, endereco: [r.endereco, r.bairro].filter(Boolean).join(" – "), cidade,
    lat, lon, computador: rec.computador, wifi: rec.wifi, horario: r.horario || "", gratuito: r.gratuito || "", telefone: r.telefone || "", obs: r.observacao || "",
    verificado: r.verificado_em || "", fonte: "Cadastro da equipe"
  };
}

async function pontosComputadorParaMapa(cidade){
  const ok = new Set([_nm(cidade)]);   // pontos de computador: só do próprio município
  const estaticos = (typeof PONTOS_COMPUTADOR !== "undefined" ? PONTOS_COMPUTADOR : []).filter(p => ok.has(_nm(p.cidade)));
  const manuais = (await _lerPontosPlanilha()).filter(r => ok.has(_nm(r.municipio))).map(_pontoDaLinha).filter(Boolean);
  return estaticos.concat(manuais);
}

function _popupUnidade(u){
  const cursos = (u.cursos || []);
  const itens = cursos.slice(0, 40).map(c => {
    const nome = _escM(c.n), horas = c.ch ? " · " + c.ch + "h" : "";
    return "<li>" + (c.l ? '<a href="' + _escM(c.l) + '" target="_blank" rel="noopener noreferrer">' + nome + "</a>" : nome) + horas + "</li>";
  }).join("");
  const nota = u.psg && cursos.length ? '<p class="pop-nota">Bolsa (Programa de Gratuidade): renda familiar de até 2 salários mínimos por pessoa. As inscrições abrem 20 dias antes do início.</p>' : "";
  const vazio = cursos.length ? "" : '<p class="pop-nota">Sem cursos com vaga gratuita informada agora. Consulte a unidade.</p>';
  const mais = cursos.length > 40 ? '<p class="pop-nota">… e mais ' + (cursos.length - 40) + " cursos.</p>" : "";
  return '<div class="pop-mapa"><b>' + _escM(u.nome) + "</b><br><span>" + _escM(u.endereco || "") + (u.cidade ? " · " + _escM(u.cidade) : "") + "</span>" +
    (cursos.length ? '<p class="pop-titulo">' + cursos.length + " curso" + (cursos.length > 1 ? "s" : "") + " nesta unidade</p><ul>" + itens + "</ul>" : "") + mais + vazio + nota +
    (u.link ? '<p><a href="' + _escM(u.link) + '" target="_blank" rel="noopener noreferrer">Página da unidade</a></p>' : "") + "</div>";
}
function _popupPonto(p){
  const selo = p.computador ? '<span class="selo selo-pc">Tem computador</span>' : '<span class="selo selo-wifi">Só Wi-Fi</span>';
  const extra = [];
  if(p.horario) extra.push("Horário: " + _escM(p.horario));
  if(p.gratuito) extra.push("Uso gratuito: " + _escM(p.gratuito));
  if(p.telefone) extra.push("Telefone: " + _escM(p.telefone));
  if(p.obs) extra.push(_escM(p.obs));
  const info = p.fonte && p.fonte.indexOf("Cadastro Estadual") === 0
    ? '<p class="pop-nota">Informação do ' + _escM(p.fonte) + (p.ano ? ", respondida em " + _escM(p.ano) : "") + ". Confirme com o local antes de ir.</p>"
    : (p.verificado ? '<p class="pop-nota">Verificado em ' + _escM(p.verificado) + ".</p>" : "");
  return '<div class="pop-mapa"><b>' + _escM(p.nome) + "</b> " + selo + "<br><span>" + _escM(PONTOS_TIPOS[p.tipo] || "Local") + " · " + _escM(p.endereco || "") + "</span>" +
    (extra.length ? "<p>" + extra.join("<br>") + "</p>" : "") + info + "</div>";
}

/* o pop-up nunca pode ser mais largo que o mapa (no celular o mapa tem ~340 px): ajusta a largura e
   empurra o pop-up para longe dos botões de zoom (canto superior esquerdo) */
function _opcoesPopup(mapa){
  // descontados: espaço dos botões de zoom (56), folga à direita (16) e as margens internas do pop-up (~30)
  const largura = Math.max(190, Math.min(320, Math.floor(mapa.getSize().x - 108)));
  return { maxWidth: largura, minWidth: Math.min(200, largura), autoPanPaddingTopLeft: [56, 16], autoPanPaddingBottomRight: [16, 16] };
}
function _iconeEscola(n){
  return L.divIcon({ className: "pino-escola" + (n ? "" : " vazio"), html: "<span>" + (n || "·") + "</span>", iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });
}
function _iconeServico(){
  return L.divIcon({ className: "pino-servico", html: "<span>S</span>", iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -11] });
}
function _iconePonto(p){
  return L.divIcon({ className: "pino-pc " + (p.computador ? "pc" : "wifi"), html: "<span>" + (p.computador ? "PC" : "Wi") + "</span>", iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -11] });
}

function _montarControleCamadas(){
  let el = document.getElementById("mapaCamadas");
  if(!el) return;
  const n = { servicos: CAMADAS_MAPA.nServicos || 0, escolas: CAMADAS_MAPA.nEscolas || 0, computador: CAMADAS_MAPA.nPontos || 0 };
  el.innerHTML =
    '<label class="camada-opcao"><input type="checkbox" data-camada="servicos"' + (CAMADAS_ESTADO.servicos ? " checked" : "") + '> <span class="camada-amostra servico">S</span> Serviços <small>' + n.servicos + "</small></label>" +
    '<label class="camada-opcao"><input type="checkbox" data-camada="escolas"' + (CAMADAS_ESTADO.escolas ? " checked" : "") + '> <span class="camada-amostra escola">1</span> Cursos presenciais (escolas) <small>' + n.escolas + "</small></label>" +
    '<label class="camada-opcao"><input type="checkbox" data-camada="computador"' + (CAMADAS_ESTADO.computador ? " checked" : "") + '> <span class="camada-amostra pc">PC</span> Computador e internet <small>' + n.computador + "</small></label>" +
    '<span class="camada-selos"><span class="selo selo-pc">Tem computador</span> <span class="selo selo-wifi">Só Wi-Fi</span> <span class="selo selo-servico">CRAS, PAT, Sebrae Aqui</span></span>';
  el.querySelectorAll("input[data-camada]").forEach(inp => inp.addEventListener("change", () => {
    CAMADAS_ESTADO[inp.dataset.camada] = inp.checked;
    _aplicarVisibilidade();
  }));
}
function _aplicarVisibilidade(){
  if(!MAP) return;
  ["servicos", "escolas", "computador"].forEach(k => {
    const g = CAMADAS_MAPA[k];
    if(!g) return;
    if(CAMADAS_ESTADO[k]){ if(!MAP.hasLayer(g)) g.addTo(MAP); } else if(MAP.hasLayer(g)) MAP.removeLayer(g);
  });
}

/* chamado quando o mapa é criado e de novo cada vez que chegam cursos novos (Trampolim, planilha...) */
/* um erro nas camadas nunca pode derrubar o resto do portal: só avisa no console */
function atualizarCamadasMapa(){
  return _atualizarCamadasMapa().catch(e => console.warn("[Mapa] camadas:", e));
}
async function _atualizarCamadasMapa(){
  if(typeof MAP === "undefined" || !MAP || !cidadeAtual) return;
  const cidade = cidadeAtual, mapa = MAP;
  const unidades = unidadesParaMapa(cidade);
  const pontos = await pontosComputadorParaMapa(cidade);
  if(mapa !== MAP || cidade !== cidadeAtual) return;       // a pessoa trocou de cidade enquanto carregava
  ["servicos", "escolas", "computador"].forEach(k => { if(CAMADAS_MAPA[k] && mapa.hasLayer(CAMADAS_MAPA[k])) mapa.removeLayer(CAMADAS_MAPA[k]); });
  const gE = L.layerGroup(), gP = L.layerGroup(), gS = L.layerGroup(), limites = [];
  const servicos = ((typeof MAPA !== "undefined" && MAPA[cidade] && MAPA[cidade].cras) || []).filter(p => p.lat != null && p.lon != null);
  servicos.forEach(p => {
    L.marker([p.lat, p.lon], { icon: _iconeServico(), title: p.n }).bindPopup('<div class="pop-mapa"><b>' + _escM(p.n) + '</b><br><span>Serviço de apoio (CRAS, PAT ou Sebrae Aqui)</span></div>', _opcoesPopup(mapa)).addTo(gS);
  });
  unidades.filter(u => u.lat != null && u.lon != null).forEach(u => {
    L.marker([u.lat, u.lon], { icon: _iconeEscola((u.cursos || []).length), title: u.nome }).bindPopup(_popupUnidade(u), _opcoesPopup(mapa)).addTo(gE);
    limites.push([u.lat, u.lon]);
  });
  pontos.forEach(p => {
    L.marker([p.lat, p.lon], { icon: _iconePonto(p), title: p.nome }).bindPopup(_popupPonto(p), _opcoesPopup(mapa)).addTo(gP);
    limites.push([p.lat, p.lon]);
  });
  CAMADAS_MAPA = { cidade, servicos: gS, escolas: gE, computador: gP, nServicos: servicos.length, nEscolas: unidades.length, nPontos: pontos.length };
  _montarControleCamadas();
  _aplicarVisibilidade();
  // enquadra UMA vez por mapa (na primeira vez que há pontos novos); depois não mexe no zoom da pessoa
  if(limites.length && _mapaEnquadrado !== mapa){
    _mapaEnquadrado = mapa;
    try{ mapa.fitBounds(limites.concat(mapaBoundsBase || []), { padding: [40, 40], maxZoom: 14 }); }catch(_){}
  }
}
var mapaBoundsBase = [];
var _mapaEnquadrado = null;
