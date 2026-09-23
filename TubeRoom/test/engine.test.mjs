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
