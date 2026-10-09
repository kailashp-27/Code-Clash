const path = require('node:path');
const { root, run } = require('./common.cjs');

try {
  const action = process.argv[2];
  if (!['up', 'down'].includes(action)) throw new Error('Expected up or down.');
  run('docker', ['info', '--format', '{{.ServerVersion}}'], root, 15000);
  const files = [path.join(root, 'compose.yml'), path.join(root, 'judge0', 'judge0-v1.13.1', 'docker-compose.yml')];
  if (action === 'down') files.reverse();
  for (const file of files) {
    run('docker', ['compose', '-f', file, ...(action === 'up' ? ['up', '-d', '--wait', '--wait-timeout', '120'] : ['down'])]);
  }
  if (action === 'up') console.log('Containers started. Judge0 may need extra initialization time; run npm run doctor after starting the app.');
} catch (error) {
  console.error(`Infrastructure command failed: ${error.message}`);
  console.error('Make sure Docker Desktop is running with Linux containers.');
  process.exitCode = 1;
}
