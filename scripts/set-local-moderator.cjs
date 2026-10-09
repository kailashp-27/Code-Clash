// Explicit local role provisioning; existing moderator IDs are preserved.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'server/.env');
require('../server/node_modules/dotenv').config({ path: envPath, quiet: true });
const { Client } = require('../server/node_modules/pg');
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: node scripts/set-local-moderator.cjs <local-account-email>');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await db.connect();
    const found = await db.query('SELECT id, username FROM users WHERE email = $1', [email]);
    if (!found.rows[0]) throw new Error('Local account not found. Register it first.');
    const user = found.rows[0];
    if (!/^[a-f0-9-]{36}$/i.test(user.id)) throw new Error('Unexpected account ID');
    const ids = [...new Set([...(process.env.MODERATOR_USER_IDS || '').split(',').filter(Boolean), user.id])];
    let text = fs.readFileSync(envPath, 'utf8');
    text = text.replace(/^MODERATOR_USER_IDS=.*\r?\n?/gm, '');
    fs.writeFileSync(envPath, text.trimEnd() + `\nMODERATOR_USER_IDS=${ids.join(',')}\n`);
    console.log(`Local moderator enabled: ${user.username}. Restart the backend to apply.`);
  } finally { await db.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
