import test from 'node:test';import assert from 'node:assert/strict';import {defaults,cleanConfig,effects,payload,availablePresets,nativeEffect,BeatGate,decodeAudioSync,isBeatLoop} from '../engine.mjs';
test('version 1 settings migrate with connections, layout and RGB colors preserved',()=>{const old={version:1,brightness:.43,colorA:'#123456',colorB:'#abcdef',tubes:defaults().tubes};old.tubes[0].ip='192.168.1.20';old.tubes[0].angle=55;const c=cleanConfig(old);assert.equal(c.groups[0].brightness,.43);assert.equal(c.groups[1].colors[0],'#123456');assert.equal(c.tubes[0].angle,55);assert.deepEqual(c.tubes.map(t=>t.group),[0,0,0,1,1]);assert.equal(c.groups[0].effect,'fixed');});
test('effect IDs come from actual firmware; groups send RGB, full bounds and no normal UDP sync',()=>{const c=defaults(),d={name:'test',effects:['Breathe','Solid'],palettes:[],audio:false};c.groups[0].colors=['#ff0000'];const p=payload(c.groups[0],c.tubes[0],d,{seg:[{id:0},{id:1}]});assert.equal(p.seg[0].fx,1);assert.deepEqual(p.seg[0].col[0],[255,0,0]);assert.equal(p.seg[0].stop,100);assert.equal(p.seg[1].stop,0);assert.equal(p.udpn.rgrp,0);assert.throws(()=>nativeEffect({...c.groups[0],effect:'ripples'},d),/not installed/);assert.throws(()=>nativeEffect({...c.groups[0],effect:'ripples'},{...d,effects:['Ripple Peak']}),/AudioReactive/);});
test('color loop uses only free slots; validation rejects invalid data',()=>{assert.deepEqual(availablePresets({'200':{n:'user'}},3),[201,202,203]);assert.throws(()=>availablePresets(Object.fromEntries(Array.from({length:51},(_,i)=>[i+200,{}])),1),/Not enough/);const c=defaults();c.groups[0].colors=['red'];assert.throws(()=>cleanConfig(c),/RGB/);assert.equal(effects.length,12);});

test('Audio Sync v2 peak flags only, malformed packets rejected and duplicate triggers suppressed',()=>{
 const b=Buffer.alloc(44);b.write('00002\0');const gate=new BeatGate();
 assert.deepEqual(gate.accept(b,0),{valid:true,beat:false});b[16]=1;
 assert.equal(gate.accept(b,10).beat,true);assert.equal(gate.accept(b,30).beat,false);assert.equal(gate.accept(b,195).beat,true);
 assert.equal(decodeAudioSync(Buffer.alloc(44)),null);assert.equal(decodeAudioSync(b.subarray(0,43)),null);assert.equal(decodeAudioSync(Buffer.concat([b,Buffer.alloc(1)])),null);
 const c=defaults();c.groups[0].effect='loop';assert.equal(isBeatLoop(c.groups[0]),true);delete c.groups[0].loopTrigger;
 assert.equal(cleanConfig(c).groups[0].loopTrigger,'time','old timed setups retain their behavior');
});

test('bass filter ignores small peaks and treble; strong bass triggers once, then rearms after release',async()=>{
 const {BassGate}=await import('../engine.mjs');const gate=new BassGate();let time=0;
 const feed=(bass,frames=1,options={},high=0)=>{let hits=0,last;for(let i=0;i<frames;i++){time+=20;last=gate.accept([...Array(3).fill(Math.round(bass*2.55)),...Array(13).fill(high)],time,options);hits+=Number(last.hit);}return {hits,last};};
 assert.equal(feed(10,20).hits,0);assert.equal(feed(10,20,{},255).hits,0,'treble alone does not trigger');
 for(let n=0;n<6;n++){assert.equal(feed(35,2).hits,0);feed(10,25);}
 assert.equal(feed(90).hits,1,'large bass onset triggers');assert.equal(feed(90,100).hits,0,'sustained bass does not retrigger after cooldown');
 feed(10,35);assert.equal(feed(90).hits,1,'fresh large hit after release');feed(10,10);assert.equal(feed(90).hits,0,'cooldown rejects a closely spaced hit');assert.equal(feed(90,60).hits,0,'rejected onset cannot become a delayed timer trigger');
 feed(10,40);assert.equal(feed(65,1,{bassThreshold:75}).hits,0,'higher threshold rejects medium hits');feed(10,40);assert.equal(feed(90,1,{bassThreshold:75}).hits,1);
 time+=2000;assert.equal(feed(95).hits,0,'reconnection cannot invent an onset');
});
test('bass defaults/migration and trigger settings validation preserve explicit choices',()=>{
 const old=defaults();old.groups[0].loopTrigger='beat';const migrated=cleanConfig(old);assert.equal(migrated.groups[0].loopTrigger,'bass');assert.equal(migrated.groups[0].bassThreshold,55);assert.equal(migrated.groups[0].bassGap,650);
 migrated.groups[0].loopTrigger='beat';migrated.groups[0].bassGap=-100;migrated.groups[0].bassThreshold=200;const clean=cleanConfig(migrated);assert.equal(clean.groups[0].loopTrigger,'beat');assert.equal(clean.groups[0].bassThreshold,95);assert.equal(clean.groups[0].bassGap,200);
});
