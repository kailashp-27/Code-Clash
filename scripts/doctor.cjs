const { createRequire } = require('node:module');
const path = require('node:path');
const { root, requireSupportedNode } = require('./common.cjs');
const serverRequire = createRequire(path.join(root, 'server', 'package.json'));

async function main() {
  requireSupportedNode();
  serverRequire('dotenv').config({ path: path.join(root, 'server', '.env'), quiet: true });
  const pg = serverRequire('pg');
  const database = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  let failed = false;
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
    await database.connect();
    const result = await database.query("SELECT to_regclass('public.users') AS users, to_regclass('public.problems') AS problems, to_regclass('public.matches') AS matches, to_regclass('public.submissions') AS submissions, to_regclass('public.match_problems') AS assignments, to_regclass('public.active_players') AS active_players, to_regclass('public.user_achievements') AS achievements");
    if (Object.values(result.rows[0]).some(value => value === null)) throw new Error('Schema missing; run npm run db:push');
    console.log('PASS application database and schema');
  } catch {
    failed = true;
    console.error('FAIL application database/schema. Check DATABASE_URL, start PostgreSQL, then run npm run db:push.');
  } finally {
    await database.end().catch(() => {});
  }
  const checks = [
    ['backend', `http://localhost:${process.env.PORT || 5000}/health`, value => value.status === 'ok'],
    ['Judge0', `${process.env.JUDGE0_URL || 'http://localhost:2358'}/languages`, value => Array.isArray(value) && value.length > 0],
    ['frontend', 'http://localhost:5173', null],
  ];
  for (const [name, url, validate] of checks) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('HTTP failure');
      if (validate && !validate(await response.json())) throw new Error('Unexpected response');
      if (!validate && !(await response.text()).includes('<title>Code Clash</title>')) throw new Error('Unexpected frontend');
      console.log(`PASS ${name}`);
    } catch {
      failed = true;
      console.error(`FAIL ${name} at ${url}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => {
  console.error(`Doctor failed: ${error.message}. Run npm run setup first.`);
  process.exitCode = 1;
});
