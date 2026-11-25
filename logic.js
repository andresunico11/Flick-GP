/**
 * FLICK GP — deterministic impulse-based racing.
 * One human and seven CPU drivers each take exactly one stroke per round.
 * All input is validated server-side. The physics is simulated at fixed steps.
 */
export const meta = { game: "FLICK GP", minPlayers: 1, maxPlayers: 1 };

const TRACKS={
  valley:{
    name:"Valle Verde",theme:"grass",base:"asphalt",lapKm:3.20,
    control:[[250,542],[460,549],[648,555],[815,531],[984,478],[1052,355],[1004,232],[878,171],[709,187],[568,225],[423,193],[260,191],[164,283],[156,409]],
    traps:[[88,237,107,155,-.24],[1109,211,92,123,-.25],[1115,510,100,126,.3],[616,686,139,47,.1]],
    dirt:[]
  },
  coast:{
    name:"Costa Azul",theme:"coast",base:"wet",lapKm:3.55,
    control:[[250,553],[492,563],[745,550],[973,485],[1045,368],[1008,265],[892,222],[797,246],[676,163],[557,223],[414,181],[263,193],[142,295],[140,423]],
    traps:[[86,233,92,123,-.3],[1126,500,104,127,.3],[610,684,135,48,0]],
    dirt:[]
  },
  desert:{
    name:"Desierto Rojo",theme:"desert",base:"asphalt",lapKm:3.80,
    control:[[229,553],[416,554],[581,483],[757,556],[933,517],[1050,394],[965,315],[876,206],[741,184],[634,288],[503,212],[357,182],[203,253],[151,373],[165,492]],
    traps:[[104,245,94,133,-.2],[1133,441,101,133,.2],[646,672,151,46,.1]],
    dirt:[[.13,.33],[.55,.76]]
  },
  alps:{
    name:"Alpes Nevados",theme:"alps",base:"asphalt",lapKm:4.15,
    control:[[240,549],[420,544],[595,484],[797,539],[964,482],[1048,375],[992,265],[854,180],[731,218],[588,163],[446,230],[309,178],[179,286],[171,424]],
    traps:[[77,224,102,134,-.23],[1109,506,107,133,.25],[612,687,126,36,.09]],
    dirt:[],ice:[[.075,.32],[.52,.79]],
    wet:[],wallRadius:107
  },
  city:{
    name:"Midnight City",theme:"city",base:"asphalt",lapKm:3.05,
    control:[[244,552],[478,559],[745,539],[965,528],[1042,441],[1024,309],[953,195],[814,175],[762,258],[615,282],[541,179],[371,179],[251,194],[162,301],[166,437]],
    traps:[[78,203,87,101,-.17],[1131,526,97,113,.2],[602,674,107,38,.15]],
    dirt:[],ice:[],wet:[],wallRadius:91
  },
  jungle:{
    name:"Selva Tropical",theme:"jungle",base:"asphalt",lapKm:3.90,
    control:[[230,558],[437,569],[644,516],[815,562],[1005,500],[1045,375],[967,258],[823,183],[711,225],[590,167],[451,233],[311,186],[177,282],[155,427]],
    traps:[[79,221,96,128,-.20],[1114,513,103,124,.21],[615,679,127,42,.1]],
    dirt:[[.13,.23],[.57,.70]],ice:[],wet:[[.29,.50],[.78,.92]],wallRadius:108
  }
};
function selectedTrack(config){return TRACKS[config?.track]||TRACKS.valley;}
// Weather only depends on the track and round%6, so each forecast is computed once.
const WEATHER=new Map();
function weatherFor(track,round){
  let cycle=WEATHER.get(track);
  if(!cycle)WEATHER.set(track,cycle=[]);
  const slot=((round%6)+6)%6;
  if(!Number.isInteger(round))return forecast(track,round);
  return cycle[slot]||(cycle[slot]=forecast(track,round));
}
function forecast(track,round){
  // Weather is deterministic: every client derives the same forecast from round.
  if(track.theme==="alps")
    return {code:"frost",label:round%6<3?"HELADA":"NIEVE",intensity:.72};
  if(track.theme==="city")
    return {code:"night",label:"NOCHE",intensity:0};
  if(track.theme==="jungle"){
    const intensity=round%6<3?.48:.78;
    return {code:"humid",label:intensity>.7?"CHUBASCOS":"HUMEDAD",intensity};
  }
  if(track.base!=="wet")return {code:track.theme==="desert"?"dry":"sunny",label:track.theme==="desert"?"SECO":"SOLEADO",intensity:0};
  const intensity=round%6<2?.48:round%6<4?.94:.67;
  return {code:"wet",label:intensity>.8?"LLUVIA FUERTE":"LLUVIA",intensity};
}
// Tunable equipment data. Values act on fixed-step movement, never visuals alone.
const OPTIONS = {
  difficulty:["beginner","pro","expert"],
  tire:["soft","medium","hard"],
  wing:["low","medium","high"],
  track:["valley","coast","desert","alps","city","jungle"]
};
const TIRES = {
  soft:{asphalt:.974,wet:.948,dirt:.908,ice:.964,kerb:.941,grass:.895,sand:.817},
  medium:{asphalt:.967,wet:.961,dirt:.932,ice:.974,kerb:.931,grass:.919,sand:.868},
  hard:{asphalt:.960,wet:.954,dirt:.949,ice:.978,kerb:.926,grass:.934,sand:.891}
};
const WINGS = {
  low:{launch:1.075,air:0.001,bounce:1.055},
  medium:{launch:1,air:0,bounce:1},
  high:{launch:.947,air:-.0015,bounce:.82}
};
const DEFAULTS={difficulty:"pro",tire:"medium",wing:"medium",track:"valley"};
const SHOP={
  engine:{label:"Motor",costs:[100,170,270],unlock:0},
  grip:{label:"Suspensión",costs:[90,155,245],unlock:0},
  tires:{label:"Compuesto reforzado",costs:[120,185,275],unlock:2},
  energy:{label:"Recuperador de energía",costs:[115,180,260],unlock:3}
};
function careerFrom(input){
  const c=input&&typeof input==="object"?input:{};
  const upgrades={};
  for(const key of Object.keys(SHOP)){
    const val=c.upgrades?.[key];
    upgrades[key]=Number.isInteger(val)&&val>=0&&val<=3?val:0;
  }
  const races=Number.isInteger(c.races)&&c.races>=0?c.races:0;
  return {
    credits:Number.isInteger(c.credits)&&c.credits>=0?c.credits:160,
    races,wins:Number.isInteger(c.wins)&&c.wins>=0?Math.min(races,c.wins):0,
    upgrades,lastReward:c.lastReward&&typeof c.lastReward==="object"?c.lastReward:null,
    totalKm:Number.isFinite(c.totalKm)&&c.totalKm>=0?+c.totalKm.toFixed(3):0,
    totalImpulses:Number.isInteger(c.totalImpulses)&&c.totalImpulses>=0?c.totalImpulses:0,
    championshipsPlayed:Number.isInteger(c.championshipsPlayed)&&c.championshipsPlayed>=0?c.championshipsPlayed:0,
    championshipsWon:Number.isInteger(c.championshipsWon)&&c.championshipsWon>=0?c.championshipsWon:0,
    lastChampionship:c.lastChampionship&&typeof c.lastChampionship==="object"?c.lastChampionship:null,
    history:Array.isArray(c.history)?c.history.slice(-10):[]
  };
}
function addRaceReward(career,rank,track,round,car){
  const pay=[160,110,80,55,45,35,30,25][Math.max(0,Math.min(7,rank-1))];
  const kilometers=car.distanceKm||0,impulses=car.hits||0;
  return {...career,credits:career.credits+pay,races:career.races+1,
    totalKm:+(career.totalKm+kilometers).toFixed(3),totalImpulses:career.totalImpulses+impulses,
    wins:career.wins+(rank===1?1:0),
    lastReward:{credits:pay,rank,track,round,kilometers,impulses},
    history:[...career.history.slice(-9),{rank,track,round,credits:pay,kilometers,impulses}]};
}

