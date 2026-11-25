// Standalone Vercel/Netlify player — no login, no server dependency.
import {setup,validateAction,applyAction,isGameOver,viewFor,meta} from "./logic.js";
import {migrate,stamp} from "./save.js";
let state=null,who=null;
const key="flickgp:standalone:save";
function persist(){
  state=stamp(state);
  try{localStorage.setItem(key,JSON.stringify(state));}catch{}
}
function load(){
  let raw=null;
  try{raw=localStorage.getItem(key);}catch{return null}
  if(!raw)return null;
  try{return migrate(JSON.parse(raw),who);}
  catch{
    // Unreadable save: keep a copy instead of silently overwriting the career.
    try{localStorage.setItem(key+":backup",raw);}catch{}
    return null;
  }
}
class LocalWebSocket extends EventTarget {
  static OPEN=1;
  static CLOSED=3;
  readyState=0;
  constructor(url){
    super();
    queueMicrotask(()=>{
      this.readyState=LocalWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(raw){
    if(raw==="__ping"){
      this.dispatchEvent(new MessageEvent("message",{data:"__pong"}));return;
    }
    let msg;
    try {msg=JSON.parse(raw)}catch{this.error("Mensaje inválido.");return}
    if(msg.type==="join"){
      who=msg.playerId;
      state=load();
      if(!state){
        const first=setup([who]);
        state=applyAction(first,who,{type:"startQualifying"});
      }
      persist();
      this.report();return;
    }
    if(!state){this.error("Primero tenés que ingresar.");return}
    if(msg.type==="reset"){
      state=setup([who],state);persist();this.report();return;
    }
    if(msg.type==="action"){
      if(isGameOver(state).over){this.error("La carrera ya terminó.");return}
      const verdict=validateAction(state,who,msg.action);
      if(!verdict.ok){this.error(verdict.error||"Impulso inválido");return}
      state=applyAction(state,who,msg.action);
      persist();
      this.report();return;
    }
  }
  report(){
    const res=isGameOver(state);
    const data={type:"state",status:res.over?"over":"playing",seats:[who],you:who,connected:1,view:viewFor(state,who),result:res.over?res:null,meta};
    queueMicrotask(()=>this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(data)})));
  }
  error(message){
    queueMicrotask(()=>this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify({type:"error",error:message})})));
  }
  close(){this.readyState=LocalWebSocket.CLOSED;this.dispatchEvent(new Event("close"));}
}
globalThis.WebSocket=LocalWebSocket;
await import("./client.js");
