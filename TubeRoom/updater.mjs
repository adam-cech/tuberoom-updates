import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const FORMAT='tuberoom-update-v1';
export const FILES=['package.json','server.mjs','engine.mjs','updater.mjs','public/index.html','public/app.js','public/style.css'];
export const LIMIT=2*1024*1024;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const versionOK=v=>typeof v==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
export const newer=(a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i];}return false;};
export function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
export function atomicJSON(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
export function validateBundle(bundle){
 if(!bundle||bundle.format!==FORMAT||!versionOK(bundle.version)||!Array.isArray(bundle.files))throw Error('This is not a supported TubeRoom update file.');
 if(Buffer.byteLength(JSON.stringify(bundle))>LIMIT)throw Error('Update exceeds the 2 MB limit.');
 const seen=new Set();for(const file of bundle.files){if(!file||!FILES.includes(file.path)||seen.has(file.path))throw Error('Unexpected or duplicate file in the update.');seen.add(file.path);if(typeof file.content!=='string'||!file.content.length||hash(file.content)!==file.sha256)throw Error('Update integrity check failed: '+file.path);}
 if(seen.size!==FILES.length)throw Error('Update is incomplete. No app files have been changed.');
 const pkg=JSON.parse(bundle.files.find(f=>f.path==='package.json').content);if(pkg.name!=='tube-room'||pkg.version!==bundle.version)throw Error('Update version does not match its app package.');
 return {...bundle,notes:String(bundle.notes||'').slice(0,3000)};
}
export function releasePath(data,id){if(!/^(?:\d{1,4}\.){2}\d{1,4}-[a-f0-9]{16}$/.test(id||''))throw Error('Invalid release identifier.');return path.join(data,'releases',id);}
export function pointer(data){return readJSON(path.join(data,'current-release.json'),null);}
export function changePointer(data,value){atomicJSON(path.join(data,'current-release.json'),value);}
export function installBundle(data,bundle,currentVersion){
 bundle=validateBundle(bundle);if(!newer(bundle.version,currentVersion))throw Error('This update is not newer than the installed version.');
 const id=bundle.version+'-'+hash(JSON.stringify(bundle.files)).slice(0,16),dest=releasePath(data,id),stage=dest+'.staging';fs.mkdirSync(path.dirname(dest),{recursive:true});fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage);
 try{for(const file of bundle.files){const target=path.join(stage,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.content);}
  for(const name of ['server.mjs','engine.mjs','updater.mjs','public/app.js']){const check=spawnSync(process.execPath,['--check',path.join(stage,name)],{timeout:5000,encoding:'utf8'});if(check.status!==0)throw Error('Update has a JavaScript syntax error. Your current app was kept.');}
  if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});fs.renameSync(stage,dest);
  const old=pointer(data);changePointer(data,{current:id,previous:old?.current||null,pending:true,version:bundle.version});return {version:bundle.version,id};
 }catch(e){fs.rmSync(stage,{recursive:true,force:true});throw e;}
}
export function rollback(data){const p=pointer(data);if(!p?.current)throw Error('There is no installed update to roll back.');changePointer(data,{current:p.previous||null,previous:null,pending:!!p.previous,rolledBack:true});atomicJSON(path.join(data,'update-notice.json'),{message:'The previous version was restored. Your setup was preserved.'});return {ok:true};}
export function updaterInfo(data,version){const pref=readJSON(path.join(data,'update-source.json'),{}),p=pointer(data);return {version,source:pref.url||'',managed:process.env.TUBEROOM_MANAGED==='1',canRollback:!!p?.current,notice:readJSON(path.join(data,'update-notice.json'),{}).message||''};}
export function setSource(data,value){let url=null;if(value){try{url=new URL(value);}catch{throw Error('Enter a valid HTTPS update address.');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Updates require an HTTPS address without credentials.');}atomicJSON(path.join(data,'update-source.json'),{url:url?.href||''});}
export async function fetchUpdate(data,version){
 const url=readJSON(path.join(data,'update-source.json'),{}).url;if(!url)throw Error('Online updates are not connected yet. Install an update file below, or connect a publishing source.');
 const res=await fetch(url,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Could not check updates (HTTP '+res.status+'). Your current app is unchanged.');
 const chunks=[];let bytes=0;for await(const chunk of res.body){bytes+=chunk.length;if(bytes>LIMIT)throw Error('Update download exceeds the size limit.');chunks.push(chunk);}
 const bundle=validateBundle(JSON.parse(Buffer.concat(chunks).toString('utf8')));return {available:newer(bundle.version,version),version:bundle.version,notes:bundle.notes,bundle};
}
