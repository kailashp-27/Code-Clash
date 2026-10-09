const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { root, npm, requireSupportedNode } = require('./common.cjs');

try {
  requireSupportedNode();
  for (const project of ['server', 'client']) {
    const directory = path.join(root, project);
    const destination = path.join(directory, '.env');
    if (!fs.existsSync(destination)) {
      let contents = fs.readFileSync(path.join(directory, '.env.example'), 'utf8');
      contents = contents.replace('replace-with-a-random-secret', randomBytes(32).toString('hex'));
      fs.writeFileSync(destination, contents, { flag: 'wx' });
      console.log(`Created ${project}/.env`);
    } else if (project === 'server') {
      const contents = fs.readFileSync(destination, 'utf8');
      if (/^\s*JWT_SECRET\s*=\s*["']?replace-with-a-random-secret["']?\s*$/m.test(contents)) {
        fs.writeFileSync(destination, contents.replace(/^\s*JWT_SECRET\s*=.*$/m, `JWT_SECRET="${randomBytes(32).toString('hex')}"`));
        console.log('Replaced the JWT secret placeholder in server/.env.');
      } else if (!/^\s*JWT_SECRET\s*=/m.test(contents)) {
        fs.appendFileSync(destination, `\nJWT_SECRET="${randomBytes(32).toString('hex')}"\n`);
        console.log('Added a local JWT secret to server/.env. Existing database settings preserved.');
      }
    }
    npm(['ci', '--cache', path.join(root, '.cache', 'npm'), '--no-audit', '--no-fund'], directory);
  }
  npm(['run', 'db:generate'], path.join(root, 'server'));
  console.log('\nSetup complete. Start Docker Desktop, run npm run infra:up, then npm run db:push and npm run dev.');
  console.log('Existing .env files are preserved. Check DATABASE_URL before running db:push.');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
}