function equipment(input){
  const next={...DEFAULTS};
  for(const key of Object.keys(DEFAULTS)){
    if(input && OPTIONS[key].includes(input[key]))next[key]=input[key];
  }
  return next;
}
const K = 12;
function curve(a,b,c,d,t){
  const t2=t*t,t3=t2*t;
  return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
}
function road(control){
  const out=[];
  for(let i=0;i<control.length;i++){
    const a=control[(i+control.length-1)%control.length];
    const b=control[i];
    const c=control[(i+1)%control.length];
    const d=control[(i+2)%control.length];
    for(let k=0;k<K;k++){
      const t=k/K;
      out.push({x:curve(a[0],b[0],c[0],d[0],t),y:curve(a[1],b[1],c[1],d[1],t)});
    }
  }
  let length=0;
  for(let i=0;i<out.length;i++){
    out[i].s=length;
    const next=out[(i+1)%out.length];
    length+=Math.hypot(next.x-out[i].x,next.y-out[i].y);
  }
  // Signed curvature in radians per track unit. Positive = left-hand corner.
  for(let i=0;i<out.length;i++){
    const a=out[(i-2+out.length)%out.length];
    const b=out[i],c=out[(i+2)%out.length];
    const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
    const turn=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
    out[i].curvature=turn/Math.max(10,(Math.hypot(ux,uy)+Math.hypot(vx,vy))/2);
  }
  return { points:out, length };
}
// Keep geometry and simulation perfectly aligned for every available circuit.
const ROADS=new Map(Object.values(TRACKS).map(track=>[track,road(track.control)]));
function activeRoad(track){return ROADS.get(track)||ROADS.get(TRACKS.valley);}

