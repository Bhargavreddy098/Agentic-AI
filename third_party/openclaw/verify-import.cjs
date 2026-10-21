const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ASI-IMPORT-MANIFEST.json'), 'utf8'));
let bytes = 0;
for (const item of manifest.files) {
  const file = path.resolve(root, item.path);
  if (!file.startsWith(root + path.sep)) throw new Error('Import path escapes snapshot');
  const contents = fs.readFileSync(file);
  if (contents.length !== item.bytes || crypto.createHash('sha256').update(contents).digest('hex') !== item.sha256) {
    throw new Error('Imported file differs: ' + item.path);
  }
  bytes += contents.length;
}
console.log(JSON.stringify({ ok: true, commit: manifest.commit, files: manifest.files.length, bytes }, null, 2));
