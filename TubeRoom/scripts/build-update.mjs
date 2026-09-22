// node scripts/build-update.mjs [output-file] [release-notes]
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {FORMAT,FILES,validateBundle} from '../updater.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const bundle={format:FORMAT,version:pkg.version,notes:process.argv[3]||'TubeRoom improvements.',files:FILES.map(name=>{const content=fs.readFileSync(path.join(root,name),'utf8');return {path:name,content,sha256:crypto.createHash('sha256').update(content).digest('hex')};})};
validateBundle(bundle);const output=process.argv[2]||path.join(root,`TubeRoom-${pkg.version}.tuberoom-update.json`);fs.writeFileSync(output,JSON.stringify(bundle));console.log(output);
