import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {defaults,cleanConfig,privateIP,selected,payload,validatePatch,captureScene,scenePayload} from './engine.mjs';
import {LIMIT,atomicJSON,readJSON,updaterInfo,setSource,fetchUpdate,installBundle,rollback} from './updater.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),PKG=readJSON(path.join(ROOT,'package.json'),{}),PORT=Number(process.env.TUBEROOM_PORT||8788),TEST=process.env.TUBEROOM_TEST==='1';
const DATA=process.env.TUBEROOM_DATA||path.join(os.homedir(),'Library','Application Support','TubeRoom');fs.mkdirSync(DATA,{recursive:true});
if(PKG.updateSource&&!fs.existsSync(path.join(DATA,'update-source.json')))setSource(DATA,PKG.updateSource);
// Keep v1 preferences/session files intact so app rollback remains possible.
let config=cleanConfig(readJSON(path.join(DATA,'settings-v3.json'),readJSON(path.join(DATA,'settings.json'),defaults())),defaults(),TEST);
let scenes=readJSON(path.join(DATA,'scenes-v3.json'),[]),devices={},busy=false,restarting=false,pendingUpdate=null;
const token=crypto.randomBytes(24).toString('hex'),file=(n)=>path.join(DATA,n),save=()=>atomicJSON(file('settings-v3.json'),config);
// The original Mac launcher looks for the effects key when detecting an already-running app.
const state=()=>({version:PKG.version,pid:process.pid,effects:[],config,devices,busy,scenes:scenes.map(({id,name,bars})=>({id,name,ids:bars.map(b=>b.id)})),token});
const connected=()=>config.tubes.filter(t=>t.ip&&t.enabled);
async function wled(ip,route='/json',data,timeout=2800){
 if(!privateIP(ip)&&!(TEST&&/^127\.0\.0\.[1-5]$/.test(ip)))throw Error('A local IPv4 address is required.');
 const url=TEST?`http://127.0.0.1:${process.env.TUBEROOM_WLED_PORT}${route}`:`http://${ip}${route}`;
 const r=await fetch(url,{method:data?'POST':'GET',redirect:'error',headers:{...(data?{'Content-Type':'application/json'}:{}),...(TEST?{'X-TubeRoom-Test-IP':ip}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('WLED returned HTTP '+r.status);const j=await r.json();if(j.error)throw Error('WLED rejected the command ('+j.error+').');return j;
}
async function probe(t,full=false){
 try{const old=devices[t.id],j=await wled(t.ip,full||!old?.ok?'/json':'/json/state');
  if(full||!old?.ok){if(!j.state||!Array.isArray(j.effects)||!j.effects.length||!Array.isArray(j.palettes)||!Number.isInteger(j.info?.leds?.count))throw Error('No valid WLED data. Check the IP.');let fxdata=[];try{fxdata=await wled(t.ip,'/json/fxdata',undefined,1200);}catch{}
   devices[t.id]={id:t.id,ip:t.ip,name:t.name,ok:true,version:j.info.ver,count:j.info.leds.count,effects:j.effects,palettes:j.palettes,fxdata:Array.isArray(fxdata)?fxdata:[],state:j.state,at:Date.now()};
  }else{if(!Array.isArray(j.seg))throw Error('Invalid WLED state.');devices[t.id]={...old,name:t.name,state:j,at:Date.now(),ok:true};}return devices[t.id];
 }catch(e){devices[t.id]={id:t.id,ip:t.ip,name:t.name,ok:false,error:e.message,at:Date.now()};throw Error(`${t.name}: ${e.message}`);}
}
async function refresh(full=false){await Promise.allSettled(connected().map(t=>probe(t,full)));}
async function locked(fn){if(busy)throw Error('Another change is in progress. Try again.');busy=true;try{return await fn();}finally{busy=false;}}
async function dispatch(bars,make){
 // Read every target and validate all commands before sending any light changes.
 const reads=await Promise.allSettled(bars.map(t=>probe(t,true)));const failed=reads.filter(r=>r.status==='rejected');if(failed.length)throw Error('Nothing changed. '+failed.map(r=>r.reason.message).join(' · '));
 const commands=bars.map(t=>({t,p:make(t,devices[t.id])}));
 const results=await Promise.allSettled(commands.map(({t,p})=>wled(t.ip,'/json/state',p)));
 await Promise.allSettled(bars.map(t=>probe(t)));
 return {results:results.map((r,i)=>({id:bars[i].id,name:bars[i].name,ok:r.status==='fulfilled',error:r.status==='rejected'?r.reason.message:undefined})),...state()};
}
async function blackout(){
 const bars=connected();const results=await Promise.allSettled(bars.map(t=>wled(t.ip,'/json/state',{on:false,transition:0,udpn:{send:false,rgrp:0,nn:true}})));
 await Promise.allSettled(bars.map(t=>probe(t)));return {...state(),results:results.map((r,i)=>({id:bars[i].id,name:bars[i].name,ok:r.status==='fulfilled',error:r.status==='rejected'?r.reason.message:undefined}))};
}
function networks(){return Object.values(os.networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal&&privateIP(x.address)).map(x=>x.address.split('.').slice(0,3).join('.')).filter((x,i,a)=>a.indexOf(x)===i);}
async function scan(prefix){if(!networks().includes(prefix))throw Error('Choose a network connected to this Mac.');let next=1;const found=[];await Promise.all(Array.from({length:20},async()=>{while(next<255){const ip=prefix+'.'+next++;try{const j=await wled(ip,'/json/info',undefined,550);if(Number.isInteger(j.leds?.count))found.push({ip,name:String(j.name||'WLED'),count:j.leds.count});}catch{}}}));return {found};}
function reply(res,code,value){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,limit){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>limit)throw Error('Request too large.');}return s?JSON.parse(s):{};}
const server=http.createServer(async(req,res)=>{
 const hosts=[`127.0.0.1:${PORT}`,`localhost:${PORT}`];if(!hosts.includes(req.headers.host)||req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`)){reply(res,403,{error:'Local access only.'});return;}
 const url=new URL(req.url,`http://127.0.0.1:${PORT}`);
 try{
  if(req.method==='GET'&&url.pathname==='/api/state'){reply(res,200,state());return;}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   if(req.headers['x-tuberoom-token']!==token)throw Error('Refresh this page to reconnect.');if(restarting)throw Error('TubeRoom is restarting.');
   const b=await body(req,url.pathname==='/api/update/install'?LIMIT+1024:64000);let result;
   switch(url.pathname){
    case '/api/config':result=await locked(async()=>{const next=cleanConfig(b,config,TEST);for(const t of next.tubes)if(t.ip!==config.tubes[t.id].ip||t.enabled!==config.tubes[t.id].enabled)delete devices[t.id];config=next;save();return state();});break;
    case '/api/refresh':result=await locked(async()=>{await refresh(!!b.full);return state();});break;
    case '/api/control':validatePatch(b.patch);result=await locked(()=>dispatch(selected(config,b.ids),(_,d)=>payload(b.patch,d)));break;
    case '/api/blackout':result=await locked(blackout);break;
    case '/api/preview':{const results=await Promise.allSettled(connected().map(async t=>{const p=await wled(t.ip,'/json/live',undefined,1000);if(!Array.isArray(p.leds)||p.leds.length>2000||!p.leds.every(c=>typeof c==='string'&&/^[\da-f]{6}$/i.test(c)))throw Error('Preview not supported');return {id:t.id,leds:p.leds,at:Date.now()};}));result={previews:results.filter(r=>r.status==='fulfilled').map(r=>r.value)};break;}
    case '/api/networks':result={networks:networks()};break;
    case '/api/scan':result=await locked(()=>scan(String(b.prefix||'')));break;
    case '/api/scene/save':result=await locked(async()=>{const bars=selected(config,b.ids),name=String(b.name||'').trim().slice(0,36);if(!name)throw Error('Name this scene.');if(scenes.length>=12)throw Error('You can save 12 scenes. Remove one first.');await Promise.all(bars.map(t=>probe(t,true)));scenes.push({id:crypto.randomUUID(),name,bars:bars.map(t=>({id:t.id,...captureScene(devices[t.id])}))});atomicJSON(file('scenes-v3.json'),scenes);return state();});break;
    case '/api/scene/apply':result=await locked(async()=>{const scene=scenes.find(s=>s.id===b.id);if(!scene)throw Error('Scene not found.');return dispatch(selected(config,scene.bars.map(x=>x.id)),(t,d)=>scenePayload(scene.bars.find(x=>x.id===t.id),d));});break;
    case '/api/scene/delete':result=await locked(async()=>{scenes=scenes.filter(s=>s.id!==b.id);atomicJSON(file('scenes-v3.json'),scenes);return state();});break;
    case '/api/update/status':result=updaterInfo(DATA,PKG.version);break;
    case '/api/update/source':setSource(DATA,String(b.url||''));pendingUpdate=null;result=updaterInfo(DATA,PKG.version);break;
    case '/api/update/check':{const u=await fetchUpdate(DATA,PKG.version);pendingUpdate=u.available?u.bundle:null;result={available:u.available,version:u.version,notes:u.notes};break;}
    case '/api/update/install':case '/api/update/rollback':{
     if(process.env.TUBEROOM_MANAGED!=='1')throw Error('Reopen with Start-TubeRoom.command to update.');if(busy)throw Error('Wait for the current command.');
     if(url.pathname.endsWith('install')){const bundle=b.bundle||pendingUpdate;if(!bundle)throw Error('Check for updates or choose an update file.');result=installBundle(DATA,bundle,PKG.version);}else result=rollback(DATA);
     restarting=true;result.restarting=true;setTimeout(()=>shutdown(75),300);break;}
    default:reply(res,404,{error:'Unknown action.'});return;
   }if(result&&'busy'in result)result.busy=busy;reply(res,200,result);return;
  }
  const fileName={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];if(req.method!=='GET'||!fileName){reply(res,404,{error:'Not found.'});return;}
  res.writeHead(200,{'Content-Type':fileName.endsWith('.css')?'text/css':fileName.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});fs.createReadStream(path.join(ROOT,'public',fileName)).pipe(res);
 }catch(e){if(!res.headersSent)reply(res,400,{error:e.message});else res.end();}
});
server.on('error',e=>{console.error(e.message);process.exit(1);});server.listen(PORT,'127.0.0.1',()=>console.log(`TubeRoom v3 · http://127.0.0.1:${PORT}\nNative WLED effects continue after closing this app.`));
function shutdown(code=0){save();server.close();process.exit(code);}process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
