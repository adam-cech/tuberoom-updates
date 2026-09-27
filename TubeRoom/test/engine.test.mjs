import test from 'node:test';import assert from 'node:assert/strict';
import {defaults,cleanConfig,privateIP,selected,payload,catalog,captureScene,scenePayload} from '../engine.mjs';
const device=(flip=false)=>({ok:true,name:'Bar',ip:'192.168.1.10',effects:flip?['Breathe','Solid']:['Solid','Breathe'],palettes:flip?['Ocean','Default']:['Default','Ocean'],state:{on:true,bri:100,transition:7,mainseg:1,seg:[{id:0,start:0,stop:50,fx:0,pal:0,col:[[0,255,0],[0,0,0],[0,0,0]]},{id:1,start:50,stop:100,fx:1,pal:1,col:[[255,0,0],[0,0,255],[0,0,0]],rev:true}]}});
test('v3 imports five existing connections and groups without accepting public addresses or duplicate IPs',()=>{
 const old={...defaults(),version:2};old.tubes[0]={...old.tubes[0],name:'Left bar',ip:'192.168.1.10',x:220};const c=cleanConfig(old);assert.equal(c.version,3);assert.equal(c.tubes[0].name,'Left bar');assert.equal(c.tubes[0].group,0);assert.equal(old.version,2);assert.equal(privateIP('172.32.1.2'),false);assert.equal(privateIP('10.0.0.2'),true);
 assert.throws(()=>cleanConfig({...c,tubes:c.tubes.map(t=>({...t,ip:'8.8.8.8'}))}),/local IPv4/);assert.throws(()=>cleanConfig({...c,tubes:c.tubes.map(t=>({...t,ip:'192.168.1.10'}))}),/different IP/);assert.throws(()=>selected(c,[1]),/Connect/);assert.throws(()=>selected(c,[0,0]),/Select/);
});
test('native commands resolve effect/palette names per firmware and preserve unrelated settings and segment boundaries',()=>{
 const a=payload({fx:'Solid',pal:'Ocean'},device()),b=payload({fx:'Solid',pal:'Ocean'},device(true));assert.equal(a.seg[0].fx,0);assert.equal(b.seg[0].fx,1);assert.equal(a.seg[0].pal,1);assert.equal(b.seg[0].pal,0);assert.deepEqual(a.seg.map(s=>s.id),[0,1]);assert.ok(a.seg.every(s=>!('start'in s)&&!('stop'in s)&&!('col'in s)&&!('rev'in s)));
 const bri=payload({bri:80},device());assert.equal(bri.seg,undefined);assert.deepEqual(bri.udpn,{send:false,rgrp:0,nn:true});const color=payload({color:{slot:1,rgb:[1,2,3]}},device());assert.deepEqual(color.seg[1].col,[{},{r:1,g:2,b:3,w:0},{}]);
 assert.throws(()=>payload({fx:'Missing'},device()),/not available/);assert.throws(()=>payload({rb:true},device()),/Unknown/);assert.throws(()=>payload({bri:256},device()),/Invalid/);assert.throws(()=>payload({color:{slot:4,rgb:[0,0,0]}},device()),/RGB/);assert.deepEqual(catalog([device(),device(true)],'effects'),['Solid','Breathe']);assert.deepEqual(catalog([device(),{ok:false}],'effects'),[]);
});
test('scenes retain per-segment colors and reject changed hardware, absent effects and missing segment IDs',()=>{
 const a=device(),scene=captureScene(a),b=device(true);const p=scenePayload(scene,b);assert.equal(p.seg[0].fx,1);assert.equal(p.seg[1].fx,0);assert.deepEqual(p.seg[1].col,a.state.seg[1].col);assert.ok(!('start'in p.seg[1]));assert.throws(()=>scenePayload(scene,{...b,ip:'192.168.1.11'}),/previous/);assert.throws(()=>scenePayload(scene,{...b,effects:['Solid']}),/missing/);b.state.seg.pop();assert.throws(()=>scenePayload(scene,b),/layout changed/);
});
