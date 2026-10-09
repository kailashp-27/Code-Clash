const { spawnSync } = require('node:child_process');
const path = require('node:path');
// Bound native compiler parallelism and inherited Node worker heaps on laptops.
const result = spawnSync(process.execPath, ['--max-old-space-size=512', path.join(__dirname, '../node_modules/vite/bin/vite.js'), 'build'], {
  stdio: 'inherit', env: { ...process.env, RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || '1' },
});
process.exitCode = result.status ?? 1;
