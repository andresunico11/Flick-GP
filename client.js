const canvas=document.getElementById("race"),ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
const UI={status:$("status"),round:$("round"),standings:$("standings"),instruction:$("instruction"),power:$("power-value"),fill:$("power-fill")};
const id=(()=>{let x=localStorage.getItem("flickgp:id");if(!x){x="p"+Math.random().toString(36).slice(2,12);localStorage.setItem("flickgp:id",x)}return x})();
const room=new URLSearchParams(location.search).get("room")||("solo-"+id);
let socket,retry=0,view=null,anim=null,drag=null,steer=null,curveValue=0,muted=false,audioCtx=null,keyboardAngle=.35,keyboardPower=.65,keyboardCurve=0;
let keyboardAimActive=false,forecastCache=null,forecastKey="";
let W=600,H=500,DPR=1,camera={s:1,x:0,y:0};
let zoomFactor=1,panOffset={x:0,y:0},miniMapEnabled=false;
let navigate={pointers:new Map(),pinch:null};
let selectedCup="classic",openGarageAfterAdvance=false;
const CUP_CATALOG={
 classic:{name:"Copa Clásica",tracks:["valley","coast","desert"]},
 extreme:{name:"Copa Extrema",tracks:["alps","city","jungle"]}
};
function syncViewport(){
  const height=window.visualViewport?.height||window.innerHeight;
  document.documentElement.style.setProperty("--app-h",Math.max(280,Math.round(height))+"px");
}
syncViewport();
window.addEventListener("resize",syncViewport);
window.visualViewport?.addEventListener("resize",syncViewport);
window.addEventListener("orientationchange",syncViewport);
const TRACKS={
 valley:{name:"Valle Verde",theme:"grass",base:"asphalt",number:"01",
  control:[[250,542],[460,549],[648,555],[815,531],[984,478],[1052,355],[1004,232],[878,171],[709,187],[568,225],[423,193],[260,191],[164,283],[156,409]],
  traps:[[88,237,107,155,-.24],[1109,211,92,123,-.25],[1115,510,100,126,.3],[616,686,139,47,.1]],dirt:[]},
 coast:{name:"Costa Azul",theme:"coast",base:"wet",number:"02",
  control:[[250,553],[492,563],[745,550],[973,485],[1045,368],[1008,265],[892,222],[797,246],[676,163],[557,223],[414,181],[263,193],[142,295],[140,423]],
  traps:[[86,233,92,123,-.3],[1126,500,104,127,.3],[610,684,135,48,0]],dirt:[]},
 desert:{name:"Desierto Rojo",theme:"desert",base:"asphalt",number:"03",
  control:[[229,553],[416,554],[581,483],[757,556],[933,517],[1050,394],[965,315],[876,206],[741,184],[634,288],[503,212],[357,182],[203,253],[151,373],[165,492]],
  traps:[[104,245,94,133,-.2],[1133,441,101,133,.2],[646,672,151,46,.1]],dirt:[[.13,.33],[.55,.76]]},
 alps:{name:"Alpes Nevados",theme:"alps",base:"asphalt",number:"04",
  control:[[240,549],[420,544],[595,484],[797,539],[964,482],[1048,375],[992,265],[854,180],[731,218],[588,163],[446,230],[309,178],[179,286],[171,424]],
  traps:[[77,224,102,134,-.23],[1109,506,107,133,.25],[612,687,126,36,.09]],
  dirt:[],ice:[[.075,.32],[.52,.79]],wet:[],wallRadius:107},
 city:{name:"Midnight City",theme:"city",base:"asphalt",number:"05",
  control:[[244,552],[478,559],[745,539],[965,528],[1042,441],[1024,309],[953,195],[814,175],[762,258],[615,282],[541,179],[371,179],[251,194],[162,301],[166,437]],
  traps:[[78,203,87,101,-.17],[1131,526,97,113,.2],[602,674,107,38,.15]],
  dirt:[],ice:[],wet:[],wallRadius:91},
 jungle:{name:"Selva Tropical",theme:"jungle",base:"asphalt",number:"06",
  control:[[230,558],[437,569],[644,516],[815,562],[1005,500],[1045,375],[967,258],[823,183],[711,225],[590,167],[451,233],[311,186],[177,282],[155,427]],
  traps:[[79,221,96,128,-.20],[1114,513,103,124,.21],[615,679,127,42,.1]],
  dirt:[[.13,.23],[.57,.70]],ice:[],wet:[[.29,.50],[.78,.92]],wallRadius:108}
};
const TRACK_INFO={
 valley:"Asfalto seco · buen agarre en curvas. Los blandos aprovechan las rectas.",
 coast:"Asfalto mojado · lluvia variable. Los neumáticos medios ofrecen equilibrio.",
 desert:"Asfalto y tierra · los duros mantienen mejor la velocidad fuera del asfalto.",
 alps:"Hielo y nieve · bajo agarre en sectores helados. Neumáticos duros y control del efecto.",
 city:"Trazado urbano nocturno · muros cercanos, curvas cerradas y escapatorias estrechas.",
 jungle:"Selva húmeda · asfalto mojado, barro y curvas enlazadas. Elegí bien el compuesto."
};
let currentTrack="valley",trackSpec=TRACKS.valley,road=[],roadS=[],roadLength=0,path=new Path2D(),trackCurve=[];
function cat(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)}
function initTrack(trackID){
 currentTrack=TRACKS[trackID]?trackID:"valley";
 trackSpec=TRACKS[currentTrack];
 const P=trackSpec.control;
 road=[];roadS=[];roadLength=0;path=new Path2D();
 for(let i=0;i<P.length;i++){
  const a=P[(i+P.length-1)%P.length],b=P[i],c=P[(i+1)%P.length],d=P[(i+2)%P.length];
  for(let k=0;k<12;k++){
   const t=k/12;road.push([cat(a[0],b[0],c[0],d[0],t),cat(a[1],b[1],c[1],d[1],t)]);
  }
 }
 road.forEach((pt,i)=>{
  if(i)path.lineTo(pt[0],pt[1]);else path.moveTo(pt[0],pt[1]);
  roadS.push(roadLength);
  const next=road[(i+1)%road.length];
  roadLength+=Math.hypot(next[0]-pt[0],next[1]-pt[1]);
 });
 path.closePath();
 trackCurve=road.map((b,i)=>{
  const a=road[(i-2+road.length)%road.length],c=road[(i+2)%road.length];
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
  return Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy)/Math.max(10,(Math.hypot(ux,uy)+Math.hypot(vx,vy))/2);
 });
 forecastCache=null;forecastKey="";
 buildWorld();
}
function weatherPreview(){
 const round=view?.round||0;
 if(currentTrack==="alps")return {intensity:.72,label:round%6<3?"HELADA":"NIEVE"};
 if(currentTrack==="city")return {intensity:0,label:"NOCHE"};
 if(currentTrack==="jungle"){
  const intensity=round%6<3?.48:.78;
  return {intensity,label:intensity>.7?"CHUBASCOS":"HUMEDAD"};
 }
 if(currentTrack!=="coast")return {intensity:0,label:currentTrack==="desert"?"SECO":"SOLEADO"};
 const intensity=round%6<2?.48:round%6<4?.94:.67;
 return {intensity,label:intensity>.8?"LLUVIA FUERTE":"LLUVIA"};
}
function nearestPreview(x,y){
 let best=Infinity,info=null;
 for(let i=0;i<road.length;i++){
  const a=road[i],b=road[(i+1)%road.length];
  const dx=b[0]-a[0],dy=b[1]-a[1],d2=dx*dx+dy*dy;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/d2));
  const px=a[0]+dx*t,py=a[1]+dy*t;
  const dist2=(x-px)**2+(y-py)**2;
  if(dist2<best){
   best=dist2;const len=Math.sqrt(d2);
   info={d:Math.sqrt(best),s:roadS[i]+t*len,nx:-dy/len,ny:dx/len,
     curvature:trackCurve[i]*(1-t)+trackCurve[(i+1)%road.length]*t};
  }
 }
 return info;
}
const previewGrip={
 soft:{asphalt:.974,wet:.948,dirt:.908,ice:.964,kerb:.941,grass:.895,sand:.817},
 medium:{asphalt:.967,wet:.961,dirt:.932,ice:.974,kerb:.931,grass:.919,sand:.868},
 hard:{asphalt:.960,wet:.954,dirt:.949,ice:.978,kerb:.926,grass:.934,sand:.891}
};
function previewSand(x,y){
 for(const [cx,cy,rx,ry,a] of trackSpec.traps){
  const dx=x-cx,dy=y-cy,xx=dx*Math.cos(a)+dy*Math.sin(a),yy=-dx*Math.sin(a)+dy*Math.cos(a);
  if(xx*xx/(rx*rx)+yy*yy/(ry*ry)<1)return true;
 }
 return false;
}
function predictPath(car,angle,power,curve=0){
 const config=view?.config||{difficulty:"pro",tire:"medium",wing:"medium",track:"valley"};
 const settings=previewGrip[config.tire]||previewGrip.medium;
 const wing=config.wing==="low"?{launch:1.075,air:.001}:config.wing==="high"?{launch:.947,air:-.0015}:{launch:1,air:0};
 const engine=view?.career?.upgrades?.engine||0;
 const start=(1.5+power*10.5)*wing.launch*(1+.027*engine);
 let x=car.x,y=car.y,vx=Math.cos(angle)*start,vy=Math.sin(angle)*start;
 const pathPoints=[{x,y,level:0}];let highest=0,sharp=0,collisionAhead=false;
 const wear=Math.max(.35,(car.tireHealth??100)/100);
 const grip=wear*(config.tire==="soft"?1.04:config.tire==="hard"?.93:1)
  *(config.wing==="high"?1.23:config.wing==="low"?.82:1)
  *(1+.085*(view?.career?.upgrades?.grip||0));
 const steps=config.difficulty==="beginner"?95:config.difficulty==="expert"?49:72;
 for(let step=0;step<steps;step++){
  x+=vx;y+=vy;const near=nearestPreview(x,y);
  const ratio=near.s/roadLength;
  const edge=currentTrack==="city"?54:65,off=currentTrack==="city"?73:82;
  const surface=near.d>off?(previewSand(x,y)?"sand":"grass"):near.d>=edge?"kerb":
    trackSpec.ice?.some(([a,b])=>ratio>=a&&ratio<=b)?"ice":
    trackSpec.dirt?.some(([a,b])=>ratio>=a&&ratio<=b)?"dirt":
    trackSpec.base==="wet"||trackSpec.wet?.some(([a,b])=>ratio>=a&&ratio<=b)?"wet":"asphalt";
  const speed=Math.hypot(vx,vy);
  if(near.d<101 && speed>3 && Math.abs(near.curvature)>.001){
   const localGrip=grip*(surface==="ice"?.57:surface==="wet"?1-weatherPreview().intensity*.33:surface==="dirt"?.79:1);
   const slip=Math.min(.18,Math.abs(near.curvature)*speed*speed*.028*(1.55-localGrip));
   vx-=near.nx*Math.sign(near.curvature)*slip;
   vy-=near.ny*Math.sign(near.curvature)*slip;
   sharp+=slip;
  }
  let level=near.d>=101?2:surface==="grass"||surface==="sand"?2:
   surface==="kerb"||surface==="wet"&&speed>8||surface==="dirt"&&speed>7||
    Math.abs(near.curvature)*speed*speed>.9?1:0;
  if(view?.phase!=="qualifying"&&view?.cars?.slice(1).some(other=>Math.hypot(x-other.x,y-other.y)<29)){
    collisionAhead=true;level=2;
  }
  highest=Math.max(highest,level);
  if(Math.abs(curve)>.001&&speed>.14){
    const localGrip=grip*(surface==="ice"?.57:surface==="wet"?1-weatherPreview().intensity*.33:surface==="dirt"?.79:1);
    const turn=curve*.021*Math.max(.34,Math.min(1.14,localGrip))/
      (1+Math.max(0,speed-7)*.047);
    const cos=Math.cos(turn),sin=Math.sin(turn);
    const nextVX=vx*cos-vy*sin;
    vy=vx*sin+vy*cos;vx=nextVX;
  }
  const wearPenalty=(1-wear)*(["asphalt","wet","ice","dirt","kerb"].includes(surface)?.019:.007);
  const surfaceDrag=(surface==="kerb"||surface==="grass"||surface==="sand")
   ?Math.max(0,(speed-5)*.0014*(surface==="sand"?2.2:1.3)):0;
  const rainPenalty=surface==="wet"?weatherPreview().intensity*.006:0;
  const drag=Math.max(.77,Math.min(.985,settings[surface]+wing.air-wearPenalty-surfaceDrag-rainPenalty-Math.abs(curve)*.0019));
  vx*=drag;vy*=drag;
  if(step%3===0)pathPoints.push({x,y,level});
  if(near.d>(trackSpec.wallRadius||110)-2||Math.hypot(vx,vy)<.2)break;
 }
 return {points:pathPoints,risk:highest,label:highest===2?"ALTO":highest===1?"MEDIO":"BAJO",
  note:collisionAhead?"¡Rival en la trayectoria!":highest===2?"Posible salida de pista":highest===1?"Cuidado con el piano":"Trayectoria controlada"};
}

