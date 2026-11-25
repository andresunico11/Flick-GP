// Equivalence test: the grid-accelerated nearest() must return EXACTLY what the
// original 0.7.4 full scan returned (same segment, same floats, same tie-break).
import {__test} from "../logic.js";
const {TRACKS,nearest,activeRoad}=__test;

// Verbatim copy of nearest() from FLICK GP 0.7.4.
function nearestV074(x,y,track){
  let best=Infinity, result=null;
  const pts=activeRoad(track).points;
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    const dx=b.x-a.x,dy=b.y-a.y,seg2=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/seg2));
    const px=a.x+t*dx,py=a.y+t*dy;
    const d2=(x-px)*(x-px)+(y-py)*(y-py);
    if(d2<best){
      const len=Math.sqrt(seg2);
      best=d2;
      result={d:Math.sqrt(d2),s:a.s+t*len,x:px,y:py,nx:-dy/len,ny:dx/len,
        curvature:(a.curvature||0)*(1-t)+(b.curvature||0)*t};
    }
  }
  return result;
}
// Deterministic PRNG so failures are reproducible.
let seed=0x5eed1234;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const KEYS=["d","s","x","y","nx","ny","curvature"];
const PER_TRACK=+(process.argv[2]||20000);
let checked=0,bad=0;

function check(name,track,x,y){
  const a=nearestV074(x,y,track),b=nearest(x,y,track);
  checked++;
  for(const k of KEYS)if(!Object.is(a[k],b[k])){
    if(bad++<10)console.log("✗",name,"("+x+","+y+")",k,a[k],"≠",b[k]);
    return;
  }
}
for(const [name,track] of Object.entries(TRACKS)){
  const pts=activeRoad(track).points;
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const minX=Math.min(...xs)-350,maxX=Math.max(...xs)+350,minY=Math.min(...ys)-350,maxY=Math.max(...ys)+350;
  // 1) Uniform over (and beyond) the whole map, including outside the grid.
  for(let i=0;i<PER_TRACK;i++)check(name,track,minX+rand()*(maxX-minX),minY+rand()*(maxY-minY));
  // 2) Where cars actually are: within the walls (≤120 units of the centre line).
  for(let i=0;i<PER_TRACK;i++){
    const p=pts[Math.floor(rand()*pts.length)],q=pts[(pts.indexOf(p)+1)%pts.length],t=rand();
    const ang=rand()*Math.PI*2,r=rand()*120;
    check(name,track,p.x+(q.x-p.x)*t+Math.cos(ang)*r,p.y+(q.y-p.y)*t+Math.sin(ang)*r);
  }
  // 3) Exact vertices, grid-cell corners and the points equidistant from two vertices.
  for(const p of pts)check(name,track,p.x,p.y);
  for(let x=Math.floor(minX/24)*24;x<maxX;x+=24)for(let y=Math.floor(minY/24)*24;y<maxY;y+=48)check(name,track,x,y);
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j+=7){
    check(name,track,(pts[i].x+pts[j].x)/2,(pts[i].y+pts[j].y)/2);
  }
}
// 4) Desierto Rojo: the s≈383 and s≈1482 stretches sit ~199 units apart with 110-unit walls.
{
  const track=TRACKS.desert,pts=activeRoad(track).points;
  const near=s=>pts.reduce((b,p)=>Math.abs(p.s-s)<Math.abs(b.s-s)?p:b);
  const A=near(383),B=near(1482);
  for(let i=0;i<=2000;i++){
    const t=i/2000,jx=(rand()-.5)*60,jy=(rand()-.5)*60;
    check("desert-gap",track,A.x+(B.x-A.x)*t+jx,A.y+(B.y-A.y)*t+jy);
  }
}
console.log(bad?`NEAREST FALLÓ: ${bad} de ${checked} puntos difieren`:`NEAREST OK: ${checked} puntos idénticos a 0.7.4 (${Object.keys(TRACKS).length} pistas)`);
process.exit(bad?1:0);