function sample(s,track){
  const road=activeRoad(track),L=road.length;
  s=((s%L)+L)%L;
  const pts=road.points;
  let i=0;
  while(i<pts.length-1 && pts[i+1].s<s) i++;
  const a=pts[i], b=pts[(i+1)%pts.length];
  const seg=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const t=Math.max(0,Math.min(1,(s-a.s)/seg));
  const tx=(b.x-a.x)/seg,ty=(b.y-a.y)/seg;
  return { x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,tx,ty,nx:-ty,ny:tx };
}
// Closest point on the centre line. This is the hottest function of the game
// (CPU planning calls it ~650k times per round), so each road gets a spatial grid:
// every cell lists, in ascending order, ONLY the segments that can be the nearest
// one for some point inside that cell. The query then runs the exact same
// arithmetic and strict "<" tie-break over that subset, so the result is
// bit-for-bit identical to scanning all segments (see tools/nearest-test.mjs).
// This is safe where two stretches run close together (Desierto Rojo s≈383 vs
// s≈1482): the cell list is built from distance bounds, never from the last index.
const GRID_CELL=24,GRID_MARGIN=260,GRID_EPS=1e-6;
function segmentDistance(x,y,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,seg2=dx*dx+dy*dy;
  const t=seg2>0?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/seg2)):0;
  return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
}
function rectSegmentDistance(x0,y0,x1,y1,a,b){
  // Liang–Barsky: does the segment cross the rectangle at all?
  let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y;
  const clip=(p,q)=>{
    if(p===0)return q>=0;
    const r=q/p;
    if(p<0){if(r>t1)return false;if(r>t0)t0=r;}
    else{if(r<t0)return false;if(r<t1)t1=r;}
    return true;
  };
  if(clip(-dx,a.x-x0)&&clip(dx,x1-a.x)&&clip(-dy,a.y-y0)&&clip(dy,y1-a.y))return 0;
  // Disjoint convex shapes: the gap is between a vertex of one and an edge of the other.
  const toRect=p=>Math.hypot(Math.max(x0-p.x,0,p.x-x1),Math.max(y0-p.y,0,p.y-y1));
  return Math.min(toRect(a),toRect(b),segmentDistance(x0,y0,a,b),segmentDistance(x1,y0,a,b),
    segmentDistance(x0,y1,a,b),segmentDistance(x1,y1,a,b));
}
function buildGrid(road){
  const pts=road.points,n=pts.length;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  minX-=GRID_MARGIN;minY-=GRID_MARGIN;
  const cols=Math.ceil((maxX+GRID_MARGIN-minX)/GRID_CELL),rows=Math.ceil((maxY+GRID_MARGIN-minY)/GRID_CELL);
  const half=GRID_CELL*Math.SQRT1_2;
  const start=new Uint32Array(cols*rows+1),lists=[];
  const lower=new Float64Array(n);
  let total=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const x0=minX+c*GRID_CELL,y0=minY+r*GRID_CELL,cx=x0+GRID_CELL/2,cy=y0+GRID_CELL/2;
    // centre[i]-half is a lower bound of segment i's distance for ANY point of the
    // cell (distance is 1-Lipschitz). Distance to a segment is also convex, so its
    // maximum over the cell sits at a corner: the smallest such maximum ("upper")
    // is a distance the true nearest segment always beats inside this cell.
    let closest=Infinity;
    for(let i=0;i<n;i++){
      lower[i]=segmentDistance(cx,cy,pts[i],pts[(i+1)%n]);
      if(lower[i]<closest)closest=lower[i];
    }
    let upper=closest+half;
    for(let i=0;i<n;i++){
      if(lower[i]>closest+2*half)continue; // its corner maximum cannot be smaller
      const a=pts[i],b=pts[(i+1)%n];
      const far=Math.max(segmentDistance(x0,y0,a,b),segmentDistance(x0+GRID_CELL,y0,a,b),
        segmentDistance(x0,y0+GRID_CELL,a,b),segmentDistance(x0+GRID_CELL,y0+GRID_CELL,a,b));
      if(far<upper)upper=far;
    }
    const limit=upper+GRID_EPS*(1+upper),cell=[];
    for(let i=0;i<n;i++){
      if(lower[i]-half>limit)continue; // quick reject
      // Exact smallest distance between the segment and the cell rectangle.
      if(rectSegmentDistance(x0,y0,x0+GRID_CELL,y0+GRID_CELL,pts[i],pts[(i+1)%n])<=limit)cell.push(i);
    }
    lists.push(cell);total+=cell.length;
    start[r*cols+c+1]=total;
  }
  const index=new Uint16Array(total);
  let k=0;for(const cell of lists)for(const i of cell)index[k++]=i;
  return {minX,minY,cols,rows,start,index};
}
const GRIDS=new Map();
function gridFor(road){
  let grid=GRIDS.get(road);
  if(!grid){grid=buildGrid(road);GRIDS.set(road,grid);}
  return grid;
}
// Reference scan over every segment (the 0.7.4 algorithm). Fallback outside the grid.
function nearestFull(x,y,pts,out){
  let best=Infinity,bi=-1,bt=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    const dx=b.x-a.x,dy=b.y-a.y,seg2=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/seg2));
    const px=a.x+t*dx,py=a.y+t*dy;
    const d2=(x-px)*(x-px)+(y-py)*(y-py);
    if(d2<best){best=d2;bi=i;bt=t;}
  }
  return bi<0?null:fillNearest(pts,bi,bt,best,out);
}
function fillNearest(pts,i,t,d2,out){
  const a=pts[i],b=pts[(i+1)%pts.length];
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy);
  out.d=Math.sqrt(d2);out.s=a.s+t*len;out.x=a.x+t*dx;out.y=a.y+t*dy;
  out.nx=-dy/len;out.ny=dx/len;
  out.curvature=(a.curvature||0)*(1-t)+(b.curvature||0)*t;
  return out;
}
// Writes into `out` (reused by impulse() to avoid one allocation per physics step).
function nearestTo(x,y,road,out){
  const pts=road.points,grid=gridFor(road);
  const c=Math.floor((x-grid.minX)/GRID_CELL),r=Math.floor((y-grid.minY)/GRID_CELL);
  if(!(c>=0&&c<grid.cols&&r>=0&&r<grid.rows))return nearestFull(x,y,pts,out);
  const cell=r*grid.cols+c,end=grid.start[cell+1],index=grid.index,n=pts.length;
  let best=Infinity,bi=-1,bt=0;
  for(let k=grid.start[cell];k<end;k++){
    const i=index[k],a=pts[i],b=pts[(i+1)%n];
    const dx=b.x-a.x,dy=b.y-a.y,seg2=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/seg2));
    const px=a.x+t*dx,py=a.y+t*dy;
    const d2=(x-px)*(x-px)+(y-py)*(y-py);
    if(d2<best){best=d2;bi=i;bt=t;}
  }
  return bi<0?nearestFull(x,y,pts,out):fillNearest(pts,bi,bt,best,out);
}
function nearest(x,y,track){
  return nearestTo(x,y,activeRoad(track),{d:0,s:0,x:0,y:0,nx:0,ny:0,curvature:0});
}
// Same resource model for the human and all CPU opponents.
function energy(car){ return Math.max(0,Math.min(100,Number.isFinite(car.energy)?car.energy:100)); }
function tireHealth(car){ return Math.max(0,Math.min(100,Number.isFinite(car.tireHealth)?car.tireHealth:100)); }
function maxPower(car){
  // An exhausted car can still move; strong shots require rebuilding the reserve.
  return +Math.max(.32,Math.min(1,.32+.68*energy(car)/100)).toFixed(3);
}
function afterShot(car,power,bumps,surface,options,career,curve=0){
  const available=energy(car),condition=tireHealth(car);
  // 100%: net -34 points. 50%: roughly balanced. 30%: recuperates reserve.
  const energyLevel=car.id==="human"?(career?.upgrades?.energy||0):0;
  const cost=(9+32*power*power+5*Math.abs(curve)*(0.6+power))*(1-.105*energyLevel);
  const regeneration=7+16*(1-power)+energyLevel*1.5;
  const nextEnergy=Math.max(0,Math.min(100,available-cost+regeneration));
  const compound=options.tire==="soft"?1.32:options.tire==="hard"?.74:1;
  const terrain=surface==="sand"?1.6:surface==="grass"?1.2:surface==="dirt"?.75:0;
  const tireLevel=car.id==="human"?(career?.upgrades?.tires||0):0;
  const wear=(.50+2.5*power*power+bumps*.85+terrain+1.9*Math.abs(curve)*(.5+power))*compound*(1-.11*tireLevel);
  return {
    energy:+nextEnergy.toFixed(2),
    tireHealth:+Math.max(0,condition-wear).toFixed(2)
  };
}
const PALETTE=["#f6bd3e","#f04e58","#39bae6","#35ce9e","#b68df3","#f49c55","#c5d3e0","#37c6cb"];
const NAMES=["VOS","ROJO","AZUL","VERDE","VIOLETA","NARANJA","PLATA","TURQUESA"];
// Seven rivals have distinct personalities. Their tyres, wings and launch limits
// obey exactly the same physics and energy rules as the human car.
const CPU_PROFILES=[
 {id:"cpu1",style:"ATAQUE",title:"ROJO · EL ATACANTE",tactic:"Arriesga en rectas y persigue adelantamientos",aggression:1.00,risk:.76,energy:.55,precision:.04},
 {id:"cpu2",style:"TRAZADA",title:"AZUL · EL PRECISO",tactic:"Calcula la entrada a curva y prioriza la línea ideal",aggression:.64,risk:1.55,energy:.79,precision:.0},
 {id:"cpu3",style:"AHORRO",title:"VERDE · EL ESTRATEGA",tactic:"Guarda reserva para las últimas curvas",aggression:.48,risk:1.75,energy:1.45,precision:.035},
 {id:"cpu4",style:"ADAPTACIÓN",title:"VIOLETA · EL ADAPTABLE",tactic:"Ajusta el impulso a la superficie y al clima",aggression:.69,risk:1.15,energy:.89,precision:.012},
 {id:"cpu5",style:"ADELANTAR",title:"NARANJA · EL OPORTUNISTA",tactic:"Busca huecos cuando encuentra tráfico",aggression:.98,risk:.87,energy:.77,precision:.018},
 {id:"cpu6",style:"REGULARIDAD",title:"PLATA · EL CONSTANTE",tactic:"Evita choques y mantiene un ritmo equilibrado",aggression:.60,risk:1.48,energy:1.04,precision:.006},
 {id:"cpu7",style:"EFECTO",title:"TURQUESA · EL ESPECIALISTA",tactic:"Aprovecha los efectos curvos para recortar camino",aggression:.86,risk:1.10,energy:.83,precision:.014}
];
function cpuProfile(car){
 return CPU_PROFILES.find(p=>p.id===car.id)||CPU_PROFILES[0];
}
function cpuSetup(track,profile){
 // A different setup per environment. No imaginary tyre or wing bonuses.
 const base={
  grass:{tire:"soft",wing:"medium"},
  coast:{tire:"medium",wing:"high"},
  desert:{tire:"hard",wing:"medium"},
  alps:{tire:"hard",wing:"high"},
  city:{tire:"medium",wing:"high"},
  jungle:{tire:"hard",wing:"high"}
 }[track.theme]||{tire:"medium",wing:"medium"};
 const tire=profile.id==="cpu3"?"hard":
   profile.id==="cpu1"&&track.theme==="grass"?"soft":
   profile.id==="cpu4"&&track.theme==="coast"?"hard":base.tire;
 const wing=profile.id==="cpu1"&&["grass","desert"].includes(track.theme)?"low":
   profile.id==="cpu2"||profile.id==="cpu7"?"high":base.wing;
 return {tire,wing};
}
const LAPS=2;
function lapsOf(car,L){return Math.max(0,Math.min(LAPS,Math.floor((car.progress+0.00001)/L)));}
function raceOrder(a,b){
  const af=a.finishedAt!==null,bf=b.finishedAt!==null;
  if(af!==bf)return af?-1:1;
  if(af&&bf&&a.finishedAt!==b.finishedAt)return a.finishedAt-b.finishedAt;
  if(b.progress!==a.progress)return b.progress-a.progress;
  return 0; // Stable original grid order when progress is exactly tied.
}
export function setup(players, options){
  // Re-entering a race with an existing state carries only the career,
  // while an explicit configure action provides the next track setup.
  const previous=options&&Array.isArray(options.cars)&&options.config?options:null;
  const config=equipment(previous?previous.config:options),track=selectedTrack(config);
  const career=careerFrom(previous?.career);
  // Four cars per row, a second staggered row 75 world-units behind.
  // Distances are signed: back-row cars must first reach the actual start line.
  const lanes=[-51,-17,17,51];
  const cars=Array.from({length:8},(_,i)=>{
    const row=Math.floor(i/4),lane=lanes[i%4],offset=-row*76;
    const start=sample(offset,track);
    return {
      id:i===0?"human":"cpu"+i,name:NAMES[i],color:PALETTE[i],
      x:+(start.x+start.nx*lane).toFixed(2),y:+(start.y+start.ny*lane).toFixed(2),
      angle:Math.atan2(start.ty,start.tx),progress:offset,
      hits:0,finishedAt:null,collisions:0,energy:100,tireHealth:100,
      lapsCompleted:0,lapSplits:[],distanceUnits:0,distanceKm:0,
      powerSum:0,curvedShots:0,
      ...(i===0?{}:{aiStyle:CPU_PROFILES[i-1].style,
        loadout:cpuSetup(track,CPU_PROFILES[i-1])})
    };
  });
  return {human:players[0],cars,config,career,round:0,maxRounds:90,phase:"racing",winner:null,lastMoves:[],laps:LAPS};
}
// Separate three-stroke solo runs for all 8 pilots: no qualifying traffic.
const QUALIFY_SHOTS=3;
function startQualifying(state){
  const track=selectedTrack(equipment(state.config)),start=sample(0,track);
  const cars=state.cars.map(car=>({...car,
    x:+start.x.toFixed(2),y:+start.y.toFixed(2),
    angle:Math.atan2(start.ty,start.tx),progress:0,hits:0,finishedAt:null,
    collisions:0,energy:100,tireHealth:100,lapsCompleted:0,lapSplits:[],
    distanceUnits:0,distanceKm:0,powerSum:0,curvedShots:0}));
  return {...state,cars,phase:"qualifying",round:0,lastMoves:[],
    winner:null,mode:"qualifying",
    qualification:{round:0,total:QUALIFY_SHOTS,results:[],order:[]}};
}
function rankedQualifiers(cars){
  return [...cars].sort((a,b)=>
    b.progress-a.progress || a.collisions-b.collisions || a.id.localeCompare(b.id));
}
function formGrid(cars,config,orderedIds){
  const track=selectedTrack(equipment(config)),lanes=[-51,-17,17,51];
  return cars.map(car=>{
    const slot=orderedIds.indexOf(car.id),row=Math.floor(slot/4),lane=lanes[slot%4];
    const start=sample(-row*76,track);
    return {...car,x:+(start.x+start.nx*lane).toFixed(2),
      y:+(start.y+start.ny*lane).toFixed(2),
      angle:Math.atan2(start.ty,start.tx),progress:-row*76,
      hits:0,finishedAt:null,collisions:0,energy:100,tireHealth:100,
      lapsCompleted:0,lapSplits:[],distanceUnits:0,distanceKm:0,powerSum:0,curvedShots:0};
  });
}
function applyQualifying(state,action){
  const config=equipment(state.config),track=selectedTrack(config);
  const career=careerFrom(state.career),cars=state.cars.map(car=>({...car}));
  const moves=[];
  for(let i=0;i<cars.length;i++){
    const car=cars[i];
    const candidate=i===0?action:cpuShot(car,i,state.round,config.difficulty,[car],track);
    const shot={...candidate,power:Math.min(maxPower(car),candidate.power)};
    const curve=shot.curve??0;
    const result=impulse(car,shot.angle,shot.power,[car],config,track,state.round,true,career,curve);
    cars[i]=result.car;
    moves.push({id:car.id,trace:result.trace,angle:shot.angle,power:shot.power,curve,
      bumps:result.bumps,energy:result.car.energy,tireHealth:result.car.tireHealth,
      risk:result.risk,lapCrossings:result.lapCrossings});
  }
  const round=state.round+1;
  if(round<QUALIFY_SHOTS){
    return {...state,cars,round,lastMoves:moves,
      qualification:{...state.qualification,round}};
  }
  const results=rankedQualifiers(cars).map((car,i)=>({
    id:car.id,name:car.name,color:car.color,position:i+1,
    progress:+car.progress.toFixed(2),collisions:car.collisions,
    hits:car.hits,distanceKm:car.distanceKm
  }));
  const order=results.map(car=>car.id);
  return {...state,cars:formGrid(cars,config,order),phase:"grid",round,
    mode:"qualifying",qualification:{round,total:QUALIFY_SHOTS,results,order},lastMoves:[]};
}
// Championship tables use immutable race results (not temporary positions).
// First season is 3 GPs. Both series are unlocked from day one.
const CUPS={
  classic:{name:"Copa Clásica",tracks:["valley","coast","desert"]},
  extreme:{name:"Copa Extrema",tracks:["alps","city","jungle"]}
};
const GP_POINTS=[12,10,8,6,4,3,2,1];
function seasonTable(champ,cars){
  const entries=cars.map((car,i)=>{
    const id=car.id,events=champ.results.map(r=>r.order.indexOf(id)+1);
    const wins=events.filter(n=>n===1).length;
    const podiums=events.filter(n=>n<=3).length;
    return {id,name:car.name,color:car.color,
      points:champ.points[id]||0,wins,podiums,
      positionSum:events.reduce((sum,n)=>sum+n,0),events};
  });
  entries.sort((a,b)=>b.points-a.points||b.wins-a.wins||
    b.podiums-a.podiums||a.positionSum-b.positionSum||
    a.id.localeCompare(b.id));
  return entries.map((r,i)=>({...r,position:i+1}));
}
function createChampionship(state,cup){
  const series=CUPS[cup],track=series.tracks[0];
  const next=setup([state.human],{...state.config,track});
  next.career=careerFrom(state.career);
  const points=Object.fromEntries(next.cars.map(car=>[car.id,0]));
  const champ={cup,name:series.name,tracks:[...series.tracks],
    index:0,points,results:[],status:"active",bonus:0};
  return {...startQualifying(next),mode:"championship",championship:champ};
}
function nextGrandPrix(state){
  const current=state.championship;
  const index=current.index+1,track=current.tracks[index];
  const newState=setup([state.human],{...state.config,track});
  newState.career=careerFrom(state.career);
  const champ={...current,index,status:"active"};
  return {...startQualifying(newState),mode:"championship",championship:champ};
}
function completeGrandPrix(state,cars,ranked,round,career){
  const c=state.championship;
  const points={...c.points};
  ranked.forEach((r,i)=>{points[r.id]=(points[r.id]||0)+GP_POINTS[i]});
  const order=ranked.map(r=>r.id);
  const result={track:state.config.track,order,round,
    place:order.indexOf("human")+1,
    points:GP_POINTS[order.indexOf("human")],
    km:cars[0].distanceKm,impulses:cars[0].hits};
  const results=[...c.results,result],last=c.index===c.tracks.length-1;
  const base={...c,points,results,status:last?"complete":"between"};
  if(!last)return {championship:base,career};
  const finalTable=seasonTable(base,cars),finalRank=finalTable.findIndex(e=>e.id==="human")+1;
  const champion=finalTable[0].id,bonus=[300,180,120,80,70,60,50,40][finalRank-1];
  return {
    championship:{...base,champion,bonus},
    career:{...career,credits:career.credits+bonus,
      championshipsPlayed:career.championshipsPlayed+1,
      championshipsWon:career.championshipsWon+(champion==="human"?1:0),
      lastChampionship:{cup:c.cup,champion,position:finalRank,points:finalTable.find(e=>e.id==="human").points,bonus}}
  };
}
export function validateAction(state,playerId,action){
  if(playerId!==state.human) return {ok:false,error:"No controlás este auto."};
  if(!action||typeof action!=="object")return {ok:false,error:"Acción inválida."};
  const champ=state.championship;
  const activeChamp=!!champ&&champ.status!=="complete";
  if(action.type==="startChampionship"){
    if(!Object.hasOwn(CUPS,action.cup))return {ok:false,error:"Copa desconocida."};
    return activeChamp?{ok:false,error:"Terminá o abandoná el campeonato actual."}:{ok:true};
  }
  if(action.type==="nextGrandPrix")
    return state.phase==="finished"&&champ?.status==="between"?
      {ok:true}:{ok:false,error:"Todavía no finalizó este Gran Premio."};
  if(action.type==="abandonChampionship")
    return activeChamp?{ok:true}:{ok:false,error:"No hay campeonato en curso."};
  if(action.type==="configureCar"){
    if(!activeChamp||state.round!==0||!["qualifying","racing"].includes(state.phase))
      return {ok:false,error:"Configurá el auto antes del primer impulso del Gran Premio."};
    for(const part of ["difficulty","tire","wing"]){
      if(!OPTIONS[part].includes(action[part]))
        return {ok:false,error:"Configuración inválida: "+part};
    }
    return {ok:true};
  }
  if(activeChamp&&["configure","quickRace","startQualifying"].includes(action.type))
    return {ok:false,error:"El campeonato ya está en marcha. Usá la configuración del auto."};
  if(action.type==="startRace")
    return state.phase==="grid"?{ok:true}:{ok:false,error:"Primero completá la clasificación."};
  if(action.type==="startQualifying")
    return state.phase==="racing"&&state.round===0?{ok:true}:{ok:false,error:"Reiniciá para volver a clasificar."};
  if(action.type==="quickRace")
    return ["qualifying","grid"].includes(state.phase)||state.phase==="racing"&&state.round===0
      ?{ok:true}:{ok:false,error:"La carrera ya comenzó."};
  if(state.phase!=="racing"&&state.phase!=="qualifying")
    return {ok:false,error:"Terminá la clasificación o iniciá la carrera."};
  if(action && action.type==="upgrade"){
    if(!["racing","qualifying"].includes(state.phase)||state.round!==0)
      return {ok:false,error:"Comprá mejoras antes del primer impulso."};
    if(typeof action.upgrade!=="string"||!Object.hasOwn(SHOP,action.upgrade))
      return {ok:false,error:"Componente desconocido."};
    const item=SHOP[action.upgrade],career=careerFrom(state.career);
    if(career.races<item.unlock)return {ok:false,error:"Se desbloquea después de "+item.unlock+" carreras."};
    const level=career.upgrades[action.upgrade];
    if(level>=3)return {ok:false,error:"Componente al máximo nivel."};
    if(career.credits<item.costs[level])return {ok:false,error:"Créditos insuficientes."};
    return {ok:true};
  }
  if(action && action.type==="configure"){
    for(const key of Object.keys(DEFAULTS)){
      if(!OPTIONS[key].includes(action[key]))return {ok:false,error:"Configuración inválida: "+key};
    }
    if(action.raceMode!==undefined && !["qualifying","quick"].includes(action.raceMode))
      return {ok:false,error:"Modo de carrera inválido."};
    return {ok:true};
  }
  if(!action||action.type!=="flick") return {ok:false,error:"Acción inválida."};
  if(typeof action.angle!=="number" || !Number.isFinite(action.angle) || action.angle < -Math.PI || action.angle > Math.PI)
    return {ok:false,error:"Ángulo fuera de rango."};
  if(typeof action.power!=="number" || !Number.isFinite(action.power) || action.power<0.12 || action.power>1)
    return {ok:false,error:"Potencia entre 12% y 100%."};
  if(action.curve!==undefined && (typeof action.curve!=="number"||!Number.isFinite(action.curve)||action.curve< -1||action.curve>1))
    return {ok:false,error:"La curvatura debe estar entre -100% y 100%."};
  const maximum=maxPower(state.cars[0]);
  if(action.power>maximum+.001) return {ok:false,error:"Reserva agotada. Tu potencia máxima es "+Math.round(maximum*100)+"%."};
  return {ok:true};
}
function inSand(x,y,track){
  for(const [cx,cy,rx,ry,a] of track.traps){
    const dx=x-cx,dy=y-cy,xx=dx*Math.cos(a)+dy*Math.sin(a),yy=-dx*Math.sin(a)+dy*Math.cos(a);
    if(xx*xx/(rx*rx)+yy*yy/(ry*ry)<1)return true;
  }
  return false;
}
function surfaceAt(x,y,near,track,road){
  const edge=track.theme==="city"?54:65,off=track.theme==="city"?73:82;
  if(near.d>off)return inSand(x,y,track)?"sand":"grass";
  if(near.d>=edge)return "kerb";
  const ratio=near.s/road.length;
  if(inZone(track.ice,ratio))return "ice";
  if(inZone(track.dirt,ratio))return "dirt";
  if(track.base==="wet"||inZone(track.wet,ratio))return "wet";
  return "asphalt";
}
function inZone(zones,ratio){
  if(!zones)return false;
  for(let i=0;i<zones.length;i++)if(ratio>=zones[i][0]&&ratio<=zones[i][1])return true;
  return false;
}
function impulse(car,angle,power,obstacles,options,track,round,collectTrace=true,career=null,curve=0){
  const selected=car.id==="human"?options:{...DEFAULTS,...car.loadout};
  const road=activeRoad(track),L=road.length;
  const weather=weatherFor(track,round);
  const tire=TIRES[selected.tire]||TIRES.medium,wing=WINGS[selected.wing]||WINGS.medium;
  const engineLevel=car.id==="human"?(career?.upgrades?.engine||0):0;
  const launch=(1.5+power*10.5)*wing.launch*(1+.027*engineLevel);
  let x=car.x,y=car.y, vx=Math.cos(angle)*launch,vy=Math.sin(angle)*launch;
  const near={d:0,s:0,x:0,y:0,nx:0,ny:0,curvature:0}; // reused every step
  let lastS=nearestTo(x,y,road,near).s,progress=car.progress,finishedAt=car.finishedAt;
  let distanceUnits=car.distanceUnits||0;
  // Splits are never mutated, so planning runs (no trace) only need a shallow copy.
  const lapSplits=!Array.isArray(car.lapSplits)?[]:
    collectTrace?car.lapSplits.map(split=>({...split})):car.lapSplits.slice();
  // Loop invariants: same values and same operation order as computing them per step.
  const halfL=L/2,wallRadius=track.wallRadius||110,condition0=tireHealth(car);
  const gripLevel=car.id==="human"?(career?.upgrades?.grip||0):0;
  const gripBase=Math.max(.35,condition0/100)*(selected.tire==="soft"?1.04:selected.tire==="hard"?.93:1)
    *(selected.wing==="high"?1.23:selected.wing==="low"?.82:1);
  const gripUpgrade=1+.085*gripLevel,wetGrip=1-weather.intensity*.33;
  const wearBase=1-condition0/100,rainDrag=weather.intensity*.006,curveDrag=Math.abs(curve)*.0019;
  const curved=Math.abs(curve)>.001;
  let crossedLaps=0;
  let bumps=0,terrain="asphalt",offTrackFrames=0,cornerLoad=0;
  const trace=collectTrace?[[+x.toFixed(2),+y.toFixed(2)]]:null;
  // hypot(vx,vy) from the end of the previous step is reused as this step's speed
  // unless a wall or a car changed the velocity in between (same inputs → same value).
  let lastSpeed=Math.hypot(vx,vy),velocityChanged=false;
  for(let step=0;step<390;step++){
    const previousX=x,previousY=y;
    velocityChanged=false;
    x+=vx; y+=vy;
    nearestTo(x,y,road,near);
    const dsRaw=near.s-lastS;
    let ds=dsRaw;
    if(ds>halfL)ds-=L;
    if(ds< -halfL)ds+=L;
    if(Math.abs(ds)<=32)progress+=ds;
    lastS=near.s;
    if(near.d>wallRadius){
      const nx=(x-near.x)/near.d,ny=(y-near.y)/near.d;
      x=near.x+nx*(wallRadius-1); y=near.y+ny*(wallRadius-1);
      const outward=vx*nx+vy*ny;
      if(outward>0){vx-=1.49*wing.bounce*outward*nx;vy-=1.49*wing.bounce*outward*ny;bumps++;velocityChanged=true;}
    }
    for(let o=0;o<obstacles.length;o++){
      const other=obstacles[o];
      if(other.id===car.id)continue;
      const dx=x-other.x,dy=y-other.y;
      // hypot(dx,dy) >= max(|dx|,|dy|): such pairs can never be within 25.
      if(dx>=25||dx<=-25||dy>=25||dy<=-25)continue;
      const dist=Math.hypot(dx,dy);
      if(dist<25 && dist>0.01){
        const nx=dx/dist,ny=dy/dist;
        x=other.x+nx*25;y=other.y+ny*25;
        const into=vx*nx+vy*ny;
        if(into<0){vx-=1.44*into*nx;vy-=1.44*into*ny;bumps++;velocityChanged=true;}
      }
    }
    // Accumulate actual path length (not ranking progress); detours count.
    distanceUnits+=Math.hypot(x-previousX,y-previousY);
    const completed=Math.max(lapSplits.length,Math.max(0,Math.min(LAPS,Math.floor((progress+0.00001)/L))));
    if(completed>lapSplits.length){
      for(let lap=lapSplits.length+1;lap<=completed;lap++){
        const km=distanceUnits/L*track.lapKm;
        const last=lapSplits[lapSplits.length-1];
        lapSplits.push({lap,hits:car.hits+1,impulses:car.hits+1-(last?.hits||0),
          km:+km.toFixed(3),lapKm:+(km-(last?.km||0)).toFixed(3)});
        crossedLaps++;
        if(lap===LAPS&&finishedAt===null)finishedAt=car.hits+1;
      }
    }
    const surface=surfaceAt(x,y,near,track,road);
    if(surface==="sand")terrain="sand";
    else if(surface==="grass"&&terrain!=="sand")terrain="grass";
    else if(surface==="dirt"&&terrain==="asphalt")terrain="dirt";
    const onRoad=surface==="asphalt"||surface==="wet"||surface==="ice"||surface==="dirt";
    if(!onRoad)offTrackFrames++;
    const speed=velocityChanged?Math.hypot(vx,vy):lastSpeed;
    const signedBend=near.curvature;
    const grip=gripBase
      *(surface==="ice"?.57:surface==="wet"?wetGrip:surface==="dirt"?.79:1)
      *gripUpgrade;
    // Speed-squared understeer: stronger shots push wider on tight bends.
    // Direction and magnitude come from course geometry, not randomness.
    if(near.d<101 && speed>3 && Math.abs(signedBend)>.001){
      const slip=Math.min(.18,Math.abs(signedBend)*speed*speed*.028*(1.55-grip));
      vx-=near.nx*Math.sign(signedBend)*slip;
      vy-=near.ny*Math.sign(signedBend)*slip;
      cornerLoad+=slip;
    }
    // Curved flick: rotate the velocity vector at every physics step.
    // The angle is deterministic, limited by grip and increasingly harder on fast, wet or dirty track.
    // No sideways teleporting: the car keeps momentum and naturally follows an arc.
    if(curved && speed>.14){
      const gripFactor=Math.max(.34,Math.min(1.14,grip));
      const speedFactor=1/(1+Math.max(0,speed-7)*.047);
      const turn=curve*.021*gripFactor*speedFactor;
      const cos=Math.cos(turn),sin=Math.sin(turn);
      const nextVX=vx*cos-vy*sin;
      vy=vx*sin+vy*cos;vx=nextVX;
      cornerLoad+=Math.abs(turn)*.38;
    }
    const wearPenalty=wearBase*(onRoad||surface==="kerb"?.019:.007);
    // A fast ride over kerbs, grass or sand bleeds speed much quicker.
    const surfaceDrag=(surface==="kerb"||surface==="grass"||surface==="sand")
      ?Math.max(0,(speed-5)*.0014*(surface==="sand"?2.2:1.3)):0;
    const rainPenalty=surface==="wet"?rainDrag:0;
    const drag=Math.max(.77,Math.min(.985,tire[surface]+wing.air-wearPenalty-surfaceDrag-rainPenalty-curveDrag));
    vx*=drag;vy*=drag;
    if(collectTrace&&step%3===0)trace.push([+x.toFixed(2),+y.toFixed(2)]);
    lastSpeed=Math.hypot(vx,vy);
    if(lastSpeed<0.14)break;
  }
  if(collectTrace)trace.push([+x.toFixed(2),+y.toFixed(2)]);
  const condition=afterShot(car,power,bumps,terrain,selected,career,curve);
  if(crossedLaps>0)condition.energy=100; // Recharge at the finish line of each lap.
  const risk=bumps>0||offTrackFrames>44?"high":
    offTrackFrames>15||cornerLoad>2.5?"medium":"low";
  if(!collectTrace){
    // Planning run (cpuShot): only the outcome is read, so skip copying the whole car.
    return {car:{...condition,x:+x.toFixed(2),y:+y.toFixed(2),progress:+progress.toFixed(2),
      collisions:car.collisions+bumps,finishedAt,lapsCompleted:lapSplits.length},
      trace,bumps,risk,offTrackFrames,cornerLoad:+cornerLoad.toFixed(2),lapCrossings:crossedLaps};
  }
  return {
    car:{...car,...condition,x:+x.toFixed(2),y:+y.toFixed(2),angle:Math.atan2(vy,vx)||angle,
      progress:+progress.toFixed(2),hits:car.hits+1,collisions:car.collisions+bumps,
      finishedAt,lapsCompleted:lapSplits.length,lapSplits,
      powerSum:+((car.powerSum||0)+power).toFixed(3),
      curvedShots:(car.curvedShots||0)+(Math.abs(curve)>.1?1:0),
      distanceUnits:+distanceUnits.toFixed(3),
      distanceKm:+(distanceUnits/L*track.lapKm).toFixed(3)},
    trace,bumps,risk,offTrackFrames,cornerLoad:+cornerLoad.toFixed(2),
    lapCrossings:crossedLaps
  };
}
function cpuShot(car,index,round,difficulty,obstacles,track){
  const profile=cpuProfile(car);
  const q=nearest(car.x,car.y,track),cap=maxPower(car);
  const level=difficulty==="beginner"?0:difficulty==="expert"?2:1;
  // The aim model seeks not only the closest visible waypoint but several
  // positions ahead: essential when deciding how to enter a hairpin.
  const targets=level===0?[165]:level===1?[150,260]:[145,240,335];
  const offsets=level===0?[-.20,0,.17]:level===1?[-.21,0,.21]:[-.27,-.09,.09,.27];
  const powers=level===0?[.34,.51,.65]:level===1?[.38,.57,.76,.94]:[.4,.61,.80,1];
  const curves=level===0?[0]:level===1?[-.59,0,.59]:[-.85,-.42,0,.42,.85];
  // A modest, deterministic refinement step for expert rivals: not a
  // superhuman physics advantage, just better planning.
  const position=car.progress;
  const percent=Math.max(0,Math.min(2,position/activeRoad(track).length));
  const urgency=percent>1.3?1.18:1;
  const baseAngles=targets.map(dist=>{
    const pt=sample(q.s+dist,track);
    return Math.atan2(pt.y-car.y,pt.x-car.x);
  });
  let candidates=[];
  // Test a bounded search space; no randomness and no unbounded recursion.
  for(const baseAngle of baseAngles){
    for(const offset of offsets){
      const angle=Math.atan2(Math.sin(baseAngle+offset),Math.cos(baseAngle+offset));
      for(const requested of powers){
        const power=Math.max(.12,Math.min(cap,requested));
        for(const curve of curves){
          const move=impulse(car,angle,power,obstacles,DEFAULTS,track,round,false,null,curve);
          const next=move.car;
          const distance=Math.max(-120,next.progress-car.progress);
          const spent=Math.max(0,energy(car)-next.energy);
          const tireUse=Math.max(0,tireHealth(car)-next.tireHealth);
          const wallRisk=move.offTrackFrames,contact=move.bumps;
          // Avoid uncontrolled jumps and stationary bouncing. The overtaker
          // prefers nearby clean lanes, while the saver values low-power pace.
          const danger=(wallRisk*.26+contact*18+Math.max(0,move.cornerLoad-2)*1.5)*profile.risk;
          const reserveWeight=(level===0?1.25:level===1?.67:.43)*profile.energy*(percent<.8?1:.85);
          const reserveCost=spent*reserveWeight;
          const wearCost=tireUse*(level===0?1.7:level===1?.9:.48);
          const pace=distance*urgency*(profile.aggression>.9?1.06:1);
          const slipPenalty=Math.max(0,q.d-65)*.15;
          const curvePreference=profile.id==="cpu7"&&Math.abs(curve)>.1?2.2:0;
          const score=pace-danger-reserveCost-wearCost-slipPenalty+
            curvePreference-Math.abs(curve)*(level===2?.4:1.2);
          candidates.push({angle,power,curve,score,advance:distance,after:next});
        }
      }
    }
  }
  candidates.sort((a,b)=>b.score-a.score || b.advance-a.advance ||
    a.power-b.power || a.curve-b.curve || a.angle-b.angle);
  const best=candidates[0];
  if(!best)return {angle:car.angle,power:Math.min(.5,cap),curve:0};
  // Human-readable imperfections only for Beginner; Pro/Expert evaluate
  // the actual physical outcomes and keep deterministic accuracy.
  const option=level===0?(candidates[Math.min(3,candidates.length-1)]||best):best;
  const wobble=level===0?.09:level===1?profile.precision:.003;
  const correction=Math.sin((round+1)*2.17+index*1.91)*wobble;
  const angle=Math.atan2(Math.sin(option.angle+correction),Math.cos(option.angle+correction));
  return {angle,power:option.power,curve:option.curve};
}
export function applyAction(state,playerId,action){
  if(action.type==="startChampionship")return createChampionship(state,action.cup);
  if(action.type==="nextGrandPrix")return nextGrandPrix(state);
  if(action.type==="abandonChampionship"){
    const restart=setup([state.human],state);
    return startQualifying(restart);
  }
  if(action.type==="configureCar")return {...state,config:{
    ...state.config,difficulty:action.difficulty,tire:action.tire,wing:action.wing
  }};
  if(action.type==="configure"){
    const next={...setup([state.human],action),career:careerFrom(state.career)};
    return action.raceMode==="qualifying"?startQualifying(next):next;
  }
  if(action.type==="startQualifying")return startQualifying(state);
  if(action.type==="quickRace")return {...setup([state.human],state),mode:"quick"};
  if(action.type==="startRace")return {...state,phase:"racing",round:0,lastMoves:[],
    cars:state.cars.map(car=>({...car,energy:100,tireHealth:100,hits:0})),
    winner:null};
  if(action.type==="upgrade"){
    const career=careerFrom(state.career);
    const part=SHOP[action.upgrade],level=career.upgrades[action.upgrade],price=part.costs[level];
    return {...state,career:{...career,credits:career.credits-price,
      upgrades:{...career.upgrades,[action.upgrade]:level+1}}};
  }
  if(state.phase==="qualifying")return applyQualifying(state,action);
  const career=careerFrom(state.career);
  const config=equipment(state.config),track=selectedTrack(config),L=activeRoad(track).length;
  const cars=state.cars.map(c=>({...c}));
  const moves=[];
  for(let i=0;i<cars.length;i++){
    const car=cars[i];
    const recommended=i===0?action:cpuShot(car,i,state.round,config.difficulty,cars,track);
    const shot={...recommended,power:Math.min(maxPower(car),recommended.power)};
    // A finished car has already crossed the line in a previous round;
    // its place stays fixed, while others can finish this equal-strokes round.
    if(car.finishedAt!==null && state.round+1>car.finishedAt){
      moves.push({id:car.id,trace:[[car.x,car.y]],angle:car.angle,power:0,bumps:0,lapCrossings:0});
      continue;
    }
    const curve=shot.curve??0;
    const res=impulse(car,shot.angle,shot.power,cars,config,track,state.round,true,career,curve);
    cars[i]=res.car;
    moves.push({id:car.id,trace:res.trace,angle:shot.angle,power:shot.power,curve,bumps:res.bumps,
      energy:res.car.energy,tireHealth:res.car.tireHealth,
      risk:res.risk,offTrackFrames:res.offTrackFrames,cornerLoad:res.cornerLoad,
      lapCrossings:res.lapCrossings,distanceKm:res.car.distanceKm,lapsCompleted:res.car.lapsCompleted});
  }
  const round=state.round+1;
  const finished=cars.filter(c=>c.finishedAt!==null);
  const over=finished.length>0 || round>=state.maxRounds;
  const ranked=[...cars].sort(raceOrder);
  const rank=ranked.findIndex(c=>c.id==="human")+1;
  let reward=over?addRaceReward(career,rank,config.track,round,cars[0]):career;
  let championship=state.championship||null;
  if(over&&championship?.status==="active"){
    const finish=completeGrandPrix(state,cars,ranked,round,reward);
    championship=finish.championship;
    reward=finish.career;
  }
  return {...state,cars,round,career:reward,championship,
    phase:over?"finished":"racing",winner:over?ranked[0].id:null,lastMoves:moves};
}
export function isGameOver(state){
  // Between GPs the room remains actionable so we can advance without resetting.
  return state.phase==="finished"&&state.championship?.status!=="between"?
    {over:true,winner:state.winner}:{over:false};
}
export function viewFor(state,playerId){
  const track=selectedTrack(equipment(state.config));
  const ordered=state.phase==="qualifying"?rankedQualifiers(state.cars):
    state.phase==="grid"?[...state.cars].sort((a,b)=>
      state.qualification.order.indexOf(a.id)-state.qualification.order.indexOf(b.id)):
      [...state.cars].sort(raceOrder);
  const ranking=ordered.map(c=>({id:c.id,name:c.name,color:c.color,progress:c.progress,
      hits:c.hits,finishedAt:c.finishedAt,lapsCompleted:c.lapsCompleted||0,
      distanceKm:c.distanceKm||0}));
  return {
    cars:state.cars,round:state.round,phase:state.phase,
    mode:state.mode||"quick",qualification:state.qualification||null,
    rivals:state.cars.filter(c=>c.id!=="human").map(c=>({
      id:c.id,name:c.name,color:c.color,
      ...cpuProfile(c),tire:c.loadout?.tire||"medium",wing:c.loadout?.wing||"medium",
      hits:c.hits,avgPower:c.hits?+(100*(c.powerSum||0)/c.hits).toFixed(1):0,
      curvedShots:c.curvedShots||0,collisions:c.collisions,
      distanceKm:c.distanceKm,energy:c.energy,tireHealth:c.tireHealth
    })),
    championship:state.championship?{
      ...state.championship,
      table:seasonTable(state.championship,state.cars),
      nextTrack:state.championship.tracks[state.championship.index+1]||null
    }:null,
    laps:LAPS,lapKm:track.lapKm,totalRaceKm:+(track.lapKm*LAPS).toFixed(2),
    playerLap:Math.min(LAPS,Math.max(1,lapsOf(state.cars[0],activeRoad(track).length)+1)),
    playerKm:state.cars[0].distanceKm||0,playerImpulses:state.cars[0].hits,
    yourTurn:playerId===state.human&&(state.phase==="racing"||state.phase==="qualifying"),
    winner:state.winner,courseLength:+activeRoad(track).length.toFixed(2),
    lastMoves:state.lastMoves,ranking,config:equipment(state.config),
    career:careerFrom(state.career),shop:Object.fromEntries(Object.entries(SHOP).map(([key,item])=>{
      const c=careerFrom(state.career),level=c.upgrades[key];
      return [key,{...item,level,nextCost:item.costs[level]??null,
        unlocked:c.races>=item.unlock,buyable:state.round===0&&["racing","qualifying"].includes(state.phase)&&c.races>=item.unlock&&level<3&&c.credits>=item.costs[level]}];
    })),
    trackName:track.name,weather:weatherFor(track,state.round),
    maxPower:maxPower(state.cars[0])
  };
}
// Internal hooks for tools/ (golden, perf, equivalence tests). Not used by the game.
export const __test={cpuShot,TRACKS,impulse,nearest,activeRoad};