function rnd(x,y){let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
const base=document.createElement("canvas");base.width=1200;base.height=720;
function buildWorld(){
 const c=base.getContext("2d");
 c.clearRect(0,0,1200,720);
 const theme=trackSpec.theme;
 const palette=theme==="desert"
  ?{a:"#c58e61",b:"#a96140",dark:"#734b3a",sand:"#deb587",sandLine:"#c59867",road:"#706865",text:"#77523c"}
  :theme==="coast"
  ?{a:"#6b9d9a",b:"#476e78",dark:"#2d5d63",sand:"#eadaba",sandLine:"#d2c19c",road:"#536770",text:"#3c666f"}
  :theme==="alps"
  ?{a:"#b7d6db",b:"#658da9",dark:"#40677b",sand:"#e5f5f8",sandLine:"#b8dce6",road:"#667e8d",text:"#345d77"}
  :theme==="city"
  ?{a:"#15253f",b:"#101128",dark:"#1b3358",sand:"#334761",sandLine:"#506b87",road:"#424d66",text:"#748dbe"}
  :theme==="jungle"
  ?{a:"#478364",b:"#15433c",dark:"#163d32",sand:"#a0a77e",sandLine:"#5b8063",road:"#546d68",text:"#366b50"}
  :{a:"#689b60",b:"#427546",dark:"#234837",sand:"#e5d1a8",sandLine:"#c5b28b",road:"#626b6f",text:"#235c38"};
 let grad=c.createLinearGradient(0,0,920,720);
 grad.addColorStop(0,palette.a);grad.addColorStop(1,palette.b);
 c.fillStyle=grad;c.fillRect(0,0,1200,720);
 if(theme==="coast"){
  c.fillStyle="#2e6773";c.fillRect(0,0,1200,113);
  for(let i=0;i<40;i++){
   const x=(i*131+11)%1200,y=14+i*7%89;
   c.strokeStyle=i%2?"#a1d4ca55":"#d1e6e35c";c.lineWidth=2;c.beginPath();
   c.moveTo(x,y);c.quadraticCurveTo(x+11,y-3,x+27,y+1);c.stroke();
  }
 }
 // Track-specific scenery. Only draw outside the road to preserve visibility.
 if(theme==="alps"){
  for(let i=0;i<28;i++){
   const x=30+i*47,y=i%2===0?35:670;
   if(nearestPreview(x,y).d<108)continue;
   const height=33+rnd(i,4)*49;
   c.fillStyle="#43768e63";c.beginPath();
   c.moveTo(x-44,y+31);c.lineTo(x,y-height);c.lineTo(x+47,y+31);c.closePath();c.fill();
   c.fillStyle="#f5ffffb9";c.beginPath();
   c.moveTo(x-14,y-height+26);c.lineTo(x,y-height);c.lineTo(x+15,y-height+25);
   c.lineTo(x+4,y-height+19);c.lineTo(x,y-height+23);c.closePath();c.fill();
  }
 }
 if(theme==="city"){
   // Illuminated rooftops and neon street blocks, kept clear of the circuit.
   for(let y=44;y<690;y+=94)for(let x=45;x<1190;x+=119){
     if(nearestPreview(x+36,y+27).d<160)continue;
     const r=rnd(x,y);
     c.fillStyle="#050c1bbb";c.fillRect(x+6,y+9,72,55);
     c.fillStyle=r>.5?"#273a5b":"#253052";c.fillRect(x,y,72,55);
     c.strokeStyle=r>.5?"#7fe5ec70":"#ef75db77";c.lineWidth=2;c.strokeRect(x,y,72,55);
     c.fillStyle="#0b1932";c.fillRect(x+12,y+8,48,38);
     for(let u=0;u<4;u++)for(let v=0;v<3;v++){
       if(rnd(x+u,y+v)>.27){c.fillStyle=(u+v)%2?"#5bcdf08c":"#ee7bbe8c";c.fillRect(x+17+u*11,y+12+v*10,6,5)}
     }
   }
 }
 if(theme==="jungle"){
   for(let i=0;i<145;i++){
     const x=(i*97+52)%1200,y=(i*139+47)%720;
     if(nearestPreview(x,y).d<118)continue;
     const r=8+rnd(x,y)*19;
     c.fillStyle="#0b302b77";c.beginPath();c.ellipse(x+5,y+5,r*1.15,r*.8,0,0,Math.PI*2);c.fill();
     for(let k=0;k<5;k++){
       const a=k*1.256;
       c.fillStyle=["#1b6e47","#237b4e","#3d9853","#165e44","#6ea95c"][k];
       c.beginPath();c.arc(x+Math.cos(a)*r*.38,y+Math.sin(a)*r*.38,r*.51,0,Math.PI*2);c.fill();
     }
   }
 }
 for(let y=0;y<720;y+=15)for(let x=0;x<1200;x+=15){
  const n=rnd(x,y);
  c.fillStyle=theme==="desert"?(n>.5?"#edbf8a22":"#784d2b19"):
   theme==="coast"?(n>.5?"#d0efdd14":"#0c364d18"):
   theme==="alps"?(n>.5?"#ffffff23":"#447d9b22"):
   theme==="city"?(n>.5?"#5775a31e":"#0b122b15"):
   theme==="jungle"?(n>.5?"#78ba7619":"#0d392322"):(n>.5?"#c4df9519":"#163f3514");
  c.fillRect(x+n*3,y+2,10,8);
  if(n>.91){c.fillStyle=theme==="desert"?"#e8c39d55":"#d1e59d55";c.fillRect(x+3,y,2,3)}
 }
 function sand(x,y,rx,ry,ang){
  c.save();c.translate(x,y);c.rotate(ang);
  c.fillStyle=theme==="desert"?"#ad714c":theme==="city"?"#111d36":theme==="jungle"?"#173d31":"#b5a080";
  c.beginPath();c.ellipse(0,0,rx+7,ry+7,0,0,Math.PI*2);c.fill();
  c.fillStyle=palette.sand;c.beginPath();c.ellipse(0,0,rx,ry,0,0,Math.PI*2);c.fill();
  c.strokeStyle=palette.sandLine;c.lineWidth=1.6;
  for(let yy=-ry+12;yy<ry-12;yy+=13){
   c.beginPath();
   for(let xx=-rx+8;xx<rx-8;xx+=9){
    if(xx*xx/(rx*rx)+yy*yy/(ry*ry)>.87)continue;
    const y2=yy+Math.sin(xx/18)*2;
    if(xx===-rx+8)c.moveTo(xx,y2);else c.lineTo(xx,y2);
   }c.stroke();
  }
  c.restore();
 }
 for(const trap of trackSpec.traps)sand(...trap);
 // Barriers and kerbs reflect the real-world width (City has a narrow street).
 const city=theme==="city";
 const kerb=city?143:155,roadWidth=city?107:131;
 c.save();c.shadowColor="#0e283899";c.shadowBlur=18;c.shadowOffsetY=9;
 c.strokeStyle=palette.dark;c.lineWidth=city?178:191;
 c.lineCap="round";c.lineJoin="round";c.stroke(path);c.restore();
 c.lineCap="round";c.lineJoin="round";
 const strokes=city?[["#1b223c",168],["#60bed8",158],["#364564",152],["#dfddfa",144]]:
   theme==="alps"?[["#4d7483",181],["#e8f5f7",175],["#6b9fac",169],["#ffffff",155]]:
   [["#505d5d",181],["#c2c8c2",175],["#646f70",169],["#f5f5eb",155]];
 for(const [color,width] of strokes){c.strokeStyle=color;c.lineWidth=width;c.stroke(path)}
 c.setLineDash([23,23]);c.lineWidth=kerb;
 c.strokeStyle=city?"#de83d6":theme==="alps"?"#4ec5e5":theme==="desert"?"#d78539":"#f4a03e";
 c.stroke(path);c.setLineDash([]);
 c.strokeStyle=city?"#303b5c":"#535f63";c.lineWidth=city?119:137;c.stroke(path);
 c.strokeStyle=palette.road;c.lineWidth=roadWidth;c.stroke(path);
 // Sector-specific markings match the physics (ice, mud, rain).
 if(theme==="desert"||theme==="jungle"||theme==="alps"){
  c.lineCap="butt";
  for(let i=0;i<road.length;i++){
   const ratio=roadS[i]/roadLength;
   const icy=trackSpec.ice?.some(([a,b])=>ratio>=a&&ratio<=b);
   const muddy=trackSpec.dirt?.some(([a,b])=>ratio>=a&&ratio<=b);
   const wet=trackSpec.wet?.some(([a,b])=>ratio>=a&&ratio<=b);
   if(!icy&&!muddy&&!wet)continue;
   const a=road[i],b=road[(i+1)%road.length];
   c.strokeStyle=icy?"#a7d4e8":muddy?"#976c4b":"#3a7277";
   c.lineWidth=roadWidth+2;c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();
   c.strokeStyle=icy?"#e3ffff55":muddy?"#c68f6455":"#81d5c433";
   c.lineWidth=roadWidth-24;c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();
  }
  c.lineCap="round";
 }
 if(theme==="coast"||theme==="jungle"){
  c.strokeStyle="#a3d7e529";c.lineWidth=53;c.setLineDash([16,32]);c.stroke(path);c.setLineDash([]);
  c.strokeStyle="#cae8f21b";c.lineWidth=93;c.stroke(path);
 }else if(theme==="alps"){
  c.strokeStyle="#eefbff45";c.lineWidth=44;c.setLineDash([10,30]);c.stroke(path);c.setLineDash([]);
 }else if(city){
  c.strokeStyle="#8bcef42e";c.lineWidth=2;c.setLineDash([14,19]);c.stroke(path);c.setLineDash([]);
 }
 c.strokeStyle="#e3e5da9b";c.lineWidth=2;c.stroke(path);
 c.strokeStyle="#ffffff1b";c.lineWidth=1.4;c.setLineDash([7,27]);c.stroke(path);c.setLineDash([]);
 // Grandstand for scale.
 c.save();c.translate(614,67);c.rotate(-.06);c.fillStyle="#203e469c";c.fillRect(-159,-29,318,64);
 c.fillStyle="#bac9c6";c.fillRect(-156,-32,312,51);
 for(let row=0;row<5;row++)for(let i=0;i<46;i++){
  const cols=["#eef0de","#a44c47","#2e4349","#d4ad6c"];
  c.fillStyle=cols[Math.floor(rnd(i,row)*cols.length)];c.fillRect(-149+i*6.5,-26+row*9,4.8,6);
 }c.restore();
 function tree(x,y,r){
  c.fillStyle="#163b2b66";c.beginPath();c.ellipse(x+8,y+8,r*1.1,r*.92,0,0,Math.PI*2);c.fill();
  for(let i=0;i<14;i++){
   const a=i*2.4,t=r*(.25+rnd(i,x)*.5);
   c.fillStyle=i%3?"#2b7a43":"#5c9b4e";c.beginPath();c.arc(x+Math.cos(a)*t,y+Math.sin(a)*t,r*.38,0,Math.PI*2);c.fill();
  }
 }
 function rock(x,y,r){
  c.fillStyle="#724834a0";c.beginPath();c.ellipse(x+5,y+6,r*1.04,r*.77,0,0,Math.PI*2);c.fill();
  c.fillStyle="#d4a67c";c.beginPath();c.moveTo(x-r,y+r*.1);c.lineTo(x-r*.25,y-r*.83);
  c.lineTo(x+r*.7,y-r*.4);c.lineTo(x+r,y+r*.43);c.lineTo(x-r*.1,y+r*.76);c.closePath();c.fill();
 }
 if(theme==="desert"){
  for(const [x,y,r] of [[60,608,26],[1117,613,23],[690,687,18],[85,70,20],[1170,70,17]])rock(x,y,r);
 }else if(theme==="alps"){
   for(const [x,y,r] of [[67,620,31],[1144,617,27],[601,685,32],[782,76,26]]){
     c.fillStyle="#2f6b79";c.beginPath();c.moveTo(x-r,y+r);c.lineTo(x,y-r*1.7);c.lineTo(x+r,y+r);c.closePath();c.fill();
     c.fillStyle="#f3ffff";c.beginPath();c.moveTo(x-r*.45,y-r*.55);c.lineTo(x,y-r*1.7);c.lineTo(x+r*.45,y-r*.55);c.closePath();c.fill();
   }
 }else if(theme!=="city"){
  tree(61,618,33);tree(1144,616,33);tree(596,688,30);tree(779,85,28);
 }
 if(theme==="coast"){
  c.fillStyle="#ffffff66";c.fillRect(1100,67,83,4);
  c.fillStyle="#fff5d4b3";c.fillRect(1110,72,8,16);
 }
 c.save();c.translate(590,355);c.textAlign="center";
 c.font="900 italic 55px system-ui";c.fillStyle=palette.text+"99";c.fillText("FLICK",0,-8);
 c.font="900 italic 30px system-ui";c.fillText("GP  ·  "+trackSpec.name.toUpperCase(),0,29);
 c.restore();
 // Finish line is always aligned to the new circuit's initial tangent.
 const a=road[0],b=road[1],ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
 c.save();c.translate(a[0],a[1]);c.rotate(ang);
 for(let j=0;j<8;j++)for(let k=0;k<3;k++){
  c.fillStyle=(j+k)%2?"#192127":"#f6f4e9";c.fillRect(-7+k*5,-64+j*16,5,16)
 }c.restore();
}
initTrack("valley");

function resize(){
 const r=canvas.getBoundingClientRect();W=r.width;H=r.height;DPR=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.max(1,Math.round(W*DPR));canvas.height=Math.max(1,Math.round(H*DPR));
}
new ResizeObserver(resize).observe(canvas);resize();
function cameraFor(car){
 const mobile=window.innerWidth<=940;
 const baseScale=mobile?(W>=700?Math.max(.78,Math.min(1.04,H/430)):Math.min(1.04,Math.max(.78,W/435))):Math.min(W/1200,H/720);
 const s=baseScale*zoomFactor;
 const ww=W/s,hh=H/s;
 const centerX=mobile&&car?car.x:600,centerY=mobile&&car?car.y:360;
 const cx=ww>=1200?600:Math.max(ww/2,Math.min(1200-ww/2,centerX+panOffset.x));
 const cy=hh>=720?360:Math.max(hh/2,Math.min(720-hh/2,centerY+panOffset.y));
 camera={s,x:W/2-cx*s,y:H/2-cy*s};
}
const clampZoom=v=>Math.max(.52,Math.min(2.9,v));
const screenToWorld=p=>({x:(p.x-camera.x)/camera.s,y:(p.y-camera.y)/camera.s});
const screenFromWorld=p=>({x:p.x*camera.s+camera.x,y:p.y*camera.s+camera.y});
function refreshCamera(){
 cameraFor(view?.cars?.[0]);
 $("zoom-level").textContent=Math.round(zoomFactor*100)+"%";
}
function setZoom(next,anchor={x:W/2,y:H/2}){
 if(!view)return;
 refreshCamera();
 const point=screenToWorld(anchor);
 zoomFactor=clampZoom(next);
 refreshCamera();
 const actual=screenToWorld(anchor);
 panOffset.x+=point.x-actual.x;
 panOffset.y+=point.y-actual.y;
 refreshCamera();
}
function focusCamera(){
 zoomFactor=1;panOffset={x:0,y:0};refreshCamera();
}
$("zoom-in").addEventListener("click",()=>setZoom(zoomFactor*1.22));
$("zoom-out").addEventListener("click",()=>setZoom(zoomFactor/1.22));
$("focus-car").addEventListener("click",focusCamera);
$("map-toggle").addEventListener("click",()=>{
 miniMapEnabled=!miniMapEnabled;
 $("map-toggle").setAttribute("aria-pressed",String(miniMapEnabled));
});
canvas.addEventListener("wheel",ev=>{
 if(!view)return;
 ev.preventDefault();
 const r=canvas.getBoundingClientRect();
 setZoom(zoomFactor*Math.exp(-Math.max(-250,Math.min(250,ev.deltaY))*.0016),
   {x:ev.clientX-r.left,y:ev.clientY-r.top});
},{passive:false});
canvas.addEventListener("gesturestart",ev=>ev.preventDefault(),{passive:false});
function drawCar(car,human,now){
 const c=ctx;c.save();c.translate(car.x,car.y);c.rotate((car.angle||0)+Math.PI/2);
 c.shadowColor="#10221c8c";c.shadowBlur=6;c.shadowOffsetY=6;
 c.fillStyle="#151b1d";for(const x of [-13,13])for(const y of [-13,11])c.fillRect(x-5,y-6,10,13);
 c.shadowBlur=0;c.shadowOffsetY=0;
 c.fillStyle="#172023";c.fillRect(-18,-19,36,5);c.fillRect(-17,17,34,6);
 c.fillStyle=car.color;c.fillRect(-16,-18,32,4);c.fillRect(-15,17,30,4);
 c.beginPath();c.moveTo(0,-24);c.lineTo(6,-17);c.lineTo(7,7);c.lineTo(11,14);c.lineTo(-11,14);c.lineTo(-7,7);c.lineTo(-6,-17);c.closePath();c.fill();
 c.fillStyle="#fdf2c6b0";c.fillRect(-2,-20,4,10);
 c.fillStyle="#192832";c.beginPath();c.ellipse(0,1,5,8,0,0,Math.PI*2);c.fill();
 c.fillStyle="#ffffff80";c.fillRect(-5,-5,2,15);
 if(human){c.strokeStyle=drag?"#ffdf83":"#ffcf76bb";c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.arc(0,0,31+Math.sin(now/260)*2,0,Math.PI*2);c.stroke();}
 c.restore();
}
function animated(car,now){
 if(!anim)return car;
 const t=(now-anim.started)/anim.stepMs,n=Math.floor(t),f=Math.max(0,Math.min(1,t-n));
 const i=car.id==="human"?0:Number(car.id.slice(-1));
 const track=anim.moves[i]?.trace;
 if(!track?.length)return car;
 if(i>n)return {...car,x:track[0][0],y:track[0][1]};
 if(i<n)return car;
 const at=f*(track.length-1),j=Math.floor(at),q=at-j;
 const a=track[j]||track[track.length-1],b=track[Math.min(j+1,track.length-1)];
 const prev=track[Math.max(0,j-2)],next=track[Math.min(j+2,track.length-1)];
 return {...car,x:a[0]+(b[0]-a[0])*q,y:a[1]+(b[1]-a[1])*q,angle:Math.atan2(next[1]-prev[1],next[0]-prev[0])||car.angle};
}
function vectors(){
 if(!drag)return {angle:keyboardAngle,power:keyboardPower,curve:keyboardCurve,draw:false};
 const dx=drag.start.x-drag.current.x,dy=drag.start.y-drag.current.y;
 return {angle:Math.atan2(dy,dx),
   power:Math.max(.12,Math.min(view?.maxPower??1,Math.hypot(dx,dy)/165)),
   curve:curveValue,draw:Math.hypot(dx,dy)>5};
}
function setCurveHud(curve){
 const amount=Math.min(1,Math.abs(curve));
 $("curve-value").textContent=amount<.035?"RECTO":(curve<0?"↶ IZQ ":"↷ DER ")+Math.round(amount*100)+"%";
 $("curve-left").style.width=(curve<0?amount*50:0)+"%";
 $("curve-right").style.width=(curve>0?amount*50:0)+"%";
 $("curve-value").dataset.bend=amount<.035?"none":curve<0?"left":"right";
 $("mini-curve").textContent=amount<.035?"RECTO":(curve<0?"IZQ ":"DER ")+Math.round(amount*100)+"%";
 const mini=$("mini-curve-fill");
 mini.style.left=curve<0?(50-amount*50)+"%":"50%";
 mini.style.width=amount*50+"%";
 mini.style.background=curve<0?"#76c6ff":"#f6c56b";
}
function showAimRisk(preview){
 const badge=$("trajectory-warning");
 if(!preview){badge.hidden=true;$("mobile-risk").hidden=true;return;}
 badge.hidden=false;
 badge.dataset.risk=preview.risk===2?"high":preview.risk===1?"medium":"low";
 $("trajectory-risk").textContent="RIESGO "+preview.label;
 $("trajectory-desc").textContent=preview.note;
 $("mobile-risk").hidden=false;
 $("mobile-risk").dataset.risk=badge.dataset.risk;
 $("mobile-risk").textContent="RIESGO "+preview.label+" · "+preview.note;
}
function updateAimWarning(){
 if(!drag||!view?.yourTurn||anim)return;
 const v=vectors();
 if(v.draw)showAimRisk(pathPreview(view.cars[0],v));
}
function pathPreview(car,v){
 const key=[view?.round,car.x,car.y,car.tireHealth,view?.config?.tire,view?.config?.wing,
  Math.round(v.angle*125),Math.round(v.power*125),Math.round(v.curve*100)].join(":");
 if(forecastCache&&key===forecastKey)return forecastCache;
 forecastCache=predictPath(car,v.angle,v.power,v.curve);
 forecastKey=key;
 return forecastCache;
}
function drawPreviewPath(pathPoints){
 const colors=["#6de6a2","#f6cb5c","#fb7668"];
 const c=ctx;c.save();c.lineWidth=5;c.lineCap="round";c.setLineDash([4,9]);
 for(let i=1;i<pathPoints.length;i++){
  const a=pathPoints[i-1],b=pathPoints[i];
  c.strokeStyle=colors[b.level]||colors[0];
  c.globalAlpha=.8;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
 }
 c.setLineDash([]);c.restore();
}
function drawAim(car,now){
 if(!view?.yourTurn||anim||(!drag&&!keyboardAimActive)){showAimRisk(null);return;}
 const v=vectors();if(!v.draw&&!keyboardAimActive){showAimRisk(null);return;}
 const preview=pathPreview(car,v);
 drawPreviewPath(preview.points);
 if($("trajectory-warning").dataset.risk!==(preview.risk===2?"high":preview.risk===1?"medium":"low")
    ||$("trajectory-warning").hidden)showAimRisk(preview);
 const len=48+v.power*48,dx=Math.cos(v.angle),dy=Math.sin(v.angle),c=ctx;
 c.save();c.strokeStyle="#f5f8d6";c.lineWidth=5;c.setLineDash([12,10]);c.lineCap="round";
 c.beginPath();c.moveTo(car.x+dx*39,car.y+dy*39);c.lineTo(car.x+dx*len,car.y+dy*len);c.stroke();c.setLineDash([]);
 c.strokeStyle="#ffd36e";c.lineWidth=4;const x=car.x+dx*len,y=car.y+dy*len;
 c.beginPath();c.moveTo(x-20*Math.cos(v.angle-.55),y-20*Math.sin(v.angle-.55));c.lineTo(x,y);c.lineTo(x-20*Math.cos(v.angle+.55),y-20*Math.sin(v.angle+.55));c.stroke();
 c.fillStyle="#ffe29244";c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.fill();c.restore();
}
function minimap(){
 if(!miniMapEnabled||!view)return;
 const x=W-134,y=86,w=121,h=83;
 ctx.save();ctx.fillStyle="#0b1b21d9";ctx.strokeStyle="#d5f0e566";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,9);ctx.fill();ctx.stroke();
 ctx.translate(x+9,y+8);ctx.scale((w-18)/1200,(h-16)/720);
 ctx.strokeStyle="#c5d3c2";ctx.lineWidth=172;ctx.stroke(path);
 ctx.strokeStyle="#6e7778";ctx.lineWidth=136;ctx.stroke(path);
 view.cars.forEach((car,i)=>{if(view.phase==="qualifying"&&i!==0)return;ctx.beginPath();ctx.fillStyle=car.color;ctx.arc(car.x,car.y,i?27:40,0,Math.PI*2);ctx.fill()});
 ctx.restore();
}
function frame(now){
 ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);
 if(!view){ctx.fillStyle="#203d31";ctx.fillRect(0,0,W,H);requestAnimationFrame(frame);return}
 if(anim&&now>=anim.started+anim.stepMs*(anim.moves.length||8)){anim=null;updateHud()}
 const cars=view.cars.map(c=>animated(c,now));
 cameraFor(cars[0]);
 ctx.setTransform(DPR*camera.s,0,0,DPR*camera.s,DPR*camera.x,DPR*camera.y);
 ctx.drawImage(base,0,0);
 if(currentTrack==="coast"||currentTrack==="jungle"){
   const intensity=view.weather?.intensity||.48;
   ctx.save();ctx.strokeStyle="#c1e8eb48";ctx.lineWidth=1.2;
   for(let i=0;i<45*intensity;i++){
     const x=(i*137+now*.024)%1200,y=(i*89+now*.08)%720;
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+15);ctx.stroke();
   }ctx.restore();
 }
 cars.forEach((c,i)=>{if(view.phase!=="qualifying"||i===0)drawCar(c,i===0,now);});
 drawAim(cars[0],now);
 ctx.setTransform(DPR,0,0,DPR,0,0);minimap();
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function setPower(p){
  const cap=view?.maxPower??1;
  const safe=Math.max(0,Math.min(p,cap));
  const n=Math.round(safe*100);
  UI.power.textContent=n+"%";
  UI.fill.style.width=n+"%";
 $("mini-power").textContent=n+"%";
 $("mini-power-fill").style.width=n+"%";
}
function updateResources(){
  if(!view)return;
  const car=view.cars[0];
  const energy=Math.max(0,Math.min(100,car.energy??100));
  const tire=Math.max(0,Math.min(100,car.tireHealth??100));
  const cap=view.maxPower??1;
  $("energy-fill").style.width=energy+"%";
  $("tire-fill").style.width=tire+"%";
  $("energy-value").textContent=Math.round(energy)+"%";
  $("tire-value").textContent=Math.round(tire)+"%";
  $("power-limit").textContent=Math.floor(cap*100+.001)+"%";
  $("power-ceiling").style.left=(cap*100)+"%";
  $("energy-fill").style.background=energy<35?"#fa7868":energy<65?"#e7bc58":"#62dcb6";
  $("tire-fill").style.background=tire<40?"#ef7770":tire<70?"#e8b956":"#f8c667";
  const last=view.lastMoves?.[0];
  const msg=last?.lapCrossings>0?"¡VUELTA COMPLETA! RESERVA RECARGADA AL 100%":
    Math.abs(last?.curve||0)>.035?"Último efecto: "+(last.curve<0?"izquierda":"derecha")+" "+Math.round(Math.abs(last.curve)*100)+"%":
    last?.risk==="high"?"Último golpe: riesgo alto, corregí la trazada":
    last?.risk==="medium"?"Último golpe: cerca del límite de agarre":
    energy<40?"¡Baja reserva! Lanzá suave para recuperarla":
    tire<50?"Neumáticos gastados: perdés adherencia":
    energy<70?"Un tiro suave recupera la reserva":"100% consume mucha reserva";
  $("wear-alert").textContent=msg;
  if(last?.lapCrossings>0){
    $("mobile-hint").textContent="¡VUELTA COMPLETA! Reserva de energía: 100%";
  }
}
function setStatus(t,bad=false){UI.status.textContent="● "+t;UI.status.classList.toggle("error-text",bad)}
function updateHud(){
 if(!view)return;
 const qualifying=view.phase==="qualifying",onGrid=view.phase==="grid";
 if(!$("rivals-modal").hidden)renderRivals();
 const season=view.championship;
 const ongoing=!!season&&season.status!=="complete";
 $("mobile-champ-tag").hidden=!season;
 if(season){
   $("mobile-champ-tag").textContent="🏆 "+season.name.toUpperCase()+" · GP "+(season.index+1)+"/"+season.tracks.length;
   $("championship-launch").title=season.name+" · GP "+(season.index+1)+"/3";
 }else $("championship-launch").title="Modo Campeonato";
 if(!$("championship-modal").hidden)renderChampionship();
 $("grid-skip-quick").hidden=ongoing;
 const qRound=Math.min(3,view.round+1);
 UI.round.textContent=qualifying?"QUALY "+qRound+"/3":"RONDA "+String((onGrid?0:view.round)+1).padStart(2,"0");
 $("mobile-lap").textContent=qualifying||onGrid?"QUALY":"V"+(view.playerLap||1)+"/2";
 $("desktop-lap").textContent=qualifying?"CLASIFICACIÓN":onGrid?"GRILLA":"VUELTA "+(view.playerLap||1)+"/2";
 $("mobile-lap-info").textContent=qualifying?"QUALY "+qRound+"/3":onGrid?"GRILLA DE SALIDA":"VUELTA "+(view.playerLap||1)+"/2";
 $("mobile-km").textContent=(view.playerKm||0).toFixed(2).replace(".",",")+" km";
 $("mobile-shots").textContent=(view.playerImpulses||0)+((view.playerImpulses||0)===1?" impulso":" impulsos");
 $("mobile-round").textContent=qualifying?"Q"+qRound+"/3":onGrid?"PARRILLA":"R"+String(view.round+1).padStart(2,"0");
 const canStartQual=view.phase==="racing"&&view.round===0&&view.mode!=="qualifying"&&!ongoing;
 $("qualify-trigger").hidden=!canStartQual;
 $("qualify-trigger-desktop").hidden=!canStartQual;
 if(!onGrid&& !$("grid-modal").hidden)$("grid-modal").hidden=true;
 UI.standings.replaceChildren();
 const ranked=[...view.ranking];
 ranked.forEach((r,i)=>{
  const row=document.createElement("div");row.className="standing"+(r.id==="human"?" human":"");
  const n=document.createElement("span");n.className="pos";n.textContent=String(i+1).padStart(2,"0");
  const dot=document.createElement("span");dot.className="dot";dot.style.background=r.color;
  const name=document.createElement("span");name.className="name";name.textContent=r.name;
  const hits=document.createElement("small");
 hits.textContent=qualifying?"Q"+Math.min(3,view.round)+"/3 · "+r.hits+" G":
   onGrid?"P"+(i+1):r.finishedAt!==null?"META":
   (Math.min(2,(r.lapsCompleted||0)+1)+"/2")+" · "+r.hits+" G";
  row.append(n,dot,name,hits);UI.standings.append(row);
 });
 const mobileLeaders=$("mobile-standings");
 mobileLeaders.replaceChildren();
 ranked.forEach((r,i)=>{
   const tile=document.createElement("div");tile.className="leader-tile"+(r.id==="human"?" human":"");
   const number=document.createElement("span");number.className="leader-num";number.textContent=String(i+1);
   const dot=document.createElement("span");dot.className="leader-dot";dot.style.background=r.color;
   const name=document.createElement("span");name.className="leader-name";name.textContent=r.name==="VOS"?"VOS":r.name.slice(0,3);
   tile.append(number,dot,name);mobileLeaders.append(tile);
 });
 const place=ranked.findIndex(r=>r.id==="human")+1;
 $("mini-status").textContent=qualifying?"Q"+qRound+"/3 · "+place+".º":onGrid?"P"+place:
   place+"º / "+view.cars.length;
 $("race-stage-label").textContent=season?
   "🏆 "+season.name.toUpperCase()+" · GP "+(season.index+1)+"/3":
   qualifying?"QUALIFYING · 3 IMPULSOS":onGrid?"GRILLA DE LARGADA":"GRILLA · 8 PILOTOS · 2 VUELTAS";
 const config=view.config||{difficulty:"pro",tire:"medium",wing:"medium",track:"valley"};
 const dif={beginner:"FÁCIL",pro:"PRO",expert:"EXPERTO"};
 const tire={soft:"BLANDOS",medium:"MEDIOS",hard:"DUROS"};
 const wing={low:"ALA BAJA",medium:"ALA MEDIA",high:"ALA ALTA"};
 $("car-setup-badge").textContent=(dif[config.difficulty]||"PRO")+" · "+(tire[config.tire]||"MEDIOS")+" · "+(wing[config.wing]||"ALA MEDIA");
 updateResources();
 $("track-number").textContent="CIRCUITO "+(trackSpec.number||"01");
 $("track-name").textContent=view.trackName||trackSpec.name;
 $("mobile-track-name").textContent=view.trackName||trackSpec.name;
 const weather=view.weather||weatherPreview();
 $("track-weather").textContent=weather.label||"SOLEADO";
 $("mobile-weather").textContent=weather.label||"SOLEADO";
 $("track-weather").dataset.weather=weather.code||"sunny";
 const career=view.career||{credits:160,races:0,wins:0,upgrades:{}};
 $("career-credits").textContent=career.credits;
 $("mobile-credits").textContent=career.credits;
 if(!$("garage-modal").hidden)renderGarage();
 const progress=Math.round(Math.max(0,view.cars[0].progress)/(view.courseLength*2)*100);
 $("ranking-note").textContent=qualifying?
   "Cada piloto clasifica en solitario con tres impulsos. Orden por avance válido; desempate por colisiones y piloto.":
   onGrid?"Los resultados de Qualifying determinan las ocho posiciones. Neumáticos y reserva: 100%.":
   view.phase==="finished"?"Todos tuvieron los mismos impulsos en la última ronda.":
   "Puesto "+place+"/"+view.cars.length+" · "+(view.playerKm||0).toFixed(2)+" km reales · "+(view.playerImpulses||0)+" impulsos · "+progress+"% de las 2 vueltas.";
 if(anim){setStatus(qualifying?"Calificando · intento "+view.round+"/3":"Jugando ronda "+view.round+"…");
   UI.instruction.innerHTML="<b>EN PISTA</b> · Mirá el impulso.";return}
 if(onGrid){
   renderGrid();
   setStatus("Qualifying finalizado · elegí cuándo largar");
   UI.instruction.innerHTML="<b>GRILLA DEFINIDA</b> · Comenzá la carrera oficial.";
   return;
 }
 if(qualifying){
   setStatus("QUALIFYING "+qRound+"/3 · Prepará tu impulso");
   UI.instruction.innerHTML="<b>QUALIFYING</b> · "+(3-view.round)+" impulsos restantes.";
   $("mobile-hint").textContent="QUALY "+qRound+"/3 · Apuntá desde el auto amarillo · El efecto está permitido";
   return;
 }
 if(view.phase==="finished"){
  const win=view.winner==="human";
  $("result-icon").textContent=win?"🏆":"🏁";$("result-title").textContent=win?"¡GANASTE!":"FIN DE CARRERA";
  $("result-stat").textContent="2 VUELTAS · "+view.cars.length+" PILOTOS · "+view.round+" RONDAS";
  $("result-distance").textContent=(view.playerKm||0).toFixed(2).replace(".",",")+" km recorridos · "+(view.playerImpulses||0)+" impulsos";
  const splits=$("result-lap-splits");splits.replaceChildren();
  const completed=view.cars[0].lapSplits||[];
  for(let lap=1;lap<=2;lap++){
    const item=completed.find(s=>s.lap===lap);
    const line=document.createElement("div"),label=document.createElement("span"),stat=document.createElement("strong");
    label.textContent="VUELTA "+lap;
    stat.textContent=item?item.lapKm.toFixed(2).replace(".",",")+" km · "+item.impulses+" impulsos":"Sin completar";
    line.append(label,stat);splits.append(line);
  }

  $("result-description").textContent=win?"¡Tu precisión te llevó a la victoria! Usá los créditos para mejorar el monoplaza.":"Terminaste "+place+"°. La próxima carrera puede cambiar con una mejora del garaje.";
  $("result-season").hidden=!season;
  $("next-gp").hidden=!season||season.status!=="between";
  $("play-again").hidden=!!season&&season.status==="between";
  if(season){
    const current=season.results[season.results.length-1];
    const you=season.table.find(r=>r.id==="human");
    $("result-season-points").textContent=season.status==="complete"?
      "🏆 TEMPORADA COMPLETADA · "+(you?.points||0)+" PTS":
      "🏆 +"+(current?.points||0)+" PUNTOS EN ESTE GP";
    $("result-season-place").textContent=(you?.position||8)+"º / 8 en la copa";
    if(season.status==="between"){
      $("result-description").textContent="GP "+(season.index+1)+"/3 completo. Los puntos se sumaron a la tabla. Prepará el próximo Gran Premio.";
      $("result-garage").textContent="🏆 VER CLASIFICACIÓN GENERAL";
    }else if(season.status==="complete"){
      const champion=season.table[0];
      $("result-icon").textContent=season.champion==="human"?"🏆":"🥈";
      $("result-title").textContent=season.champion==="human"?"¡CAMPEÓN DE LA COPA!":"TEMPORADA FINALIZADA";
      $("result-description").textContent="Campeón: "+champion.name+" con "+champion.points+" puntos. Premio de temporada: +"+season.bonus+" créditos.";
      $("result-garage").textContent="🏆 VER PODIO FINAL";
    }
  }else $("result-garage").textContent="🔧 IR AL GARAJE";
  const reward=view.career?.lastReward;
  $("earned-credits").textContent=reward?
    "+"+reward.credits+" CRÉDITOS DE CARRERA"+(season?.status==="complete"?" · +"+season.bonus+" TEMPORADA":"")+
    " · SALDO "+(view.career?.credits||0):"RECOMPENSA DE CARRERA";
  $("overlay").classList.add("show");
  setStatus(win?"¡Victoria!":"Carrera finalizada");
  UI.instruction.innerHTML="<b>CARRERA TERMINADA</b> · Probá de nuevo.";
 }else{
  setStatus(view.yourTurn?"Vuelta "+(view.playerLap||1)+"/2 · ¡calculá el impulso!":"Preparando turnos…");
  const cap=Math.round((view.maxPower??1)*100);
  if(!drag)UI.instruction.innerHTML=cap<100?"<b>POTENCIA MÁX. "+cap+"%</b> · Arrastrá desde el auto.":"<b>TOCÁ TU AUTO:</b> para lanzar. <b>FONDO:</b> cámara.";
 $("mobile-hint").textContent=view.lastMoves?.[0]?.lapCrossings>0?
   "¡VUELTA COMPLETA! La reserva volvió al 100%":
   cap<100?"Potencia máx. "+cap+"% · Tocá tu auto para lanzar":
   "Auto amarillo = lanzar · Fondo = mover · Dos dedos = zoom";
 }
}
function render(msg){
 if(!msg.view)return;
 const previous=view;view=msg.view;
 if(view.phase!=="finished")$("overlay").classList.remove("show");
 if(openGarageAfterAdvance&&view.championship?.status==="active"&&view.round===0&&
    view.championship.index>(previous?.championship?.index??-1)){
   openGarageAfterAdvance=false;
   queueMicrotask(()=>showGarage());
 }
 const nextTrack=view.config?.track||"valley";
 if(nextTrack!==currentTrack){initTrack(nextTrack);focusCamera();}
 forecastCache=null;
 if(previous?.round!==view.round){keyboardAimActive=false;showAimRisk(null);}
 keyboardPower=Math.max(.12,Math.min(keyboardPower,view.maxPower??1));
 if(previous&&view.round>previous.round&&view.lastMoves?.length===8){
  anim={moves:view.phase==="qualifying"?view.lastMoves.slice(0,1):view.lastMoves,
    started:performance.now(),stepMs:view.phase==="qualifying"?520:245};
  const currentAnimation=anim;
  // Timers still settle the round when the browser throttles animation frames.
  setTimeout(()=>{if(anim===currentAnimation){anim=null;updateHud();}},
    currentAnimation.moves.length*currentAnimation.stepMs+100);
  tone(400,.065,"triangle");
}else anim=null;
 $("connecting").style.display="none";updateHud();
}
function tone(freq,duration,shape){
 if(muted)return;
 try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();
 const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=shape||"triangle";
 osc.frequency.setValueAtTime(freq,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(70,freq*.6),audioCtx.currentTime+duration);
 gain.gain.setValueAtTime(.04,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
 osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration)}catch{}
}
function send(data){if(socket?.readyState===WebSocket.OPEN)socket.send(typeof data==="string"?data:JSON.stringify(data))}
function connect(){
 const proto=location.protocol==="https:"?"wss:":"ws:";
 socket=new WebSocket(proto+"//"+location.host+"/ws/"+encodeURIComponent(room));
 socket.addEventListener("open",()=>{retry=0;$("connection-label").textContent="EN LÍNEA";send({type:"join",playerId:id})});
 socket.addEventListener("message",ev=>{
  if(ev.data==="__pong")return;
  try{const data=JSON.parse(ev.data);if(data.type==="state")render(data);else if(data.type==="error")setStatus(data.error,true)}catch{}
 });
 socket.addEventListener("close",()=>{$("connection-label").textContent="SIN CONEXIÓN";setStatus("Reconectando…",true);retry=Math.min(6,retry+1);setTimeout(connect,Math.min(15000,600*2**retry))});
 socket.addEventListener("error",()=>setStatus("Sin conexión",true));
}
connect();
setInterval(()=>send("__ping"),30000);
const canShoot=()=>!!(view?.yourTurn&&!anim&&["racing","qualifying"].includes(view?.phase)
  &&$("setup-modal").hidden&&$("garage-modal").hidden&&$("grid-modal").hidden&&
  $("championship-modal").hidden&&$("rivals-modal").hidden);
