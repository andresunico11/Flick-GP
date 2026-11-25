// Race turn order: the leader shoots first; cars ahead of the player move before the
// player aims; cars behind move after; nobody shoots twice in the same round.
import {strictEqual as eq,ok,deepStrictEqual as same} from "node:assert/strict";
import {setup,applyAction,validateAction,viewFor} from "../logic.js";
const who="p";
let passed=0;
function test(name,fn){try{fn();passed++;console.log("✓",name);}catch(e){console.log("✗",name,"\n   ",e.message);process.exitCode=1;}}
// A real qualifying where the player barely moves, so they start from the back.
function backOfTheGrid(){
  let s=applyAction(setup([who],{track:"valley",difficulty:"pro"}),who,{type:"startQualifying"});
  while(s.phase==="qualifying")s=applyAction(s,who,{type:"flick",angle:0,power:.12,curve:0});
  return s;
}
test("al largar, los autos de adelante ya tiraron y vos todavía no",()=>{
  const grid=backOfTheGrid(),slot=grid.qualification.order.indexOf("human");
  ok(slot>=4,"el jugador larga en la segunda fila (P"+(slot+1)+")");
  let s=applyAction(grid,who,{type:"startRace"});
  const ahead=s.qualification.order.slice(0,slot);
  for(const car of s.cars){
    if(ahead.includes(car.id))eq(car.hits,1,car.id+" debería haber tirado");
    else eq(car.hits,0,car.id+" no debería haber tirado");
  }
  same(s.lastMoves.map(m=>m.id),ahead,"en orden de grilla");
  eq(viewFor(s,who).movedAhead,slot);
  ok(viewFor(s,who).yourTurn);
});
test("tu impulso completa la ronda y abre la siguiente con los de adelante",()=>{
  let s=applyAction(backOfTheGrid(),who,{type:"startRace"});
  const view=viewFor(s,who);
  const action={type:"flick",angle:s.cars[0].angle,power:Math.min(.5,view.maxPower),curve:0};
  ok(validateAction(s,who,action).ok);
  const before=s.moveSeq;
  s=applyAction(s,who,action);
  eq(s.round,1);
  ok(s.moveSeq>before);
  const human=s.cars.find(c=>c.id==="human");
  eq(human.hits,1);
  const ahead=s.turn.order.slice(0,s.turn.order.indexOf("human"));
  for(const car of s.cars)eq(car.hits,ahead.includes(car.id)?2:1,car.id);
  eq(s.lastMoves[0].id,"human","tu tiro es el primero de la tanda");
});
test("carrera rápida: largás primero y tirás antes que todos",()=>{
  let s=applyAction(setup([who],{track:"valley",difficulty:"pro"}),who,{type:"quickRace"});
  ok(s.cars.every(c=>c.hits===0));
  eq(viewFor(s,who).movedAhead,0);
  s=applyAction(s,who,{type:"flick",angle:s.cars[0].angle,power:.5,curve:0});
  eq(s.lastMoves[0].id,"human");
});
test("cada auto tira una sola vez por ronda en toda la carrera",()=>{
  let s=applyAction(backOfTheGrid(),who,{type:"startRace"});
  while(s.phase==="racing"){
    const human=s.cars.find(c=>c.id==="human");
    for(const car of s.cars)if(car.finishedAt===null)ok(car.hits-human.hits<=1&&car.hits>=human.hits,car.id);
    const v=viewFor(s,who);
    s=applyAction(s,who,{type:"flick",angle:human.angle,power:Math.min(.55,v.maxPower),curve:0});
  }
  eq(s.phase,"finished");
});
console.log(process.exitCode?"TURNOS FALLÓ":"TURNOS OK: "+passed+" pruebas");
