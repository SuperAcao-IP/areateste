/* Lê do próprio site (sem duplicar listas) os municípios, as cidades vizinhas e o "centro" de cada município
   (dados/municipios.js). Usado para: saber quais unidades interessam e rejeitar coordenadas que caem longe do município. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..", "..");
const lerSite = rel => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function carregarCidades(){
  const ctx = { console: { log(){}, warn(){}, error(){} } };
  vm.createContext(ctx);
  vm.runInContext(lerSite("js/areas.js") + "\n" + lerSite("js/config.js") + "\n" + lerSite("dados/municipios.js") +
    "\nglobalThis.__c = { vizinhas: CIDADES_VIZINHAS, centrosBrutos: CENTROS_MUNICIPIOS, norm: normTxt };", ctx);
  const { vizinhas, centrosBrutos, norm } = ctx.__c;
  const municipios = Object.keys(centrosBrutos);
  const centros = {};
  for(const m of municipios) centros[norm(m)] = { lat: centrosBrutos[m].lat, lon: centrosBrutos[m].lon };
  // cidades que interessam: os municípios do portal + qualquer cidade listada como vizinha de um deles
  const interessam = new Set(municipios.map(norm));
  Object.values(vizinhas).forEach(l => l.forEach(v => interessam.add(norm(v))));
  return { municipios, vizinhas, centros, interessam, norm };
}

/* distância em km entre dois pontos (haversine) */
function km(a, b){
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { carregarCidades, km, RAIZ };
