import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import dgram from 'node:dgram';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('stock WLED groups, mic routing rollback, preset ownership, no DDP, restart persistence and recovery',{timeout:30000},async t=>{
 const root=new URL('../',import.meta.url),data=fs.mkdtempSync(path.join(os.tmpdir(),'tube-native-'));let child,failIP='',micFail=false,calls=[],packets=0;
 const names=['Solid','Fade','Breathe','Chase 2','Colorloop','Strobe','Plasmoid','Puddlepeak','Ripple Peak','Gravcenter','DJ Light'];
 const devices=Object.fromEntries([1,2,3,4,5].map(i=>['127.0.0.'+i,{state:{on:false,bri:90,udpn:{send:true,rgrp:1},seg:[{id:0,start:0,stop:100,fx:3,col:[[255,80,0]]}]},ar:{enabled:true,digitalmic:{type:1,pin:[32,15,14,-1]},sync:{mode:0,port:11988},config:{gain:40,squelch:10,AGC:1}},presets:{200:{n:'My own preset',bri:73}},audio:true}]));
 const mock=http.createServer(async(req,res)=>{const ip=req.headers['x-tuberoom-test-ip']||req.headers.host.split(':')[0],d=devices[ip];res.setHeader('Content-Type','application/json');if(!d){res.writeHead(404);res.end('{}');return;}let b;if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;b=JSON.parse(raw);calls.push({ip,route:req.url,b});}
 if(ip===failIP&&req.method==='POST'){res.writeHead(500);res.end('{}');return;}
 if(req.url==='/json/cfg'){if(b){if(micFail&&ip==='127.0.0.2'&&b.um.AudioReactive.sync.mode===2){res.writeHead(500);res.end('{}');return;}d.ar=b.um.AudioReactive;res.end('{"success":true}');}else res.end(JSON.stringify({um:d.audio?{AudioReactive:d.ar}:{}}));return;}
 if(req.url==='/presets.json'){res.end(JSON.stringify(d.presets));return;}
 if(req.url==='/json/live'){res.end('{"leds":["ff0000","00ff00"],"n":50}');return;}
 if(req.url==='/json/fxdata'){res.end(JSON.stringify(names.map(()=> 'Speed,Intensity;!,!;!;1')));return;}
 if(b){if(b.psave)d.presets[b.psave]={...structuredClone(d.state),n:b.n};else if(b.pdel)delete d.presets[b.pdel];else if(!b.rb)Object.assign(d.state,b);res.end('{"success":true}');return;}
 const info={name:'Mock '+ip,ver:'0.15.1',leds:{count:100}};res.end(JSON.stringify(req.url==='/json/state'?d.state:req.url==='/json/info'?info:{info,state:d.state,effects:names,palettes:['Default','* Random Cycle','* Color 1','* Colors 1&2','* Color Gradient','* Colors Only']}));});
 await new Promise(r=>mock.listen(0,'0.0.0.0',r));const udp=dgram.createSocket('udp4');await new Promise(r=>udp.bind(4048,'127.0.0.1',r));udp.on('message',()=>packets++);
 const launch=()=>{child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,TUBEROOM_DATA:data,TUBEROOM_PORT:'18788',TUBEROOM_TEST:'1',TUBEROOM_WLED_PORT:String(mock.address().port)},stdio:'pipe'});child.stdout.resume();child.stderr.resume();};
 const close=async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}};
 t.after(async()=>{await close();udp.close();mock.close();fs.rmSync(data,{recursive:true,force:true});});
 async function ready(){for(let i=0;i<50;i++){try{return await(await fetch('http://127.0.0.1:18788/api/state')).json();}catch{await delay(40);}}throw Error('Not ready');}
 launch();let s=await ready();const get=async()=>await(await fetch('http://127.0.0.1:18788/api/state')).json();
 const post=async(route,b={},headers={})=>{const r=await fetch('http://127.0.0.1:18788/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-TubeRoom-Token':s.token,...headers},body:JSON.stringify(b)});return {code:r.status,...await r.json()};};
 assert.equal((await post('config',{}, {Origin:'https://evil.example'})).code,403);assert.equal((await post('start',{}, {'X-TubeRoom-Token':'wrong'})).code,400);
 s.config.tubes.forEach((t,i)=>t.ip='127.0.0.'+(i+1));s.config.groups[0].colors=['#ff0000'];s.config.groups[1].colors=['#0000ff'];s.config.groups[1].effect='pulse';assert.equal((await post('config',s.config)).code,200);
 assert.equal((await post('probe')).code,200);{const result=await post('start');assert.equal(result.code,200,JSON.stringify(result));};assert.equal(devices['127.0.0.1'].state.seg[0].fx,0);assert.equal(devices['127.0.0.4'].state.seg[0].fx,2);assert.deepEqual(devices['127.0.0.4'].state.seg[0].col[0],[0,0,255]);
 const writes=calls.length;await delay(4200);assert.equal(calls.length,writes,'no continuous light/audio traffic or heartbeat dependency');assert.equal(packets,0);assert.equal((await get()).status.live,true);
 await close();launch();s=await ready();assert.equal(s.status.live,true);assert.equal((await post('stop')).code,200);assert.equal(devices['127.0.0.1'].state.bri,90);assert.equal(devices['127.0.0.4'].state.seg[0].fx,3);
 micFail=true;const fail=await post('microphone');assert.equal(fail.code,400);assert.equal(devices['127.0.0.1'].ar.sync.mode,0);assert.equal(devices['127.0.0.1'].ar.digitalmic.pin[0],32);micFail=false;
 assert.equal((await post('microphone')).code,200);assert.equal(devices['127.0.0.1'].ar.sync.mode,1);assert.equal(devices['127.0.0.5'].ar.sync.mode,2);assert.deepEqual(devices['127.0.0.5'].ar.digitalmic.pin,[32,15,14,-1]);
 await post('config',{microphone:3});assert.equal((await post('microphone')).code,200);assert.equal(devices['127.0.0.1'].ar.sync.mode,2);assert.equal(devices['127.0.0.4'].ar.sync.mode,1);
 s=await get();s.config.groups[0].effect='ripples';assert.equal((await post('config',{groups:s.config.groups})).code,200);{const result=await post('start');assert.equal(result.code,200,JSON.stringify(result));};assert.equal(devices['127.0.0.1'].state.seg[0].pal,5);await post('stop');
 devices['127.0.0.2'].audio=false;assert.equal((await post('start')).code,400);assert.equal((await get()).status.live,false);devices['127.0.0.2'].audio=true;
 s.config.groups[0].effect='loop';s.config.groups[0].colors=['#ff0000','#00ff00','#0000ff'];await post('config',{groups:s.config.groups});{const result=await post('start');assert.equal(result.code,200,JSON.stringify(result));};assert.deepEqual(devices['127.0.0.1'].state.playlist.ps,[201,202,203]);assert.equal(devices['127.0.0.1'].presets[200].n,'My own preset');assert.deepEqual(devices['127.0.0.1'].presets[202].seg[0].col[0],[0,255,0]);
 assert.equal((await post('preview')).status.preview[0].leds[0],'ff0000');await post('stop');assert.deepEqual(Object.keys(devices['127.0.0.1'].presets),['200']);
 s.config.groups[0].effect='fixed';await post('config',{groups:s.config.groups});failIP='127.0.0.3';assert.equal((await post('start')).code,400);assert.equal((await get()).needsRestore,true);failIP='';assert.equal((await post('stop')).code,200);assert.equal((await get()).needsRestore,false);
 await post('blackout');assert.equal(devices['127.0.0.5'].state.on,false);assert.equal(packets,0);assert.equal((await post('microphone/restore')).code,200);assert.equal(devices['127.0.0.4'].ar.sync.mode,0);
});
