// Stable supervisor: never replaced by normal updates. Starts versioned app releases.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const base=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.TUBEROOM_DATA||path.join(os.homedir(),'Library','Application Support','TubeRoom');
const port=Number(process.env.TUBEROOM_PORT||8788);fs.mkdirSync(data,{recursive:true});
const pointerFile=path.join(data,'current-release.json');
const read=()=>{try{return JSON.parse(fs.readFileSync(pointerFile,'utf8'));}catch{return {};}};
const write=p=>{fs.writeFileSync(pointerFile+'.tmp',JSON.stringify(p));fs.renameSync(pointerFile+'.tmp',pointerFile);};
function folder(id){if(!/^(?:\d{1,4}\.){2}\d{1,4}-[a-f0-9]{16}$/.test(id||''))return null;return path.join(data,'releases',id);}
let child,quitting=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{quitting=true;child?.kill(signal);});
function revert(p,message){write({current:p.previous||null,previous:null,pending:!!p.previous,rolledBack:true});fs.writeFileSync(path.join(data,'update-notice.json'),JSON.stringify({message}));console.error(message);}
async function run(){
 const p=read();let app=p.current?folder(p.current):base;
 if(!app||!fs.existsSync(path.join(app,'server.mjs'))){if(p.current){revert(p,'An installed update was incomplete. Restoring the previous version.');return run();}throw Error('The TubeRoom folder is incomplete.');}
 child=spawn(process.execPath,[path.join(app,'server.mjs')],{stdio:'inherit',env:{...process.env,TUBEROOM_DATA:data,TUBEROOM_MANAGED:'1'}});const thisChild=child;
 let healthy=false,checking=false,expired=false;const started=Date.now();
 const health=setInterval(async()=>{if(checking)return;checking=true;try{const res=await fetch(`http://127.0.0.1:${port}/api/state`,{signal:AbortSignal.timeout(700)});const s=await res.json();if(res.ok&&s.pid===thisChild.pid){healthy=true;if(p.pending){write({...p,pending:false});if(!p.rolledBack)fs.writeFileSync(path.join(data,'update-notice.json'),JSON.stringify({message:`Updated to TubeRoom ${s.version}. Your setup was preserved.`}));}clearInterval(health);}}catch{}finally{checking=false;}if(!healthy&&Date.now()-started>10000){expired=true;clearInterval(health);thisChild.kill('SIGTERM');setTimeout(()=>{if(thisChild.exitCode===null)thisChild.kill('SIGKILL');},2000).unref();}},250);
 const result=await new Promise(resolve=>{thisChild.once('error',()=>resolve({code:1}));thisChild.once('exit',(code,signal)=>resolve({code,signal}));});clearInterval(health);
 if(quitting)return;
 if(p.pending&&!healthy){revert(p,'The update could not start. The previous version has been restored.');return run();}
 if(result.code===75)return run();
 if(result.code!==0||expired)process.exitCode=1;
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
