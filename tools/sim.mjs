// Run one headless race (or a championship) and print the result.
//   node tools/sim.mjs [--track desert] [--difficulty expert]
//   node tools/sim.mjs --cup classic [--difficulty pro]
import {runRace,runChampionship} from "./runner.mjs";

const args=process.argv.slice(2);
const opt=(name,def)=>args.includes("--"+name)?args[args.indexOf("--"+name)+1]:def;
const difficulty=opt("difficulty","pro");
const cup=opt("cup",null);

function table(state){
  const order=[...state.cars].sort((a,b)=>(a.finishedAt??1e9)-(b.finishedAt??1e9)||b.progress-a.progress);
  order.forEach((c,i)=>console.log(
    String(i+1).padStart(2)+".",c.name.padEnd(9),
    (c.finishedAt!==null?"META R"+c.finishedAt:"avance "+c.progress.toFixed(1)).padEnd(14),
    c.distanceKm.toFixed(2)+" km",
    "· choques "+c.collisions));
}
const t0=performance.now();
if(cup){
  const {state,result}=runChampionship({cup,difficulty});
  console.log(state.championship.name,"·",difficulty);
  result.gps.forEach((gp,i)=>console.log(" GP"+(i+1),state.championship.tracks[i].padEnd(7),"ganador",gp.winner,"·",gp.rounds,"rondas"));
  console.log("Puntos:",JSON.stringify(result.points));
  console.log("Campeón:",result.champion,"· bonus",result.bonus,"· créditos",result.credits);
}else{
  const track=opt("track","valley");
  const {state,run}=runRace({track,difficulty});
  console.log(track,"·",difficulty,"·",state.round,"rondas · grilla",state.qualification.order.join(" "));
  table(state);
  const ms=run.raceRoundMs;
  console.log("ms/ronda: media",(ms.reduce((a,b)=>a+b,0)/ms.length).toFixed(1));
}
console.log("Total",((performance.now()-t0)/1000).toFixed(2),"s");
