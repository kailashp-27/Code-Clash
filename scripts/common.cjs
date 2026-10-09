const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function npmArgs(args) {
  if (!process.env.npm_execpath) throw new Error('Run this script through npm run.');
  return [process.env.npm_execpath, ...args];
}

function run(command, args, cwd = root, timeout) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function npm(args, cwd = root) {
  run(process.execPath, npmArgs(args), cwd);
}

function requireSupportedNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major >= 24 || (major === 22 && minor >= 12))) {
    throw new Error('Use Node.js 24 (recommended) or Node.js 22.12+. See .nvmrc.');
  }
}

module.exports = { root, npmArgs, run, npm, requireSupportedNode };
