/* Confere as regras automáticas contra as decisões que a equipe já tomou à mão.
   Não altera nada. Uso: node scripts/validar-regras.js
   Serve para saber o quanto as regras concordam com as decisões manuais antes de
   confiar nelas para curso novo. */
const fs = require("fs");
const path = require("path");
const { classificar } = require("./lib/regras");

const raiz = path.join(__dirname, "..");
const dec = JSON.parse(fs.readFileSync(path.join(raiz, "dados", "decisoes-catalogos.json"), "utf8"));
let total = 0, iguais = 0;
const divergentes = { "regra mantém, equipe ocultou": [], "regra oculta, equipe manteve": [] };

for(const cat of ["aprendaMais", "evg", "bradesco"]){
  for(const e of Object.values(dec[cat])){
    if(e.o !== "manual") continue;
    total++;
    const r = classificar(e.t);
    if(r.d === e.d) iguais++;
    else divergentes[r.d === "manter" ? "regra mantém, equipe ocultou" : "regra oculta, equipe manteve"].push(`${cat}: ${e.t}  [${r.m}]`);
  }
}
console.log(`Concordância: ${iguais}/${total} (${(100 * iguais / total).toFixed(1)}%)`);
for(const [k, v] of Object.entries(divergentes)){
  console.log(`\n${k} (${v.length}):`);
  v.forEach(x => console.log("  " + x));
}
