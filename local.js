// Standalone Vercel/Netlify player — no login, no server dependency.
import {setup,validateAction,applyAction,isGameOver,viewFor,meta} from "./logic.js";
let state=null,who=null;
const key="flickgp:standalone:save";
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
      try{
        const saved=JSON.parse(localStorage.getItem(key)||"null");
        if(saved?.human===who && Array.isArray(saved.cars)){
          // Upgrade existing 0.6.x careers without losing credits or bought parts.
          state=saved.cars.length===8&&saved.laps===2?saved:setup([who],saved);
          localStorage.setItem(key,JSON.stringify(state));
        }
      }catch{}
      if(!state){
        const first=setup([who]);
        state=applyAction(first,who,{type:"startQualifying"});
        localStorage.setItem(key,JSON.stringify(state));
      }
      this.report();return;
    }
    if(!state){this.error("Primero tenés que ingresar.");return}
    if(msg.type==="reset"){
      state=setup([who],state);localStorage.setItem(key,JSON.stringify(state));this.report();return;
    }
    if(msg.type==="action"){
      if(isGameOver(state).over){this.error("La carrera ya terminó.");return}
      const verdict=validateAction(state,who,msg.action);
      if(!verdict.ok){this.error(verdict.error||"Impulso inválido");return}
      state=applyAction(state,who,msg.action);
      localStorage.setItem(key,JSON.stringify(state));
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
