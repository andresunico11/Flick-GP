// Golden master: full headless races must stay bit-for-bit identical.
//   node tools/golden.mjs           → verify against tools/golden.json (exit 1 on any diff)
//   node tools/golden.mjs --update  → regenerate tools/golden.json
//   node tools/golden.mjs --only race:desert   → run a subset (prefix match)
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {scenarios} from "./runner.mjs";

const file=fileURLToPath(new URL("./golden.json",import.meta.url));
const args=process.argv.slice(2);
const update=args.includes("--update");
const only=args.includes("--only")?args[args.indexOf("--only")+1]:null;

function diff(a,b,path="",out=[]){
  if(out.length>20)return out;
  if(Object.is(a,b))return out;
  if(a&&b&&typeof a==="object"&&typeof b==="object"){
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+"."+k,out);
    return out;
  }
  out.push(path+": esperado "+JSON.stringify(a)+" · obtenido "+JSON.stringify(b));
  return out;
}

const golden=existsSync(file)?JSON.parse(readFileSync(file,"utf8")):null;
if(!update&&!golden){console.error("Falta tools/golden.json. Corré npm run golden:update.");process.exit(1);}
const results={};let failures=0;const t0=performance.now();
for(const sc of scenarios()){
  if(only&&!sc.key.startsWith(only))continue;
  const s=performance.now();
  const {result}=sc.run();
  // Round-trip through JSON so the comparison sees exactly what is stored.
  results[sc.key]=JSON.parse(JSON.stringify(result));
  const ms=(performance.now()-s).toFixed(0);
  if(update){console.log("·",sc.key,ms+" ms");continue;}
  const expected=golden.scenarios[sc.key];
  const problems=expected?diff(expected,results[sc.key]):["escenario nuevo, no está en golden.json"];
  if(problems.length){failures++;console.log("✗",sc.key);problems.forEach(p=>console.log("   ",p));}
  else console.log("✓",sc.key,ms+" ms");
}
const total=((performance.now()-t0)/1000).toFixed(1);
if(update){
  writeFileSync(file,JSON.stringify({note:"Generado por npm run golden:update. Cambios de física o IA requieren justificar la actualización en el PR.",scenarios:results},null,1)+"\n");
  console.log("golden.json actualizado ("+Object.keys(results).length+" escenarios, "+total+" s)");
}else{
  if(!only){
    const missing=Object.keys(golden.scenarios).filter(k=>!(k in results));
    for(const k of missing){failures++;console.log("✗",k,"(no se ejecutó)");}
  }
  console.log(failures?"GOLDEN FALLÓ: "+failures+" escenario(s) con diferencias":"GOLDEN OK: sin diferencias ("+total+" s)");
  process.exit(failures?1:0);
}
