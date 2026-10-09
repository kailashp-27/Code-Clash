const { spawn } = require('node:child_process');
const { root, npmArgs, requireSupportedNode } = require('./common.cjs');
const path = require('node:path');

requireSupportedNode();
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === 'win32') {
      // Terminate only the process trees launched by this script.
      if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Child already exited. */ }
    }
  }
}
for (const project of ['server', 'client']) {
  const child = spawn(process.execPath, npmArgs(['run', 'dev']), {
    cwd: path.join(root, project),
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('Code Clash: http://localhost:5173 (Ctrl+C stops both processes)');
