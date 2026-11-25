// Save-game format and migrations for the standalone build (used by local.js).
// Rule: a migration may rebuild the race, but NEVER drops credits, bought parts,
// race history or championship totals (all of them live in state.career).
import {setup,VERSION} from "./logic.js";

// 1 = every save written up to 0.7.4 (they had no saveVersion field).
// 2 = 0.7.5: same race state, stamped with saveVersion + gameVersion.
export const SAVE_VERSION=2;
const PHASES=["racing","qualifying","grid","finished"];

function isObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
// A legacy race we can keep playing as-is: 8 cars, 2 laps, a coherent phase.
function resumable(s){
  return Array.isArray(s.cars)&&s.cars.length===8&&s.laps===2&&isObject(s.config)&&
    PHASES.includes(s.phase)&&Number.isInteger(s.round)&&
    s.cars.every(c=>isObject(c)&&typeof c.id==="string"&&
      Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.progress))&&
    (s.phase!=="grid"||Array.isArray(s.qualification?.order));
}
// v1 → v2. 0.7.3/0.7.4 races resume untouched; older layouts (0.6.x: other
// car counts or lap totals) restart the race but carry the full career over.
function fromV1(s){
  if(resumable(s))return s;
  return setup([s.human],{cars:[],config:isObject(s.config)?s.config:{},career:s.career});
}
const STEPS={1:fromV1};

/**
 * Upgrade any stored state to the current SAVE_VERSION.
 * Returns null when there is nothing usable (no save / not an object).
 */
export function migrate(saved,who){
  if(!isObject(saved))return null;
  let version=Number.isInteger(saved.saveVersion)&&saved.saveVersion>0?saved.saveVersion:1;
  // Same browser, same storage: a different player id must not cost the career.
  let state={...saved,human:who};
  while(version<SAVE_VERSION){
    const step=STEPS[version];
    if(!step)break;
    state=step(state);
    version++;
  }
  // A save from a newer build: keep it if it can still be played here.
  if(version>SAVE_VERSION&&!resumable(state))state=fromV1(state);
  return stamp(state);
}
export function stamp(state){
  return {...state,saveVersion:Math.max(SAVE_VERSION,state.saveVersion|0),gameVersion:VERSION};
}
