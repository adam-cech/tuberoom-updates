import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {LIMIT,updaterInfo,setSource,fetchUpdate,installBundle,rollback,atomicJSON,readJSON} from './updater.mjs';
import {defaults,cleanConfig,effects,nativeEffect,payload,restorePayload,availablePresets,rgb,isBeatLoop,BeatGate,BassGate,decodeAudioSync} from './engine.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url)),PACKAGE=readJSON(path.join(ROOT,'package.json'),{}),VERSION=PACKAGE.version;
const PORT=Number(process.env.TUBEROOM_PORT||8788),DATA=process.env.TUBEROOM_DATA||path.join(os.homedir(),'Library','Application Support','TubeRoom');
fs.mkdirSync(DATA,{recursive:true});
if(PACKAGE.updateSource&&!fs.existsSync(path.join(DATA,'update-source.json')))setSource(DATA,PACKAGE.updateSource);
let config=cleanConfig(readJSON(path.join(DATA,'settings.json'),defaults()));
let session=readJSON(path.join(DATA,'onboard-session.json'),{live:false,snapshots:{},presets:{},id:crypto.randomBytes(5).toString('hex')});
const status={live:session.live,busy:false,error:'',devices:{},source:'tube',micReady:false,preview:{},previewErrors:{}};
let pendingUpdate=null,restarting=false;
const beatState=status.beat={listening:false,connected:false,events:0,lastPacketAt:0,lastBeatAt:0,indices:session.beatIndices||[0,0],error:'',deliveryErrors:[],accepted:[0,0],bass:[{},{}]};
let beatSocket=null,beatTarget='',beatGate=new BeatGate(),beatJob=null,beatPending=null,beatEpoch=0;
let bassGates=[new BassGate(),new BassGate()];
const lightingKey=g=>JSON.stringify({...g,bassThreshold:undefined,bassGap:undefined});
const needsBeats=(c=config)=>active(c).some(t=>isBeatLoop(c.groups[t.group]));