const canNavigate=()=>!!(view&&$("setup-modal").hidden&&$("garage-modal").hidden&&$("grid-modal").hidden&&
  $("championship-modal").hidden&&$("rivals-modal").hidden);
const pnt=ev=>{const r=canvas.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top}};
const clampCurve=v=>Math.max(-1,Math.min(1,v));
function carHit(p){
 if(!canShoot())return false;
 const car=view.cars[0];
 const onScreen=screenFromWorld(car);
 // A reasonably generous hit target, without covering nearby rival cars.
 const radius=Math.min(53,Math.max(27,35*camera.s));
 const distance=Math.hypot(p.x-onScreen.x,p.y-onScreen.y);
 if(distance>radius)return false;
 // Qualifying is a solo timed session: other racers occupy independent simulations.
 if(view.phase==="qualifying")return true;
 // Starting-grid cars can be only 28 world units apart. Never treat a rival tap as our car.
 return view.cars.slice(1).every(other=>{
   const rival=screenFromWorld(other);
   return distance+2<Math.hypot(p.x-rival.x,p.y-rival.y);
 });
}
function stopTouch(clearCurve=true){
 drag=null;steer=null;forecastCache=null;showAimRisk(null);setPower(0);
 if(clearCurve){curveValue=0;setCurveHud(0);}
}
function pinchReading(){
 const pts=[...navigate.pointers.values()];
 if(pts.length<2)return null;
 return {dist:Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)),
  mid:{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}};
}
function clearNavigate(){navigate.pointers.clear();navigate.pinch=null;}
canvas.addEventListener("pointerdown",ev=>{
 if(!canNavigate())return;
 ev.preventDefault();refreshCamera();
 const p=pnt(ev);
 try{canvas.setPointerCapture(ev.pointerId)}catch{}
 // Starting on the car is the only way to arm a shot.
 if(drag){
   if(!steer&&ev.pointerId!==drag.id){
     steer={id:ev.pointerId,start:p,current:p,base:curveValue};
     forecastCache=null;
   }
   return;
 }
 if(navigate.pointers.size){
   navigate.pointers.set(ev.pointerId,p);
   navigate.pinch=pinchReading();
   return;
 }
 if(carHit(p)){
   drag={id:ev.pointerId,start:p,current:p};
   steer=null;curveValue=0;keyboardCurve=0;setCurveHud(0);
   keyboardAimActive=false;forecastCache=null;setPower(.12);
   UI.instruction.innerHTML="<b>DESDE TU AUTO:</b> tirá hacia atrás. <b>2.º DEDO:</b> efecto.";
   $("mobile-hint").textContent="Soltá el primer dedo para lanzar · Segundo dedo = efecto";
 }else{
   navigate.pointers.set(ev.pointerId,p);
   $("mobile-hint").textContent="Mové la pista · Con dos dedos pellizcá para zoom";
 }
});
canvas.addEventListener("pointermove",ev=>{
 const p=pnt(ev);
 if(drag){
   if(ev.pointerId===drag.id){
     ev.preventDefault();drag.current=p;forecastCache=null;setPower(vectors().power);updateAimWarning();
   }else if(steer&&ev.pointerId===steer.id){
     ev.preventDefault();
     steer.current=p;
     curveValue=clampCurve(steer.base+(steer.current.x-steer.start.x)/115);
     forecastCache=null;setCurveHud(curveValue);updateAimWarning();
   }
   return;
 }
 if(!navigate.pointers.has(ev.pointerId))return;
 ev.preventDefault();
 const prev=navigate.pointers.get(ev.pointerId);
 navigate.pointers.set(ev.pointerId,p);
 if(navigate.pointers.size>=2){
   const next=pinchReading();
   const last=navigate.pinch;
   if(next&&last){
     refreshCamera();
     const oldPoint=screenToWorld(last.mid);
     zoomFactor=clampZoom(zoomFactor*next.dist/last.dist);
     refreshCamera();
     const newPoint=screenToWorld(next.mid);
     panOffset.x+=oldPoint.x-newPoint.x;
     panOffset.y+=oldPoint.y-newPoint.y;
     refreshCamera();
   }
   navigate.pinch=next;
 }else{
   const amount=Math.max(.001,camera.s);
   panOffset.x-=(p.x-prev.x)/amount;
   panOffset.y-=(p.y-prev.y)/amount;
   refreshCamera();
 }
});
canvas.addEventListener("pointerup",ev=>{
 if(drag){
   if(steer&&ev.pointerId===steer.id){
     ev.preventDefault();steer=null;return; // retain chosen curvature until shot
   }
   if(ev.pointerId!==drag.id)return;
   ev.preventDefault();drag.current=pnt(ev);
   const distance=Math.hypot(drag.start.x-drag.current.x,drag.start.y-drag.current.y),v=vectors();
   stopTouch();
   $("mobile-hint").textContent="Tocá el auto amarillo para lanzar · Fondo para mover · Pellizcá para zoom";
   if(distance<14)return;
   if(canShoot()){
     tone(560,.12,"sawtooth");
     send({type:"action",action:{type:"flick",angle:v.angle,power:v.power,curve:+v.curve.toFixed(3)}});
   }
   return;
 }
 if(!navigate.pointers.has(ev.pointerId))return;
 ev.preventDefault();navigate.pointers.delete(ev.pointerId);
 navigate.pinch=navigate.pointers.size>=2?pinchReading():null;
 if(!navigate.pointers.size)$("mobile-hint").textContent="Tocá el auto amarillo para lanzar · Fondo para mover · Pellizcá para zoom";
});
canvas.addEventListener("pointercancel",ev=>{
 if(drag){
   if(ev.pointerId===drag.id){stopTouch();$("mobile-hint").textContent="Auto amarillo = lanzar · Fondo = mover · Dos dedos = zoom";}
   else if(steer&&ev.pointerId===steer.id)steer=null;
 }else if(navigate.pointers.has(ev.pointerId)){
   navigate.pointers.delete(ev.pointerId);navigate.pinch=null;
 }
});
document.addEventListener("keydown",ev=>{
 if(!canShoot())return;
 if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space","KeyQ","KeyE","KeyX"].includes(ev.code)){
  ev.preventDefault();keyboardAimActive=true;forecastCache=null;
 }
 if(ev.code==="ArrowLeft")keyboardAngle-=.09;
 if(ev.code==="ArrowRight")keyboardAngle+=.09;
 if(ev.code==="ArrowUp")keyboardPower=Math.min(view?.maxPower??1,keyboardPower+.08);
 if(ev.code==="ArrowDown")keyboardPower=Math.max(.12,keyboardPower-.08);
 if(ev.code==="KeyQ")keyboardCurve=clampCurve(keyboardCurve-.12);
 if(ev.code==="KeyE")keyboardCurve=clampCurve(keyboardCurve+.12);
 if(ev.code==="KeyX")keyboardCurve=0;
 if(["KeyQ","KeyE","KeyX"].includes(ev.code))setCurveHud(keyboardCurve);
 keyboardPower=Math.max(.12,Math.min(view?.maxPower??1,keyboardPower));
 keyboardAngle=Math.atan2(Math.sin(keyboardAngle),Math.cos(keyboardAngle));
 if(ev.code==="Space"){
   keyboardAimActive=false;showAimRisk(null);tone(560,.1,"sawtooth");
   send({type:"action",action:{type:"flick",angle:keyboardAngle,power:keyboardPower,curve:+keyboardCurve.toFixed(3)}});
 }
 else setPower(keyboardPower);
});
function newRace(config,mode){
  $("rivals-modal").hidden=true;
  if(view?.championship?.status==="active"||view?.championship?.status==="between"){
    if(!window.confirm("¿Abandonar el campeonato actual? Se perderán los puntos, pero conservarás créditos y mejoras."))return;
  }
  stopTouch();clearNavigate();keyboardCurve=0;keyboardAimActive=false;anim=null;forecastCache=null;
  $("overlay").classList.remove("show");$("grid-modal").hidden=true;
  send({type:"reset"});
  if(config)send({type:"action",action:{type:"configure",...config,raceMode:mode||"quick"}});
}
function reset(){newRace(view?.config||{difficulty:"pro",tire:"medium",wing:"medium",track:"valley"},
  view?.mode==="qualifying"?"qualifying":"quick");}
