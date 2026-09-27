// Publish an allowlisted bundle, never the repository root or local credentials.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.deploy', 'site');
if (fs.existsSync(output)) {
  // Keep prior bundles recoverable, rather than recursively deleting a directory.
  fs.renameSync(output, path.join(root, '.deploy', 'previous-' + Date.now()));
}
fs.mkdirSync(output, {recursive:true});
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
let count=0;
for(const name of files) {
  if(!(/^[^/]+\.(?:html|css|js)$/.test(name)||name==='_headers'||name==='robots.txt'||/^assets\/.+\.(?:png|jpe?g|webp|svg|ico|mp4|woff2?)$/i.test(name)))continue;
  const source=path.resolve(root,name),target=path.resolve(output,name);
  if(!source.startsWith(root+path.sep)||!target.startsWith(output+path.sep)||fs.lstatSync(source).isSymbolicLink())throw new Error('Invalid asset path');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);count++;
}
console.log(`Prepared ${count} public files in ${output}`);
