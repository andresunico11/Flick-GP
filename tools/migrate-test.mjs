// Save migration tests. Fixtures:
//   save-0.7.4.json — written by the real 0.7.4 build (commit 42fb5fa): mid-race, GP 2
//                     of the Copa Clásica, with credits, bought parts and history.
//   save-0.7.3.json — the same save without the fields 0.7.4 added to cars
//                     (aiStyle, loadout, powerSum, curvedShots).
//   save-0.6.json   — older layout (4 cars, 3 laps, no championship) with a career.
import {readFileSync} from "node:fs";
import {deepStrictEqual as same,strictEqual as eq,ok} from "node:assert/strict";
import {migrate,SAVE_VERSION} from "../save.js";
import {validateAction,applyAction,viewFor,VERSION,__test} from "../logic.js";

const load=name=>JSON.parse(readFileSync(new URL("./fixtures/"+name,import.meta.url),"utf8"));
const CAREER_KEYS=["credits","races","wins","upgrades","history","totalKm","totalImpulses",
  "championshipsPlayed","championshipsWon","lastChampionship"];
let passed=0;
function test(name,fn){
  try{fn();passed++;console.log("✓",name);}
  catch(e){console.log("✗",name,"\n   ",e.message.split("\n").slice(0,6).join("\n    "));process.exitCode=1;}
}
function careerKept(before,after){
  for(const k of CAREER_KEYS)if(before[k]!==undefined)same(after[k],before[k],"career."+k);
}
function playOn(state,who,shots=90){
  for(let i=0;i<shots&&state.phase==="racing";i++){
    const shot=__test.cpuShot(state.cars[0],0,state.round,state.config.difficulty,state.cars,__test.TRACKS[state.config.track]);
    const action={type:"flick",angle:shot.angle,power:Math.max(.12,shot.power),curve:shot.curve};
    const verdict=validateAction(state,who,action);
    ok(verdict.ok,verdict.error);
    state=applyAction(state,who,action);
    viewFor(state,who);
  }
  return state;
}

for(const file of ["save-0.7.4.json","save-0.7.3.json"]){
  const saved=load(file),who=saved.human;
  test(file+": la carrera y el campeonato siguen donde estaban",()=>{
    const s=migrate(saved,who);
    eq(s.saveVersion,SAVE_VERSION);eq(s.gameVersion,VERSION);
    eq(s.phase,saved.phase);eq(s.round,saved.round);
    same(s.cars,saved.cars);same(s.championship,saved.championship);same(s.config,saved.config);
    careerKept(saved.career,s.career);
  });
  test(file+": créditos, mejoras e historial intactos",()=>{
    const s=migrate(saved,who);
    eq(s.career.credits,saved.career.credits);
    same(s.career.upgrades,saved.career.upgrades);
    same(s.career.history,saved.career.history);
    ok(saved.career.history.length>0&&saved.career.upgrades.engine>0,"el fixture tiene historial y mejoras");
  });
  test(file+": migrar dos veces no cambia nada",()=>{
    const once=migrate(saved,who);
    same(migrate(JSON.parse(JSON.stringify(once)),who),once);
  });
  test(file+": se puede seguir jugando hasta el final del GP",()=>{
    const s=playOn(migrate(saved,who),who);
    eq(s.phase,"finished");
    eq(s.championship.results.length,saved.championship.results.length+1);
    ok(s.career.credits>saved.career.credits,"cobra el premio del GP");
  });
  test(file+": otro id de jugador no pierde la carrera",()=>{
    const s=migrate(saved,"p-otro");
    eq(s.human,"p-otro");careerKept(saved.career,s.career);
    ok(validateAction(s,"p-otro",{type:"flick",angle:0,power:.5}).ok);
  });
}
test("save-0.6.json: formato viejo → carrera nueva con toda la carrera deportiva",()=>{
  const saved=load("save-0.6.json"),s=migrate(saved,saved.human);
  eq(s.cars.length,8);eq(s.laps,2);eq(s.phase,"racing");eq(s.round,0);
  eq(s.config.track,"desert");eq(s.config.tire,"soft");
  careerKept(saved.career,s.career);
  eq(s.career.credits,735);
});
test("sin save o save inválido → null (arranca de cero)",()=>{
  for(const bad of [null,undefined,42,"x",[],[1,2]])eq(migrate(bad,"p"),null);
});
test("save de una versión futura jugable se respeta",()=>{
  const saved={...load("save-0.7.4.json"),saveVersion:SAVE_VERSION+5};
  const s=migrate(saved,saved.human);
  eq(s.saveVersion,SAVE_VERSION+5);same(s.cars,saved.cars);
});
test("save 0.7.5 recién estampado pasa sin cambios",()=>{
  const v=migrate(load("save-0.7.4.json"),"p0123456789");
  same(migrate(v,"p0123456789"),v);
});
console.log(process.exitCode?"MIGRATE FALLÓ":"MIGRATE OK: "+passed+" pruebas");
