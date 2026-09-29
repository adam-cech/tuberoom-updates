import test from 'node:test';import assert from 'node:assert/strict';
import {defaults,cleanConfig,privateIP,selected,payload,catalog,captureScene,scenePayload,brightnessSnapshot,brightnessPayload,brightnessActive,restoreBrightnessGeometry} from '../engine.mjs';
const device=(flip=false)=>({ok:true,name:'Bar',ip:'192.168.1.10',effects:flip?['Breathe','Solid']:['Solid','Breathe'],palettes:flip?['Ocean','Default']:['Default','Ocean'],state:{on:true,bri:100,transition:7,mainseg:1,seg:[{id:0,start:0,stop:50,fx:0,pal:0,col:[[0,255,0],[0,0,0],[0,0,0]]},{id:1,start:50,stop:100,fx:1,pal:1,col:[[255,0,0],[0,0,255],[0,0,0]],rev:true}]}});
test('v4 imports five existing connections and groups without accepting public addresses or duplicate IPs',()=>{
 const old={...defaults(),version:2};old.tubes[0]={...old.tubes[0],name:'Left bar',ip:'192.168.1.10',x:220};const c=cleanConfig(old);assert.equal(c.version,4);assert.equal(c.tubes[0].name,'Left bar');assert.equal(c.tubes[0].group,0);assert.equal(old.version,2);assert.equal(privateIP('172.32.1.2'),false);assert.equal(privateIP('10.0.0.2'),true);
 assert.throws(()=>cleanConfig({...c,tubes:c.tubes.map(t=>({...t,ip:'8.8.8.8'}))}),/local IPv4/);assert.throws(()=>cleanConfig({...c,tubes:c.tubes.map(t=>({...t,ip:'192.168.1.10'}))}),/different IP/);assert.throws(()=>selected(c,[1]),/Connect/);assert.throws(()=>selected(c,[0,0]),/Select/);
});
test('native commands resolve effect/palette names per firmware and preserve unrelated settings and segment boundaries',()=>{
 const a=payload({fx:'Solid',pal:'Ocean'},device()),b=payload({fx:'Solid',pal:'Ocean'},device(true));assert.equal(a.seg[0].fx,0);assert.equal(b.seg[0].fx,1);assert.equal(a.seg[0].pal,1);assert.equal(b.seg[0].pal,0);assert.deepEqual(a.seg.map(s=>s.id),[0,1]);assert.ok(a.seg.every(s=>!('start'in s)&&!('stop'in s)&&!('col'in s)&&!('rev'in s)));
 const bri=payload({bri:80},device());assert.equal(bri.seg,undefined);assert.deepEqual(bri.udpn,{send:false,rgrp:0,nn:true});const color=payload({color:{slot:1,rgb:[1,2,3]}},device());assert.deepEqual(color.seg[1].col,[{},{r:1,g:2,b:3,w:0},{}]);
 assert.throws(()=>payload({fx:'Missing'},device()),/not available/);assert.throws(()=>payload({rb:true},device()),/Unknown/);assert.throws(()=>payload({bri:256},device()),/Invalid/);assert.throws(()=>payload({color:{slot:4,rgb:[0,0,0]}},device()),/RGB/);assert.deepEqual(catalog([device(),device(true)],'effects'),['Solid','Breathe']);assert.deepEqual(catalog([device(),{ok:false}],'effects'),[]);
});
test('scenes retain per-segment colors and reject changed hardware, absent effects and missing segment IDs',()=>{
 const a=device(),scene=captureScene(a),b=device(true);const p=scenePayload(scene,b);assert.equal(p.seg[0].fx,1);assert.equal(p.seg[1].fx,0);assert.deepEqual(p.seg[1].col,a.state.seg[1].col);assert.ok(!('start'in p.seg[1]));assert.throws(()=>scenePayload(scene,{...b,ip:'192.168.1.11'}),/previous/);assert.throws(()=>scenePayload(scene,{...b,effects:['Solid']}),/missing|not available/);b.state.seg.pop();assert.throws(()=>scenePayload(scene,b),/layout changed/);
});

test('Sound Brightness is native Juggles plus whole-segment grouping, with reversible geometry and a dim RGB floor',()=>{
 const d=device();d.effects.push('Juggles');d.palettes.push('* Color 1');d.audio={enabled:true};d.state.seg[0].grp=2;d.state.seg[0].spc=1;
 const saved=brightnessSnapshot(d),p=brightnessPayload({fx:'Sound Brightness',floor:10},d);assert.equal(p.seg[0].fx,2);assert.equal(p.seg[0].pal,2);assert.equal(p.seg[0].grp,50);assert.equal(p.seg[1].grp,50);assert.equal(p.seg[0].spc,0);assert.equal(p.seg[0].ix,0);assert.deepEqual(p.seg[0].col[1],[0,26,0,0]);assert.ok(!('start'in p.seg[0]));
 for(const s of d.state.seg)Object.assign(s,p.seg.find(x=>x.id===s.id));assert.equal(brightnessActive(d,saved),true);
 const restored=restoreBrightnessGeometry(payload({fx:'Solid'},d),d,saved);assert.equal(restored.seg[0].grp,2);assert.equal(restored.seg[0].spc,1);assert.deepEqual(restored.seg[1].col[1],saved.segments[1].background);
 d.audio.enabled=false;assert.throws(()=>brightnessPayload({fx:'Sound Brightness'},d),/AudioReactive/);
 d.audio.enabled=true;d.state.seg[0].stop=300;assert.throws(()=>brightnessPayload({fx:'Sound Brightness'},d),/255/);
});
test('Beat Pulse cannot masquerade as a stock effect and audio effects require a verified input',()=>{const d=device();d.effects.push('Beat Pulse','Noisemeter');assert.throws(()=>payload({fx:'Beat Pulse'},d),/firmware/);assert.throws(()=>payload({fx:'Noisemeter'},d),/real WLED/);d.beatPulse=true;d.audio={enabled:true};assert.equal(payload({fx:'Beat Pulse'},d).seg[0].fx,2);});
