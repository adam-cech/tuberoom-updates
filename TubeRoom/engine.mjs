// Stock-WLED control model. The tube computes FFT; the Mac filters reported levels for triggers.
// No Mac audio capture or pixel rendering.
export const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
export const effects=[
 {id:'fixed',name:'Fixed',native:['Solid'],tag:'STATIC',colors:1,description:'One color across the entire tube.'},
 {id:'fade',name:'Fade',native:['Fade'],tag:'TIMED',colors:2,description:'Fade between two chosen colors.'},
 {id:'pulse',name:'Pulse',native:['Breathe'],tag:'TIMED',colors:2,description:'Breathe between your primary and background colors.'},
 {id:'scroll',name:'Scroll',native:['Chase 2'],tag:'WITHIN TUBE',colors:2,description:'Two colors travel along each tube. Not a chase between fixtures.'},
 {id:'rainbow',name:'Rainbow',native:['Colorloop'],tag:'TIMED',colors:0,description:'The whole tube cycles through rainbow hues.'},
 {id:'strobe',name:'Strobe',native:['Strobe'],tag:'TIMED',colors:2,description:'Timed flashes. This stock effect is not audio triggered.'},
 {id:'loop',name:'Color loop',native:['Solid'],tag:'BEAT OR TIMER',colors:12,description:'Your colors advance on strong bass hits. Tune the threshold and minimum gap, or choose the original beat mode or timer. Sound modes need TubeRoom on an awake Mac.'},
 {id:'plasmoid',name:'Sound pulse',native:['Plasmoid'],tag:'AUDIO',audio:true,colors:3,description:'Sound gates a flowing pattern. Uses onboard Plasmoid; not a uniform full-tube pulse.'},
 {id:'flashes',name:'Sound flashes',native:['Puddlepeak'],tag:'AUDIO',audio:true,colors:3,description:'Sound peaks create patches of light. Stock WLED cannot make this an exact full-tube beat strobe.'},
 {id:'ripples',name:'Sound ripples',native:['Ripple Peak'],tag:'AUDIO',audio:true,colors:3,description:'Sound peaks launch ripples. Their positions can differ between tubes.'},
 {id:'center',name:'Sound center',native:['Gravcenter'],tag:'AUDIO',audio:true,colors:3,description:'Sound-responsive light grows from the tube center.'},
 {id:'dj',name:'DJ color',native:['DJ Light'],tag:'AUDIO',audio:true,colors:0,description:'Bass, mids and highs drive generated RGB colors. Not a custom beat-color sequence.'}
];
const group=i=>({id:i,name:'Group '+String.fromCharCode(65+i),effect:'fixed',brightness:.3,speed:128,intensity:128,colors:['#38bdf8','#000000','#ff408c'],seconds:2,fade:0,loopTrigger:'bass',bassThreshold:55,bassGap:650,params:{}});
export function defaults(){return {version:2,microphone:0,groups:[group(0),group(1)],tubes:Array.from({length:5},(_,i)=>({id:i,name:`Tube ${i+1}`,ip:'',count:100,x:180+i*160,y:300,angle:0,length:230,reverse:false,enabled:true,group:i<3?0:1}))};}
export function cleanConfig(input={},base=defaults()){
 const c=structuredClone(base);c.version=2;c.triggerSchema=1;
 // Retain legacy preferences for rollback to the previous app.
 for(const k of ['brightness','gain','gate','speed','softness'])if(Number.isFinite(input[k]))c[k]=input[k];
 for(const k of ['colorA','colorB'])if(/^#[\da-f]{6}$/i.test(input[k]))c[k]=input[k];

 if('microphone'in input)c.microphone=Math.round(clamp(input.microphone,0,4));
 // Preserve connections/layout/colors from version 1 while moving safely to a static effect.
 if(input.version===1&&!input.groups)c.groups=c.groups.map(g=>({...g,brightness:clamp(input.brightness??.3),colors:[input.colorA||'#38bdf8',input.colorB||'#ff408c','#000000']}));
 if(input.groups){if(!Array.isArray(input.groups)||input.groups.length!==2)throw Error('Two groups are required.');c.groups=input.groups.map((g,i)=>{if(!effects.some(e=>e.id===g.effect))throw Error('Unknown onboard effect.');if(!Array.isArray(g.colors)||g.colors.length<1||g.colors.length>12||g.colors.some(x=>!/^#[\da-f]{6}$/i.test(x)))throw Error('Choose 1–12 RGB colors.');const params={};for(const k of ['c1','c2','c3','o1','o2','o3'])if(k in (g.params||{}))params[k]=k[0]==='o'?!!g.params[k]:Math.round(clamp(g.params[k],0,k==='c3'?31:255));return {...group(i),name:String(g.name||group(i).name).slice(0,24),effect:g.effect,colors:g.colors,brightness:clamp(g.brightness),speed:Math.round(clamp(g.speed,0,255)),intensity:Math.round(clamp(g.intensity,0,255)),seconds:clamp(g.seconds,.2,60),fade:clamp(g.fade,0,10),loopTrigger:g.loopTrigger==='bass'?'bass':g.loopTrigger==='beat'?(input.version===2&&!input.triggerSchema?'bass':'beat'):'time',bassThreshold:clamp(g.bassThreshold??55,10,95),bassGap:Math.round(clamp(g.bassGap??650,200,2000)),params};});}
 if(input.tubes){if(!Array.isArray(input.tubes)||input.tubes.length!==5)throw Error('Exactly five tube slots are required.');c.tubes=input.tubes.map((t,i)=>({id:i,name:String(t.name||`Tube ${i+1}`).slice(0,30),ip:String(t.ip||'').trim(),count:Math.round(clamp(t.count,1,1500)),x:clamp(t.x,45,955),y:clamp(t.y,45,555),angle:clamp(t.angle,-180,180),length:clamp(t.length,50,420),reverse:!!t.reverse,enabled:t.enabled!==false,group:t.group===1?1:t.group===0?0:i<3?0:1}));}
 return c;
}
export const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
export function nativeEffect(g,device){const e=effects.find(e=>e.id===g.effect);const fx=device.effects?.findIndex(n=>e.native.includes(n))??-1;if(fx<0)throw Error(`${device.name}: ${e.name} is not installed in this WLED build.`);if(e.audio&&!device.audio)throw Error(`${device.name}: AudioReactive support was not detected. Choose a timed effect.`);return {e,fx};}
export function payload(g,t,d,s){const {e,fx}=nativeEffect(g,d);const colors=g.colors.slice(0,3).map(rgb);while(colors.length<3)colors.push([0,0,0]);const pal=e.colors===3?(d.palettes?.findIndex(n=>n.replace(/^\*\s*/, '')==='Colors Only')??-1):0;
 return {on:g.brightness>0,bri:Math.round(g.brightness*255),live:false,lor:0,transition:0,mainseg:0,udpn:{send:false,rgrp:0,nn:true},seg:[{id:0,start:0,stop:t.count,on:true,bri:255,grp:1,spc:0,of:0,rev:t.reverse,mi:false,fx,sx:g.speed,ix:g.intensity,pal:Math.max(0,pal),col:colors,...g.params},...(s.seg||[]).filter(x=>x.id!==0).map(x=>({id:x.id,stop:0}))]};
}
export function restorePayload(s){const p=structuredClone(s);for(const k of ['ps','pl','time','tb','nl','u','AudioReactive'])delete p[k];return {...p,live:false,lor:s.lor??0,transition:0,udpn:{...s.udpn,nn:true}};}
export function availablePresets(presets,n){const free=[];for(let i=200;i<=250&&free.length<n;i++)if(!Object.hasOwn(presets,String(i)))free.push(i);if(free.length<n)throw Error('Not enough free WLED preset slots (200–250). Existing presets were not changed.');return free;}

export const isBeatLoop=g=>g.effect==='loop'&&['beat','bass'].includes(g.loopTrigger);
// WLED Audio Sync v2: 44-byte packed packet, flag at byte 16. No audio FFT here.
export function decodeAudioSync(packet){
 if(!Buffer.isBuffer(packet)||packet.length!==44||packet.subarray(0,6).toString('ascii')!=='00002\0')return null;
 return {peak:packet[16]>0,bands:Array.from(packet.subarray(18,34))};
}
export class BeatGate {
 constructor(gap=180){this.gap=gap;this.last=-Infinity;}
 accept(packet,now){const data=decodeAudioSync(packet);if(!data)return {valid:false,beat:false};const beat=data.peak&&now-this.last>=this.gap;if(beat)this.last=now;return {valid:true,beat};}
}

// A trigger filter over the tube's already-computed low FFT bands, not a Mac FFT.
// First three WLED GEQ channels emphasize low bass; exact Hz depends on firmware.
export class BassGate {
 constructor(){this.previousTime=null;this.fast=0;this.background=0;this.armed=false;this.started=0;this.lastHit=-Infinity;this.peakLevel=0;this.peakAt=0;}
 accept(bands,now,{bassThreshold=55,bassGap=650}={}){
  const level=Math.sqrt(bands.slice(0,3).reduce((n,v)=>n+(clamp(v,0,255)/255)**2,0)/3)*100;
  // Missing packets are not silence. Reinitialize after a gap, preventing reconnect flashes.
  if(this.previousTime===null||now-this.previousTime>500||now<this.previousTime){
   this.previousTime=now;this.started=now;this.fast=this.background=level;this.armed=false;this.peakLevel=level;this.peakAt=now;
   return {hit:false,level,peakLevel:level,background:level,warming:true};
  }
  const dt=Math.max(0,now-this.previousTime);this.previousTime=now;
  const floor=clamp(bassThreshold,10,95),gap=clamp(bassGap,200,2000);
  const warming=now-this.started<250;
  const prominent=level>=floor&&level>this.background+Math.max(10,this.background*.45);
  const rising=level-this.fast>=Math.max(6,floor*.1);
  if(level<Math.max(floor*.7,this.background*1.12))this.armed=true;
  const hit=!warming&&this.armed&&prominent&&rising&&now-this.lastHit>=gap;
  // Consume an onset even during the cooldown; holding bass cannot fire on cooldown expiry.
  if(prominent&&rising){this.armed=false;if(hit)this.lastHit=now;}
  this.fast+=(level-this.fast)*(1-Math.exp(-dt/65));
  this.background+=(level-this.background)*(1-Math.exp(-dt/(level>this.background?1200:450)));
  if(level>=this.peakLevel||now-this.peakAt>1000){this.peakLevel=level;this.peakAt=now;}
  return {hit,level,peakLevel:this.peakLevel,background:this.background,warming};
 }
}