const UPGRADE_UI={
 engine:{icon:"⚡",title:"Motor de impulso",detail:"Hasta +8,1% de salida: avanzás más con igual potencia."},
 grip:{icon:"🛠️",title:"Suspensión de precisión",detail:"Hasta +25,5% de agarre: menos deriva en curvas."},
 tires:{icon:"🛞",title:"Compuesto reforzado",detail:"Hasta 33% menos desgaste de neumáticos por lanzamiento."},
 energy:{icon:"🔋",title:"Recuperador de energía",detail:"Consume menos reserva y acelera la recuperación."}
};
function renderGarage(){
 if(!view)return;
 const career=view.career||{credits:160,races:0,wins:0,upgrades:{}};
 $("garage-credits").textContent=career.credits;
 $("garage-races").textContent=career.races;
 $("garage-wins").textContent=career.wins;
 $("career-odometer").textContent=(career.totalKm||0).toFixed(2).replace(".",",")+" km acumulados · "+(career.totalImpulses||0)+" impulsos";
 const canBuy=view.round===0&&["racing","qualifying"].includes(view.phase);
 $("career-intro").textContent=canBuy?
   "Elegí cómo evolucionar tu auto. El presupuesto es limitado: cada mejora tiene un efecto real sobre la física.":
   "Podés revisar el garaje, pero las compras se realizan antes del primer impulso. Iniciá una carrera nueva para mejorar el auto.";
 const grid=$("upgrade-grid"),panel=grid.closest(".garage-panel"),scroll=panel.scrollTop;
 grid.replaceChildren();
 for(const [key,item] of Object.entries(UPGRADE_UI)){
   const part=view.shop?.[key];
   if(!part)continue;
   const level=part.level,card=document.createElement("div");
   card.className="upgrade-card"+(!part.unlocked?" locked":"");
   const head=document.createElement("div");head.className="upgrade-card-head";
   const icon=document.createElement("div");icon.className="upgrade-icon";icon.textContent=item.icon;
   const title=document.createElement("h3");title.textContent=item.title;head.append(icon,title);
   const desc=document.createElement("p");desc.textContent=item.detail;
   const levels=document.createElement("div");levels.className="upgrade-levels";
   for(let i=0;i<3;i++){const bar=document.createElement("span");if(i<level)bar.className="on";levels.append(bar)}
   const footer=document.createElement("div");footer.className="upgrade-foot";
   const meta=document.createElement("small");
   meta.textContent="NIVEL "+level+"/3";
   const button=document.createElement("button");button.type="button";
   if(!part.unlocked)button.textContent="🔒 "+part.unlock+" carreras";
   else if(level===3)button.textContent="MAX";
   else button.textContent="🪙 "+part.nextCost;
   button.disabled=!part.buyable;
   button.setAttribute("aria-label",part.unlocked?"Mejorar "+item.title+" por "+part.nextCost+" créditos":"Bloqueado hasta "+part.unlock+" carreras");
   button.addEventListener("click",()=>{
     if(!part.buyable)return;
     $("garage-message").textContent="Mejorando "+item.title+"…";
     send({type:"action",action:{type:"upgrade",upgrade:key}});
   });
   footer.append(meta,button);card.append(head,desc,levels,footer);
   grid.append(card);
 }
 panel.scrollTop=scroll;
 const locked=Object.values(view.shop||{}).filter(p=>!p.unlocked);
 $("garage-message").textContent=canBuy?
  (locked.length?"Terminá carreras para desbloquear piezas especiales.":"Todas las piezas están desbloqueadas."):
  "Completá la carrera o reiniciá antes de comprar.";
}
function showGarage(){
 $("rivals-modal").hidden=true;
 if(!$("championship-modal").hidden)$("championship-modal").hidden=true;
 if(!$("setup-modal").hidden)$("setup-modal").hidden=true;
 stopTouch();clearNavigate();
 $("garage-modal").hidden=false;renderGarage();$("close-garage").focus();
}
function hideGarage(){
 $("garage-modal").hidden=true;$("garage").focus();
}
$("garage").addEventListener("click",showGarage);
$("close-garage").addEventListener("click",hideGarage);
$("garage-back").addEventListener("click",hideGarage);
$("garage-modal").addEventListener("click",e=>{if(e.target===$("garage-modal"))hideGarage()});
$("result-garage").addEventListener("click",()=>{
 if(view?.championship){showChampionship();return;}
 $("overlay").classList.remove("show");
 if(view?.phase==="finished")newRace(view.config);
 showGarage();
});
document.addEventListener("keydown",e=>{if(e.code==="Escape"&&!$("garage-modal").hidden)hideGarage()});
function renderGrid(){
  if(!view||view.phase!=="grid")return;
  const results=$("grid-results");
  results.replaceChildren();
  for(const entry of view.qualification?.results||[]){
    const row=document.createElement("div");
    row.className="grid-pilot"+(entry.id==="human"?" human":"");
    const num=document.createElement("span");num.className="grid-pilot-num";num.textContent=entry.position+"º";
    const dot=document.createElement("span");dot.className="grid-pilot-mark";dot.style.background=entry.color;
    const info=document.createElement("span");info.className="grid-pilot-info";
    const name=document.createElement("strong");name.textContent=entry.id==="human"?"VOS":entry.name;
    const detail=document.createElement("small");
    detail.textContent="Avance "+Math.max(0,entry.progress/view.courseLength*100).toFixed(1)+"% · "+entry.hits+" impulsos";
    info.append(name,detail);row.append(num,dot,info);results.append(row);
  }
  $("grid-modal").hidden=false;
}
$("start-grid-race").addEventListener("click",()=>{
  if(view?.phase!=="grid")return;
  send({type:"action",action:{type:"startRace"}});
});
$("grid-skip-quick").addEventListener("click",()=>{
  if(view?.phase!=="grid")return;
  send({type:"action",action:{type:"quickRace"}});
});
const launchQualifying=()=>{
 if(!view)return;
 stopTouch();clearNavigate();$("overlay").classList.remove("show");
 if(view.phase==="racing"&&view.round===0){
   send({type:"action",action:{type:"startQualifying"}});
 }else newRace(view.config,"qualifying");
};
$("qualify-trigger").addEventListener("click",launchQualifying);
$("qualify-trigger-desktop").addEventListener("click",launchQualifying);
function renderChampionship(){
 const season=view?.championship,active=!!season&&season.status!=="complete";
 const cup=season?CUP_CATALOG[season.cup]:CUP_CATALOG[selectedCup];
 const tracks=season?.tracks||cup.tracks,complete=season?.status==="complete";
 $("championship-explainer").textContent=season?
   (complete?"Temporada terminada · Podio y resultados definitivos.":
     "GP "+(season.index+1)+"/3 · "+season.name+" · "+(season.status==="between"?"Próximo GP disponible.":"Temporada en curso.")):
   "Elegí una copa de tres Grandes Premios. Qualifying y dos vueltas por carrera, con el garaje entre fechas.";
 $("cup-options").hidden=active;
 document.querySelectorAll(".cup-choice").forEach(btn=>
   btn.setAttribute("aria-pressed",String(btn.dataset.cup===(season?.cup||selectedCup))));
 const schedule=$("championship-schedule");schedule.replaceChildren();
 tracks.forEach((key,i)=>{
   const gp=document.createElement("div");
   gp.className="champ-step"+(season?.results?.[i]?" done":season?.index===i?" active":"");
   const ordinal=document.createElement("div");ordinal.className="gp-round";
   ordinal.textContent=(season?.results?.[i]?"✓ ":"")+"GP "+(i+1)+"/3";
   const title=document.createElement("strong");title.textContent=TRACKS[key].name;
   const note=document.createElement("small");
   const score=season?.results?.[i];
   note.textContent=score?"P"+score.place+" · +"+score.points+" pts":(i===season?.index?"ACTUAL":season?"PENDIENTE":"2 VUELTAS");
   gp.append(ordinal,title,note);schedule.append(gp);
 });
 const results=$("championship-table");results.replaceChildren();
 const table=season?.table||[
   {id:"human",name:"VOS",color:"#f6bd3e"},
   ...["ROJO","AZUL","VERDE","VIOLETA","NARANJA","PLATA","TURQUESA"].map((name,i)=>({
     id:"cpu"+(i+1),name,color:["#f04e58","#39bae6","#35ce9e","#b68df3","#f49c55","#c5d3e0","#37c6cb"][i]
   }))
 ].map((row,i)=>({...row,position:i+1,points:0,events:[]}));
 for(const row of table){
   const node=document.createElement("div");node.className="champ-row"+(row.id==="human"?" human":"");
   const pos=document.createElement("span");pos.className="champ-position";pos.textContent=row.position+"º";
   const dot=document.createElement("span");dot.className="champ-dot";dot.style.background=row.color;
   const name=document.createElement("span");name.className="champ-driver";name.textContent=row.name;
   const history=document.createElement("span");history.className="champ-history";
   history.textContent=row.events?.length?row.events.map(e=>"P"+e).join(" · "):"—";
   const pts=document.createElement("span");pts.className="champ-points";pts.textContent=(row.points||0)+" pts";
   node.append(pos,dot,name,history,pts);results.append(node);
 }
 $("championship-honors").hidden=!complete;
 if(complete){
   const champion=table[0];
   $("championship-honors").textContent=(season.champion==="human"?"🏆 ¡SOS CAMPEÓN!":"🏆 CAMPEÓN: "+champion.name)+
     " · "+champion.points+" PUNTOS · Premio para VOS: +"+season.bonus+" créditos.";
 }
 const career=view?.career||{};
 $("championship-archive").textContent=(career.championshipsPlayed||0)+
   " campeonatos completados · "+(career.championshipsWon||0)+" títulos ganados";
 $("start-championship").hidden=active;
 $("start-championship").textContent=complete?"🏆 COMENZAR OTRA TEMPORADA":"🏁 INICIAR "+cup.name.toUpperCase();
 $("advance-championship").hidden=season?.status!=="between";
 $("championship-garage").hidden=!active || !(season.status==="between"||season.status==="active"&&view.round===0);
 $("championship-garage").textContent=season?.status==="between"?
   "🔧 SIGUIENTE GP Y GARAJE":"🔧 PREPARAR AUTO EN GARAJE";
 $("abandon-championship").hidden=!active;
}
function showChampionship(){
 $("rivals-modal").hidden=true;
 stopTouch();clearNavigate();
 if(!$("setup-modal").hidden)$("setup-modal").hidden=true;
 if(!$("garage-modal").hidden)$("garage-modal").hidden=true;
 renderChampionship();
 $("championship-modal").hidden=false;
 $("close-championship").focus();
}
function closeChampionship(){
 $("championship-modal").hidden=true;
 $("championship-launch").focus();
}
$("championship-launch").addEventListener("click",showChampionship);
$("championship-desktop").addEventListener("click",showChampionship);
$("close-championship").addEventListener("click",closeChampionship);
$("championship-modal").addEventListener("click",ev=>{
 if(ev.target===$("championship-modal"))closeChampionship();
});
document.addEventListener("keydown",ev=>{
 if(ev.code==="Escape"&&!$("championship-modal").hidden)closeChampionship();
});
document.querySelectorAll(".cup-choice").forEach(btn=>btn.addEventListener("click",()=>{
 if(view?.championship&&view.championship.status!=="complete")return;
 selectedCup=btn.dataset.cup;
 renderChampionship();
}));
function startSelectedChampionship(){
 if(!view)return;
 if(view.championship&&view.championship.status!=="complete")return;
 $("championship-modal").hidden=true;
 $("overlay").classList.remove("show");
 stopTouch();clearNavigate();anim=null;
 if(view.phase==="finished"){
   // The completed room must be reset before accepting another championship.
   send({type:"reset"});
 }
 send({type:"action",action:{type:"startChampionship",cup:selectedCup}});
}
$("start-championship").addEventListener("click",startSelectedChampionship);
function advanceGrandPrix(openGarage=false){
 if(view?.championship?.status!=="between")return;
 openGarageAfterAdvance=openGarage;
 $("championship-modal").hidden=true;
 $("overlay").classList.remove("show");
 stopTouch();clearNavigate();anim=null;
 send({type:"action",action:{type:"nextGrandPrix"}});
}
$("next-gp").addEventListener("click",()=>advanceGrandPrix());
$("advance-championship").addEventListener("click",()=>advanceGrandPrix());
$("championship-garage").addEventListener("click",()=>{
 if(view?.championship?.status==="between")advanceGrandPrix(true);
 else if(view?.championship?.status==="active")showGarage();
});
$("abandon-championship").addEventListener("click",()=>{
 if(!view?.championship||view.championship.status==="complete")return;
 if(!window.confirm("¿Abandonar la temporada? Los puntos se perderán, pero conservarás créditos y mejoras."))return;
 $("championship-modal").hidden=true;
 $("overlay").classList.remove("show");
 send({type:"action",action:{type:"abandonChampionship"}});
});
function renderRivals(){
 if(!view)return;
 const current=view.rivals||[];
 const roster=$("rival-setup-list");roster.replaceChildren();
 const ty={soft:"BLANDOS",medium:"MEDIOS",hard:"DUROS"};
 const wy={low:"ALA BAJA",medium:"ALA MEDIA",high:"ALA ALTA"};
 for(const rival of current){
   const card=document.createElement("div");card.className="rival-profile";
   const title=document.createElement("div");title.className="rival-title";
   const dot=document.createElement("span");dot.className="rival-title-dot";dot.style.background=rival.color;
   const name=document.createElement("strong");name.textContent=rival.name+" · "+rival.style;
   title.append(dot,name);
   const style=document.createElement("div");style.className="rival-style";style.textContent=rival.title;
   const description=document.createElement("div");description.className="rival-detail";description.textContent=rival.tactic;
   const setup=document.createElement("div");setup.className="rival-setup";
   setup.textContent="🛞 "+(ty[rival.tire]||"MEDIOS")+" · "+(wy[rival.wing]||"ALA MEDIA");
   card.append(title,style,description,setup);roster.append(card);
 }
 const telemetry=$("rival-telemetry");telemetry.replaceChildren();
 const map=new Map(current.map(r=>[r.id,r]));
 const ordered=view.ranking||[];
 for(const car of ordered){
   const r=map.get(car.id),actual=view.cars.find(c=>c.id===car.id)||{};
   const avg=r?.avgPower??(actual.hits?+(100*(actual.powerSum||0)/actual.hits).toFixed(1):0);
   const curves=r?.curvedShots??actual.curvedShots??0;
   const row=document.createElement("div");row.className="rival-telemetry-row"+(car.id==="human"?" human":"");
   const values=[car.name,actual.hits||0,(actual.distanceKm||0).toFixed(2),avg.toFixed(0)+"%",curves];
   values.forEach(v=>{const col=document.createElement("span");col.textContent=String(v);row.append(col);});
   telemetry.append(row);
 }
 const stage=view.phase==="finished"?"RESULTADOS FINALES":
   view.phase==="qualifying"?"SESIONES DE QUALIFYING":
   view.phase==="grid"?"GRILLA CLASIFICADA":"CARRERA EN CURSO";
 $("rival-intro").textContent=stage+" · "+
   (view.trackName||"Circuito")+" · "+
   (view.config?.difficulty==="expert"?"EXPERTO":view.config?.difficulty==="beginner"?"PRINCIPIANTE":"PROFESIONAL")+
   ". Los rivales usan la misma física, energía y neumáticos que tu monoplaza.";
}
function showRivals(){
 if(!view)return;
 stopTouch();clearNavigate();
 $("setup-modal").hidden=true;
 $("garage-modal").hidden=true;
 $("championship-modal").hidden=true;
 $("grid-modal").hidden=true;
 renderRivals();
 $("rivals-modal").hidden=false;
 $("close-rivals").focus();
}
function closeRivals(){$("rivals-modal").hidden=true;}
for(const id of ["rival-scout-button","result-rivals","rival-desktop"]){
 $(id).addEventListener("click",showRivals);
}
$("close-rivals").addEventListener("click",closeRivals);
$("rivals-modal").addEventListener("click",ev=>{if(ev.target===$("rivals-modal"))closeRivals();});
document.addEventListener("keydown",ev=>{
 if(ev.code==="Escape"&&!$("rivals-modal").hidden)closeRivals();
});
$("reset").addEventListener("click",reset);
$("quick-reset").addEventListener("click",reset);
$("play-again").addEventListener("click",reset);
function openSettings(){
 $("rivals-modal").hidden=true;
 if(!$("garage-modal").hidden)hideGarage();
 if(!$("championship-modal").hidden)$("championship-modal").hidden=true;
 const config=view?.config||{difficulty:"pro",tire:"medium",wing:"medium",track:"valley"};
 $("difficulty-select").value=config.difficulty;
 $("tire-select").value=config.tire;
 $("wing-select").value=config.wing;
 $("track-select").value=config.track||"valley";
 syncCircuitCards();
 $("race-mode-select").value="qualifying";
 const season=view?.championship,locked=season&&season.status!=="complete";
 $("race-mode-select").disabled=!!locked;
 $("track-select").disabled=!!locked;
 document.querySelectorAll(".circuit-card").forEach(card=>{card.disabled=!!locked;});
 $("apply-settings").disabled=!!locked&&(view.round!==0||!["qualifying","racing"].includes(view.phase));
 $("apply-settings").textContent=locked?"GUARDAR AJUSTES DEL AUTO ↗":"GUARDAR Y COMENZAR CARRERA ↗";
 stopTouch();clearNavigate();
 $("setup-modal").hidden=false;
 $("close-settings").focus();
}
function closeSettings(){
 $("setup-modal").hidden=true;
 $("settings").focus();
}
$("settings").addEventListener("click",openSettings);
$("close-settings").addEventListener("click",closeSettings);
$("setup-modal").addEventListener("click",ev=>{if(ev.target===$("setup-modal"))closeSettings()});
function syncCircuitCards(){
 const selected=$("track-select").value;
 $("track-description").textContent=TRACK_INFO[selected]||TRACK_INFO.valley;
 document.querySelectorAll(".circuit-card").forEach(card=>
  card.setAttribute("aria-pressed",String(card.dataset.track===selected)));
}
function paintCircuitCards(){
 const colors={
   valley:["#426d47","#87989d"],coast:["#316a75","#93c7ce"],
   desert:["#9e603a","#c9a077"],alps:["#82b0c6","#e9f7fd"],
   city:["#171d3e","#70cbe6"],jungle:["#174b3c","#87c5ac"]
 };
 document.querySelectorAll(".circuit-card").forEach(card=>{
  const track=TRACKS[card.dataset.track],canvas=card.querySelector("canvas");
  if(!track||!canvas)return;
  const c=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  const [bg,line]=colors[card.dataset.track];
  c.fillStyle=bg;c.fillRect(0,0,w,h);
  const coordinates=track.control;
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
  const minX=Math.min(...xs)-28,maxX=Math.max(...xs)+28;
  const minY=Math.min(...ys)-30,maxY=Math.max(...ys)+30;
  const scale=Math.min((w-12)/(maxX-minX),(h-12)/(maxY-minY));
  const toXY=pt=>[(pt[0]-minX)*scale+6,(pt[1]-minY)*scale+6];
  c.lineJoin="round";c.lineCap="round";
  c.beginPath();coordinates.forEach((pt,i)=>{
    const [x,y]=toXY(pt);
    if(i)c.lineTo(x,y);else c.moveTo(x,y);
  });c.closePath();c.strokeStyle="#15232f";c.lineWidth=10;c.stroke();
  c.strokeStyle="#cfe5e0";c.lineWidth=7;c.stroke();
  c.strokeStyle=line;c.lineWidth=5;c.stroke();
  const [startX,startY]=toXY(coordinates[0]);
  c.fillStyle="#f9c65f";c.beginPath();c.arc(startX,startY,3.6,0,Math.PI*2);c.fill();
  if(card.dataset.track==="city"){
    c.fillStyle="#e374da";c.fillRect(w-15,8,5,5);c.fillRect(7,8,4,4);
  }else if(card.dataset.track==="alps"){
    c.fillStyle="#f0ffff";c.beginPath();c.moveTo(6,h-5);c.lineTo(18,h-19);c.lineTo(30,h-5);c.fill();
  }
 });
}
document.querySelectorAll(".circuit-card").forEach(card=>{
 card.addEventListener("click",()=>{
  $("track-select").value=card.dataset.track;
  syncCircuitCards();
 });
});
$("track-select").addEventListener("change",syncCircuitCards);
paintCircuitCards();
syncCircuitCards();
$("apply-settings").addEventListener("click",()=>{
 const config={difficulty:$("difficulty-select").value,tire:$("tire-select").value,
  wing:$("wing-select").value,track:$("track-select").value};
 if(view?.championship&&view.championship.status!=="complete"){
   if(view.round!==0||!["qualifying","racing"].includes(view.phase))return;
   $("setup-modal").hidden=true;
   send({type:"action",action:{type:"configureCar",difficulty:config.difficulty,tire:config.tire,wing:config.wing}});
   return;
 }
 $("setup-modal").hidden=true;
 newRace(config,$("race-mode-select").value);
});
document.addEventListener("keydown",e=>{if(e.code==="Escape"&&!$("setup-modal").hidden)closeSettings()});
$("mute").addEventListener("click",()=>{muted=!muted;$("mute").textContent=muted?"♩":"♪";$("mute").setAttribute("aria-label",muted?"Activar sonidos":"Silenciar sonidos")});
