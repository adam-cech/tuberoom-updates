// WLED is the renderer. TubeRoom only sends explicit native control changes.
export function defaults(){return {version:3,groups:[{name:'Group A'},{name:'Group B'}],tubes:Array.from({length:5},(_,id)=>({id,name:`Bar ${id+1}`,ip:'',enabled:true,group:id<3?0:1}))};}
export function privateIP(ip){const a=String(ip).split('.');return a.length===4&&a.every(x=>/^\d{1,3}$/.test(x)&&+x<=255)&&(+a[0]===10||(+a[0]===192&&+a[1]===168)||(+a[0]===172&&+a[1]>=16&&+a[1]<=31));}
export function cleanConfig(input={},base=defaults(),test=false){
 const c=structuredClone(base);c.version=3;
 if(input.groups){if(!Array.isArray(input.groups)||input.groups.length!==2)throw Error('Use two groups.');c.groups=input.groups.map((g,i)=>({name:String(g.name||`Group ${i?'B':'A'}`).trim().slice(0,24)}));}
 if(input.tubes){if(!Array.isArray(input.tubes)||input.tubes.length!==5)throw Error('Use five bar slots.');const used=new Set();c.tubes=input.tubes.map((t,id)=>{
  const ip=String(t.ip||'').trim();if(ip&&!privateIP(ip)&&!(test&&/^127\.0\.0\.[1-5]$/.test(ip)))throw Error(`Bar ${id+1}: enter a local IPv4 address.`);
  if(ip&&used.has(ip))throw Error('Each bar needs a different IP address.');if(ip)used.add(ip);
  return {id,name:String(t.name||`Bar ${id+1}`).trim().slice(0,30),ip,enabled:t.enabled!==false,group:t.group===1?1:0};
 });}return c;
}
export function selected(config,ids){if(!Array.isArray(ids)||!ids.length||ids.length>5||ids.some(id=>!Number.isInteger(id)||id<0||id>4)||new Set(ids).size!==ids.length)throw Error('Select one or more bars.');const bars=ids.map(id=>config.tubes[id]);if(bars.some(t=>!t.ip||!t.enabled))throw Error('Connect and enable all selected bars first.');return bars;}
export const activeSegments=s=>(s?.seg||[]).filter(s=>Number.isInteger(s.id)&&s.stop>s.start);
export function primarySegment(s){return activeSegments(s).find(x=>x.id===s.mainseg)||activeSegments(s)[0]||{};}
const range=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;
export function validatePatch(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||!Object.keys(p).length)throw Error('Choose a control to change.');
 for(const [k,v] of Object.entries(p)){
  if(['on','rev','mi','o1','o2','o3'].includes(k)){if(typeof v!=='boolean')throw Error(`Invalid ${k}.`);}
  else if(['bri','sx','ix','c1','c2','c3'].includes(k)){if(!range(v,0,k==='c3'?31:255))throw Error(`Invalid ${k}.`);}
  else if(k==='transition'){if(!range(v,0,100))throw Error('Transition must be 0–10 seconds.');}
  else if(['fx','pal'].includes(k)){if(typeof v!=='string'||!v||v.length>120)throw Error(`Invalid ${k}.`);}
  else if(k==='color'){if(!v||!range(v.slot,0,2)||!Array.isArray(v.rgb)||v.rgb.length!==3||!v.rgb.every(x=>range(x,0,255)))throw Error('Choose an RGB color.');}
  else throw Error('Unknown control: '+k);
 }return p;
}
export function payload(p,d){
 validatePatch(p);const out={udpn:{send:false,rgrp:0,nn:true}};
 for(const k of ['on','bri','transition'])if(k in p)out[k]=p[k];
 const seg={};for(const k of ['sx','ix','c1','c2','c3','o1','o2','o3','rev','mi'])if(k in p)seg[k]=p[k];
 for(const [key,list]of [['fx','effects'],['pal','palettes']])if(key in p){const id=d[list].indexOf(p[key]);if(id<0)throw Error(`${d.name}: ${p[key]} is not available.`);seg[key]=id;}
 if(Object.keys(seg).length||p.color){const segments=activeSegments(d.state);if(!segments.length)throw Error(`${d.name}: no active WLED segments. Open WLED to configure the LED strip.`);
  out.seg=segments.map(s=>{const update={id:s.id,...seg};if(p.color){const col=[{},{},{}];const [r,g,b]=p.color.rgb;col[p.color.slot]={r,g,b,w:0};update.col=col;}return update;});
  out.live=false;out.lor=0;
 }return out;
}
export function catalog(devices,key){if(!devices.length||devices.some(d=>!d?.ok))return [];return devices[0][key].filter((name,index,a)=>name&&name!=='RSVD'&&a.indexOf(name)===index&&devices.every(d=>d[key].includes(name)));}
export function captureScene(d){const segments=activeSegments(d.state);if(!segments.length)throw Error(`${d.name}: no active segments to save.`);if(segments.some(s=>!d.effects[s.fx]||!d.palettes[s.pal]))throw Error(`${d.name}: this look uses an effect or custom palette not listed by WLED. Save it in WLED instead.`);return {ip:d.ip,on:!!d.state.on,bri:d.state.bri,transition:d.state.transition??0,segments:segments.map(s=>({id:s.id,fx:d.effects[s.fx],pal:d.palettes[s.pal],col:s.col,on:s.on,bri:s.bri,sx:s.sx,ix:s.ix,c1:s.c1,c2:s.c2,c3:s.c3,o1:s.o1,o2:s.o2,o3:s.o3,rev:s.rev,mi:s.mi}))};}
export function scenePayload(scene,d){
 const p={on:scene.on,bri:scene.bri,transition:scene.transition,live:false,lor:0,udpn:{send:false,rgrp:0,nn:true}};
 if(scene.ip!==d.ip)throw Error('This scene belongs to a previous bar connection. Save a new scene.');
 p.seg=scene.segments.map(s=>{if(!activeSegments(d.state).some(x=>x.id===s.id))throw Error(`${d.name}: segment layout changed. Save a new scene.`);
  const fx=d.effects.indexOf(s.fx),pal=d.palettes.indexOf(s.pal);if(fx<0||pal<0)throw Error(`${d.name}: scene effect or palette is missing.`);
  const out={...s,fx,pal};delete out.ip;return out;
 });return p;
}
