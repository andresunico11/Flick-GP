// Time per race round (all 8 cars, CPUs planning with cpuShot), Expert by default.
//   node tools/perf.mjs [--difficulty expert] [--tracks valley,desert] [--target 40] [--check]
import {runRace,TRACK_IDS} from "./runner.mjs";

const args=process.argv.slice(2);
const opt=(name,def)=>args.includes("--"+name)?args[args.indexOf("--"+name)+1]:def;
const difficulty=opt("difficulty","expert");
const tracks=opt("tracks",TRACK_IDS.join(",")).split(",");
const target=+opt("target",40);

// Warm up the JIT so the first track does not pay compilation time.
runRace({track:"valley",difficulty:"beginner"});
const all=[];
for(const track of tracks){
  const {run}=runRace({track,difficulty});
  const ms=run.raceRoundMs,avg=ms.reduce((a,b)=>a+b,0)/ms.length;
  all.push(...ms);
  console.log(track.padEnd(7),String(ms.length).padStart(3),"rondas · media",avg.toFixed(1).padStart(6),"ms · máx",Math.max(...ms).toFixed(1).padStart(6),"ms");
}
const avg=all.reduce((a,b)=>a+b,0)/all.length;
const sorted=[...all].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];
console.log("—".repeat(52));
console.log(`${difficulty.toUpperCase()}: media ${avg.toFixed(1)} ms/ronda · p95 ${p95.toFixed(1)} ms · meta < ${target} ms → ${avg<target?"OK":"POR ENCIMA"}`);
if(args.includes("--check")&&avg>=target)process.exit(1);
