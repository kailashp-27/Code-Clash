const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageFile = require.resolve('monaco-editor/package.json', { paths: [root] });
const source = path.join(path.dirname(packageFile), 'min', 'vs');
const target = path.join(root, 'public', 'monaco', 'vs');
const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
const marker = path.join(root, 'public', 'monaco', 'version.txt');
if (!fs.existsSync(path.join(target, 'loader.js')) || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== version) {
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  fs.writeFileSync(marker, version);
}