const token=crypto.randomBytes(24).toString('hex');
const save=()=>atomicJSON(path.join(DATA,'settings.json'),config),saveSession=()=>atomicJSON(path.join(DATA,'onboard-session.json'),session);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const privateIP=ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)&&ip.split('.').length===4&&ip.split('.').every(p=>/^\d{1,3}$/.test(p)&&+p<=255);
const validIP=ip=>privateIP(ip)||(process.env.TUBEROOM_TEST==='1'&&/^127\.0\.0\.[1-5]$/.test(ip));
function validate(c){const ips=new Set();for(const t of c.tubes){if(t.ip&&!validIP(t.ip))throw Error(`${t.name}: enter its local IPv4 address.`);if(t.ip&&ips.has(t.ip))throw Error('Each tube must have a different IP.');if(t.ip)ips.add(t.ip);}}
async function wled(ip,route='/json',data,timeout=3500){
 if(!validIP(ip))throw Error('A local WLED IPv4 address is required.');
 const port=process.env.TUBEROOM_TEST==='1'?':'+process.env.TUBEROOM_WLED_PORT:'';
 const r=await fetch(`http://${process.env.TUBEROOM_TEST==='1'?'127.0.0.1':ip}${port}${route}`,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(process.env.TUBEROOM_TEST==='1'?{'X-TubeRoom-Test-IP':ip}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error(`WLED ${ip}: HTTP ${r.status}. Check connection and settings lock.`);
 const j=await r.json();if(j.error)throw Error(`WLED ${ip}: error ${j.error}`);return j;
}
function networks(){try{return Object.entries(os.networkInterfaces()).flatMap(([name,a])=>(a||[]).filter(x=>x.family==='IPv4'&&!x.internal&&privateIP(x.address)).map(x=>({name,ip:x.address,prefix:x.address.split('.').slice(0,3).join('.')})));}catch{return [];}}
function active(c=config){return c.tubes.filter(t=>t.ip&&t.enabled);}
function closeBeatReceiver(){beatEpoch++;beatPending=null;const socket=beatSocket;beatSocket=null;beatTarget='';beatState.listening=false;beatState.connected=false;if(socket)try{socket.close();}catch{}}
function deliverBeat(groups){
 // Count incoming peak events only while playing. There is no timer-driven advance.
 if(!status.live||status.busy||!needsBeats())return;
 if(!groups.size)return;
 for(const id of groups){beatState.indices[id]=(beatState.indices[id]+1)%config.groups[id].colors.length;beatState.accepted[id]++;}
 session.beatIndices=beatState.indices;
 beatPending={epoch:beatEpoch,indices:[...beatState.indices],groups:new Set([...(beatPending?.groups||[]),...groups])};
 if(!beatJob){beatJob=pumpBeats().finally(()=>{beatJob=null;});}
}
async function pumpBeats(){
 while(beatPending&&!status.busy&&status.live){
  const next=beatPending;beatPending=null;if(next.epoch!==beatEpoch)break;
  const targets=active().filter(t=>next.groups.has(t.group)&&isBeatLoop(config.groups[t.group]));
  const results=await Promise.allSettled(targets.map(t=>{
   const g=config.groups[t.group],color=g.colors[next.indices[t.group]%g.colors.length];
   return wled(t.ip,'/json/state',{transition:0,udpn:{nn:true},seg:[{id:0,col:[rgb(color),[0,0,0],[0,0,0]]}]},650);
  }));
  beatState.deliveryErrors=results.flatMap((r,i)=>r.status==='rejected'?[targets[i].name]:[]);
 }
}
async function openBeatReceiver(){
 const source=config.tubes[config.microphone],port=Number(status.devices[source.id]?.audioPort)||11988;
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid WLED audio sync port.');
 const target=source.ip+':'+port;
 if(beatSocket&&beatTarget===target&&beatState.listening)return;
 closeBeatReceiver();beatState.error='';beatState.lastPacketAt=0;beatState.lastBeatAt=0;beatGate=new BeatGate();bassGates=[new BassGate(),new BassGate()];beatState.bass=[{},{}];
 const socket=dgram.createSocket({type:'udp4',reuseAddr:true});beatSocket=socket;beatTarget=target;
 const epoch=beatEpoch;
 socket.on('message',(packet,remote)=>{
  if(epoch!==beatEpoch||remote.address!==source.ip)return;
  const now=performance.now(),event=beatGate.accept(packet,now);if(!event.valid)return;
  const audio=decodeAudioSync(packet),triggered=new Set();
  const groups=new Set(active().filter(t=>isBeatLoop(config.groups[t.group])).map(t=>t.group));
  for(const id of groups){const g=config.groups[id];if(g.loopTrigger==='bass'){const result=bassGates[id].accept(audio.bands,now,g);beatState.bass[id]=result;if(result.hit)triggered.add(id);}else if(event.beat)triggered.add(id);}
  beatState.lastPacketAt=Date.now();beatState.connected=true;
  if(event.beat)beatState.events++;if(triggered.size){beatState.lastBeatAt=Date.now();deliverBeat(triggered);}
 });
 try{
  await new Promise((resolve,reject)=>{
   let bound=false;
   socket.on('error',e=>{beatState.error='Beat listener: '+e.message;if(!bound)reject(e);else closeBeatReceiver();});
   socket.bind(port,process.env.TUBEROOM_TEST==='1'?'127.0.0.1':'0.0.0.0',()=>{
    try{
     if(process.env.TUBEROOM_TEST!=='1'){
      const addresses=networks().map(n=>n.ip);let joined=0;
      for(const address of addresses)try{socket.addMembership('239.0.0.1',address);joined++;}catch{}
      if(!joined)socket.addMembership('239.0.0.1');
     }
     bound=true;beatState.listening=true;resolve();
    }catch(e){reject(e);}
   });
  });
 }catch(e){closeBeatReceiver();throw Error('Could not listen to the tube microphone: '+e.message);}
 // A silent room still produces packets. Do not silently substitute timer/demo beats.
 for(let i=0;i<30&&!beatState.lastPacketAt;i++)await delay(100);
 if(!beatState.lastPacketAt){closeBeatReceiver();beatState.error='No WLED Audio Sync v2 packets from '+source.name+'. Check Send mode, router multicast and macOS local-network access.';throw Error(beatState.error);}
}
async function probe(t){try{const j=await wled(t.ip);if(!Number.isInteger(j.info?.leds?.count)||!Array.isArray(j.effects))throw Error('This device did not return a WLED effect list.');
 const [cfg,meta]=await Promise.allSettled([wled(t.ip,'/json/cfg'),wled(t.ip,'/json/fxdata')]);
 const ar=cfg.status==='fulfilled'?cfg.value.um?.AudioReactive:null;
 return status.devices[t.id]={ok:true,ip:t.ip,name:String(j.info.name||t.name),version:j.info.ver,count:j.info.leds.count,effects:j.effects,palettes:j.palettes||[],fxdata:meta.status==='fulfilled'&&Array.isArray(meta.value)?meta.value:[],audio:!!ar,audioMode:ar?.sync?.mode,audioEnabled:ar?.enabled,audioPort:ar?.sync?.port,audioNote:ar?'':'AudioReactive configuration was not available. Open WLED to check support.',state:j.state};
 }catch(e){return status.devices[t.id]={ok:false,ip:t.ip,name:t.name,error:e.message};}}
async function probeAll(){await Promise.all(config.tubes.filter(t=>t.ip).map(probe));const sender=config.tubes[config.microphone],d=status.devices[sender.id];status.micReady=!!(sender.ip&&sender.enabled&&d?.ok&&d.audioEnabled&&d.audioMode===1&&active().every(t=>{const x=status.devices[t.id];return x?.ok&&x.audioEnabled&&x.audioPort===d.audioPort&&x.audioMode===(t.id===sender.id?1:2);}));}
async function locked(fn){if(status.busy)throw Error('A tube action is in progress. Try again shortly.');status.busy=true;status.error='';beatPending=null;try{if(beatJob)await beatJob;return await fn();}catch(e){status.error=e.message;throw e;}finally{status.busy=false;}}
async function snapshot(t){if(!session.snapshots[t.ip]){session.snapshots[t.ip]=await wled(t.ip,'/json/state');saveSession();}}
async function cleanPresets(ip){const own=session.presets[ip]||[];if(!own.length)return;const p=await wled(ip,'/presets.json');for(const item of own){if(p[item.id]?.n===item.name)await wled(ip,'/json/state',{pdel:item.id});}delete session.presets[ip];saveSession();}
async function restoreAll(off=false){closeBeatReceiver();const errors=[];for(const [ip,s]of Object.entries(session.snapshots)){try{await wled(ip,'/json/state',{...restorePayload(s),...(off?{on:false}:{})});await cleanPresets(ip);delete session.snapshots[ip];saveSession();}catch(e){errors.push(e.message);}}
 session.live=false;status.live=false;saveSession();if(errors.length)throw Error('Some tubes could not be restored. Retry Stop: '+errors.join('; '));}
async function stop(off=false){let problem;try{await restoreAll(off);}catch(e){problem=e;}
 if(off){const results=await Promise.allSettled(active().map(t=>wled(t.ip,'/json/state',{on:false,live:false,seg:[{id:0,fx:0}],udpn:{nn:true}})));const failed=results.flatMap((r,i)=>r.status==='rejected'?[active()[i].name]:[]);if(failed.length)throw Error('Blackout could not reach '+failed.join(', '));}
 if(problem)throw problem;
}
async function applyTube(t,c){const g=c.groups[t.group],d=status.devices[t.id],state=await wled(t.ip,'/json/state');const p=payload(g,t,d,state);
 await cleanPresets(t.ip);
 if(g.effect!=='loop'||isBeatLoop(g)){if(isBeatLoop(g))p.seg[0].col=[rgb(g.colors[0]),[0,0,0],[0,0,0]];await wled(t.ip,'/json/state',p);return;}
 const existing=await wled(t.ip,'/presets.json'),slots=availablePresets(existing,g.colors.length);
 session.presets[t.ip]=slots.map((id,i)=>({id,name:`TR ${session.id} ${i+1}`}));saveSession();
 for(let i=0;i<slots.length;i++){
  const frame=structuredClone(p);frame.seg[0].col=[rgb(g.colors[i]),[0,0,0],[0,0,0]];
  await wled(t.ip,'/json/state',frame);
  await wled(t.ip,'/json/state',{psave:slots[i],n:session.presets[t.ip][i].name,ib:true,sb:true});
  let verified=false;for(let n=0;n<12;n++){await delay(120);const read=await wled(t.ip,'/presets.json');if(read[slots[i]]?.n===session.presets[t.ip][i].name){verified=true;break;}}
  if(!verified)throw Error(`${t.name}: WLED did not save the color sequence. Previous state will be restored.`);
 }
 await wled(t.ip,'/json/state',{on:g.brightness>0,playlist:{ps:slots,dur:slots.map(()=>Math.round(g.seconds*10)),transition:slots.map(()=>Math.round(Math.min(g.fade,g.seconds)*10)),repeat:0,end:0},udpn:{nn:true}});
}
async function preflight(c){validate(c);if(!active(c).length)throw Error('Connect and enable at least one tube in Setup.');await probeAll();for(const t of active(c)){const d=status.devices[t.id];if(!d?.ok||d.ip!==t.ip)throw Error(`${t.name} is unreachable.`);if(d.count!==t.count)throw Error(`${t.name}: pixel count changed. Use Setup → Check & save.`);nativeEffect(c.groups[t.group],d);}
 if(active(c).some(t=>(effects.find(e=>e.id===c.groups[t.group].effect).audio||isBeatLoop(c.groups[t.group])))&&!status.micReady)throw Error('Choose a tube microphone and click Connect microphone first. All enabled tubes need compatible AudioReactive support.');}
async function start(){if(Object.keys(session.snapshots).length&&!status.live)throw Error('Click Stop & restore to finish restoring the previous session first.');await preflight(config);try{if(needsBeats())await openBeatReceiver();for(const t of active()){await snapshot(t);await applyTube(t,config);}beatState.indices=[0,0];beatState.accepted=[0,0];session.beatIndices=beatState.indices;session.live=true;status.live=true;saveSession();}catch(e){try{await restoreAll();}catch(r){throw Error(e.message+' '+r.message);}throw e;}}
async function configureMic(){if(status.live)throw Error('Stop the lights before switching microphones.');const source=config.tubes[config.microphone];if(!source.ip||!source.enabled)throw Error('Choose a connected, enabled tube.');
 const entries=[];for(const t of config.tubes.filter(t=>t.ip)){const cfg=await wled(t.ip,'/json/cfg'),ar=cfg.um?.AudioReactive;if(!ar||!ar.sync){if(t.enabled)throw Error(`${t.name}: compatible AudioReactive settings were not found. Firmware will not be changed.`);continue;}entries.push({ip:t.ip,id:t.id,ar});}
 const sender=entries.find(x=>x.id===source.id);if(!sender)throw Error('The selected microphone is unavailable.');const port=Number(sender.ar.sync.port)||11988;
 // Keep only usermod settings in backups; never store network credentials.
 const backupFile=path.join(DATA,'microphone-backup.json');const original=readJSON(backupFile,{});for(const e of entries)original[e.ip]??=e.ar;atomicJSON(backupFile,original);
 const changed=[];
 try{for(const e of entries){const desired={...e.ar,enabled:true,sync:{...e.ar.sync,port,mode:e.id===source.id?1:2}};if(JSON.stringify(e.ar)===JSON.stringify(desired))continue;changed.push(e);await wled(e.ip,'/json/cfg',{um:{AudioReactive:desired},sv:true});}
  // Reboot only after all configuration writes succeed. Some builds need this to rebind audio sync.
  for(const e of changed)await wled(e.ip,'/json/state',{rb:true}).catch(()=>{});
  let ready=false;for(let attempt=0;attempt<12;attempt++){await delay(process.env.TUBEROOM_TEST==='1'?20:800);try{ready=await Promise.all(entries.map(async e=>{const c=await wled(e.ip,'/json/cfg',undefined,1000);return c.um?.AudioReactive?.sync?.mode===(e.id===source.id?1:2)&&c.um?.AudioReactive?.enabled===true&&c.um?.AudioReactive?.sync?.port===port;})).then(a=>a.every(Boolean));}catch{}if(ready)break;}
  if(!ready)throw Error('Microphone routing could not be verified after restart.');await probeAll();return {message:'Microphone routing saved. Tubes share '+source.name+' audio; play music to check the actual response.'};
 }catch(e){const failed=[];for(const old of changed){try{await wled(old.ip,'/json/cfg',{um:{AudioReactive:old.ar},sv:true});await wled(old.ip,'/json/state',{rb:true}).catch(()=>{});}catch{failed.push(old.ip);}}status.micReady=false;throw Error(e.message+(failed.length?' Could not roll back '+failed.join(', ')+'. Use Restore microphone settings when reachable.':' Previous microphone settings restored.'));}}
async function restoreMic(){if(status.live)throw Error('Stop the lights first.');const file=path.join(DATA,'microphone-backup.json'),old=readJSON(file,{});for(const [ip,ar]of Object.entries(old)){await wled(ip,'/json/cfg',{um:{AudioReactive:ar},sv:true});await wled(ip,'/json/state',{rb:true}).catch(()=>{});delete old[ip];atomicJSON(file,old);}status.micReady=false;}
async function scan(prefix){if(!privateIP(prefix+'.1'))throw Error('Enter a local subnet such as 192.168.1.');let n=1;const found=[];await Promise.all(Array.from({length:16},async()=>{while(n<255){const ip=prefix+'.'+n++;try{const info=await wled(ip,'/json/info',undefined,500);if(info.leds?.count)found.push({ip,name:info.name,count:info.leds.count});}catch{}}}));return found;}
function state(){beatState.connected=beatState.listening&&Date.now()-beatState.lastPacketAt<2500;return {config,status,effects,networks:networks(),version:VERSION,pid:process.pid,needsRestore:!!Object.keys(session.snapshots).length};}
function reply(res,code,j){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(j));}
async function body(req,limit=64000){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>limit)throw Error('Request too large');}return s?JSON.parse(s):{};}
const server=http.createServer(async(req,res)=>{
 const hosts=[`127.0.0.1:${PORT}`,`localhost:${PORT}`];if(!hosts.includes(req.headers.host)||req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`)){reply(res,403,{error:'Local access only.'});return;}
 const url=new URL(req.url,`http://127.0.0.1:${PORT}`);
 try{
  if(req.method==='GET'&&url.pathname==='/api/state'){reply(res,200,{...state(),token});return;}
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   if(req.headers['x-tuberoom-token']!==token)throw Error('Refresh this page to reconnect securely.');
   const b=await body(req,url.pathname==='/api/update/install'?LIMIT+1024:64000);
   if(restarting)throw Error('TubeRoom is restarting.');let result={};
   switch(url.pathname){
    case '/api/config':result=await locked(async()=>{const next=cleanConfig(b,config);validate(next);if(status.live&&(b.tubes||'microphone'in b))throw Error('Stop the lights before changing tube assignments or microphone.');if(status.live){await preflight(next);try{if(needsBeats(next))await openBeatReceiver();else closeBeatReceiver();for(const t of active(next))if(lightingKey(next.groups[t.group])!==lightingKey(config.groups[t.group]))await applyTube(t,next);}catch(e){await restoreAll().catch(r=>{e.message+=' '+r.message;});throw e;}}for(let i=0;i<2;i++)if(lightingKey(next.groups[i])!==lightingKey(config.groups[i])){beatState.indices[i]=0;bassGates[i]=new BassGate();}session.beatIndices=beatState.indices;if(next.microphone!==config.microphone||b.tubes)status.micReady=false;config=next;save();return {config,status};});break;
    case '/api/probe':await locked(probeAll);result=state();break;
    case '/api/beat/resume':await locked(async()=>{if(!status.live||!needsBeats())throw Error('Start a beat color loop first.');await preflight(config);await openBeatReceiver();});result=state();break;
    case '/api/start':await locked(start);result=state();break;
    case '/api/stop':await locked(()=>stop(false));result=state();break;
    case '/api/blackout':await locked(()=>stop(true));result=state();break;
    case '/api/microphone':result=await locked(configureMic);break;
    case '/api/microphone/restore':await locked(restoreMic);break;
    case '/api/scan':result=await locked(async()=>({found:await scan(String(b.prefix||''))}));break;
    case '/api/preview':{if(status.busy)throw Error('Wait for the current action.');await Promise.all(active().map(async t=>{try{const p=await wled(t.ip,'/json/live',undefined,1200);if(!Array.isArray(p.leds)||!p.leds.every(c=>typeof c==='string'&&/^[a-f\d]{6}$/i.test(c)))throw Error('Live pixel preview is not supported by this firmware.');status.preview[t.id]={leds:p.leds,at:Date.now()};delete status.previewErrors[t.id];}catch(e){delete status.preview[t.id];status.previewErrors[t.id]=e.message;}}));result={status};break;}
    case '/api/identify':result=await locked(async()=>{if(status.live)throw Error('Stop the show before testing colors.');const t=config.tubes[Number(b.id)];if(!t?.ip)throw Error('Save a tube IP first.');const colors={red:[255,0,0],green:[0,255,0],blue:[0,0,255],white:[255,255,255]};if(!colors[b.color])throw Error('Choose red, green, blue or white.');const old=await wled(t.ip,'/json/state');await snapshot(t);try{const d=await probe(t);const p=payload({...config.groups[t.group],effect:'fixed',brightness:.3,colors:['#ffffff'],params:{}},t,d,old);p.seg[0].col=[colors[b.color],[0,0,0],[0,0,0]];await wled(t.ip,'/json/state',p);await delay(1200);}finally{await wled(t.ip,'/json/state',restorePayload(old));delete session.snapshots[t.ip];saveSession();}return {ok:true};});break;
    case '/api/update/status':result=updaterInfo(DATA,VERSION);break;
    case '/api/update/source':setSource(DATA,String(b.url||''));pendingUpdate=null;result=updaterInfo(DATA,VERSION);break;
    case '/api/update/check':{const u=await fetchUpdate(DATA,VERSION);pendingUpdate=u.available?u.bundle:null;result={available:u.available,version:u.version,notes:u.notes};break;}
    case '/api/update/install':case '/api/update/rollback':{
     if(process.env.TUBEROOM_MANAGED!=='1')throw Error('Reopen with Start-TubeRoom.command to update.');if(status.live||status.busy||Object.keys(session.snapshots).length)throw Error('Stop & restore the lights before updating.');
     if(url.pathname.endsWith('install')){const bundle=b.bundle||pendingUpdate;if(!bundle)throw Error('Choose an update file first.');result=installBundle(DATA,bundle,VERSION);}else result=rollback(DATA);restarting=true;result.restarting=true;setTimeout(()=>shutdown(75),300);break;}
    default:reply(res,404,{error:'Unknown action'});return;
   }reply(res,200,result);return;
  }
  const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];if(req.method!=='GET'||!file){reply(res,404,{error:'Not found'});return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});fs.createReadStream(path.join(ROOT,'public',file)).pipe(res);
 }catch(e){if(!res.headersSent)reply(res,400,{error:e.message});else res.end();}
});
server.on('error',e=>{console.error(e.message);process.exit(1);});server.listen(PORT,'127.0.0.1',()=>console.log(`TubeRoom: http://127.0.0.1:${PORT}\nOnboard effects continue when this app closes. Beat color loops require this process and an awake Mac.`));
function shutdown(code=0){closeBeatReceiver();session.beatIndices=beatState.indices;save();saveSession();server.close();process.exit(code);}process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
