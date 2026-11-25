// Headless race runner shared by golden / sim / perf.
// Drives logic.js only through its public API (setup / validateAction / applyAction),
// with the human playing the same cpuShot the CPU rivals use.
import {createHash} from "node:crypto";
import {setup,validateAction,applyAction,__test} from "../logic.js";

export const PLAYER="golden";
export const TRACK_IDS=["valley","coast","desert","alps","city","jungle"];
export const DIFFICULTIES=["beginner","pro","expert"];
const {cpuShot,TRACKS}=__test;

// Purely visual fields (names, paint) never feed the physics: they are left out of the
// hash so a cosmetic change can be proven result-neutral with npm run golden.
const COSMETIC=new Set(["name","color","carColor","title"]);
const physical=(key,value)=>COSMETIC.has(key)?undefined:value;
function act(run,state,action){
  const verdict=validateAction(state,PLAYER,action);
  if(!verdict.ok)throw new Error("Acción rechazada ("+action.type+"): "+verdict.error);
  const t0=performance.now();
  const next=applyAction(state,PLAYER,action);
  const ms=performance.now()-t0;
  run.hash.update(JSON.stringify(next,physical));
  run.actions++;
  if(action.type==="flick"&&state.phase==="racing")run.raceRoundMs.push(ms);
  return next;
}
function humanFlick(state){
  const car=state.cars[0],track=TRACKS[state.config.track];
  // Qualifying is a solo run (obstacles = only itself), exactly as the CPUs get it.
  const obstacles=state.phase==="qualifying"?[car]:state.cars;
  const shot=cpuShot(car,0,state.round,state.config.difficulty,obstacles,track);
  return {type:"flick",angle:shot.angle,power:Math.max(.12,shot.power),curve:shot.curve};
}
function newRun(){return {hash:createHash("sha256"),actions:0,raceRoundMs:[]};}
function playGrandPrix(run,state,onRound){
  while(state.phase==="qualifying")state=act(run,state,humanFlick(state));
  if(state.phase!=="grid")throw new Error("Se esperaba la grilla, fase="+state.phase);
  state=act(run,state,{type:"startRace"});
  while(state.phase==="racing"){
    state=act(run,state,humanFlick(state));
    onRound?.(state,run.raceRoundMs[run.raceRoundMs.length-1]);
  }
  return state;
}
export function summarize(state){
  const order=[...state.cars].sort((a,b)=>{
    const af=a.finishedAt!==null,bf=b.finishedAt!==null;
    if(af!==bf)return af?-1:1;
    if(af&&bf&&a.finishedAt!==b.finishedAt)return a.finishedAt-b.finishedAt;
    return b.progress-a.progress;
  }).map(c=>c.id);
  return {
    winner:state.winner,order,rounds:state.round,phase:state.phase,
    grid:state.qualification?.order||null,
    credits:state.career.credits,races:state.career.races,wins:state.career.wins,
    cars:state.cars.map(c=>({id:c.id,progress:c.progress,x:c.x,y:c.y,finishedAt:c.finishedAt,
      hits:c.hits,collisions:c.collisions,energy:c.energy,tireHealth:c.tireHealth,distanceKm:c.distanceKm}))
  };
}
/** One qualifying + race on a track. career lets us exercise the human upgrade paths. */
export function runRace({track,difficulty,career=null,onRound}){
  const run=newRun();
  let state=setup([PLAYER],{track,difficulty,tire:"medium",wing:"medium"});
  if(career)state={...state,career:{...state.career,...career}};
  state=act(run,state,{type:"startQualifying"});
  state=playGrandPrix(run,state,onRound);
  return {state,run,result:{...summarize(state),actions:run.actions,stateHash:run.hash.digest("hex")}};
}
/** A full three-GP championship of one cup. */
export function runChampionship({cup,difficulty,onRound}){
  const run=newRun();
  let state=setup([PLAYER],{track:"valley",difficulty,tire:"medium",wing:"medium"});
  state=act(run,state,{type:"startChampionship",cup});
  const gps=[];
  for(;;){
    state=playGrandPrix(run,state,onRound);
    gps.push(summarize(state));
    if(state.championship.status!=="between")break;
    state=act(run,state,{type:"nextGrandPrix"});
  }
  const c=state.championship;
  return {state,run,result:{
    gps,points:c.points,champion:c.champion,bonus:c.bonus,status:c.status,
    credits:state.career.credits,championshipsPlayed:state.career.championshipsPlayed,
    championshipsWon:state.career.championshipsWon,lastChampionship:state.career.lastChampionship,
    actions:run.actions,stateHash:run.hash.digest("hex")}};
}
/** Every scenario recorded in golden.json, in a fixed order. */
export function scenarios(){
  const list=[];
  for(const track of TRACK_IDS)for(const difficulty of DIFFICULTIES)
    list.push({key:"race:"+track+":"+difficulty,run:()=>runRace({track,difficulty})});
  // Human upgrades (engine/grip/tires/energy) take separate branches in impulse/afterShot.
  for(const track of ["desert","jungle"])
    list.push({key:"race:"+track+":pro:upgraded",run:()=>runRace({track,difficulty:"pro",
      career:{credits:999,races:5,upgrades:{engine:3,grip:2,tires:3,energy:1}}})});
  for(const cup of ["classic","extreme"])
    list.push({key:"championship:"+cup+":pro",run:()=>runChampionship({cup,difficulty:"pro"})});
  return list;
}
