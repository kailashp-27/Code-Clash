const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { npm, root } = require('./common.cjs');
try {
  npm(['run', 'build'], path.join(root, 'server'));
  const result = spawnSync(process.execPath, ['--test', 'tests/battle.integration.test.cjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CODECLASH_INTEGRATION: '1' },
  });
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
