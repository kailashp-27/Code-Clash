// Disposable local preview for real Judge0 + API + browser verification.
// No application accounts or tables are modified. Type finish, then stop.
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const readline = require('node:readline');
const root = path.resolve(__dirname, '..');
require(path.join(root, 'server/node_modules/dotenv')).config({ path: path.join(root, 'server/.env'), quiet: true });
const pg = require(path.join(root, 'server/node_modules/pg'));
const { io } = require(path.join(root, 'client/node_modules/socket.io-client'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const name = `codeclash_preview_${randomUUID().replaceAll('-', '')}`;
const original = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(original); adminUrl.pathname = '/postgres';
const isolated = new URL(original); isolated.pathname = `/${name}`;
const admin = new pg.Client({ connectionString: adminUrl.href });
const children = [], sockets = []; let created = false, cleaned = false;
async function cleanup() {
  if (cleaned) return; cleaned = true;
  for (const socket of sockets) socket.disconnect();
  for (const child of children) child.kill();
  await delay(500);
  if (created) { if (!/^codeclash_preview_[a-f0-9]{32}$/.test(name) || name === decodeURIComponent(original.pathname.slice(1))) throw new Error('Unsafe cleanup target'); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  await admin.end();
}
async function waitUrl(url) { for (let i = 0; i < 45; i++) { try { const res = await fetch(url); if (res.ok) return; } catch {} await delay(500); } throw new Error('Preview startup failed'); }
const account = { email: 'arena-preview@example.test', password: 'LocalPreviewOnly123!', username: 'ArenaPreview' };
async function main() {
  await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`); created = true;
  execFileSync(process.execPath, [path.join(root, 'server/node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(root, 'server'), env: { ...process.env, DATABASE_URL: isolated.href }, stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(root, 'client/scripts/copy-monaco.cjs')]);
  const env = { ...process.env, DATABASE_URL: isolated.href, PORT: '5348', CLIENT_ORIGINS: 'http://127.0.0.1:5347', API_PROXY_TARGET: 'http://127.0.0.1:5348' };
  children.push(spawn(process.execPath, ['dist/index.js'], { cwd: path.join(root, 'server'), env, stdio: 'ignore', windowsHide: true }));
  children.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5347'], { cwd: path.join(root, 'client'), env, stdio: 'ignore', windowsHide: true }));
  await waitUrl('http://127.0.0.1:5348/health'); await waitUrl('http://127.0.0.1:5347');
  async function api(route, token, body) {
    const response = await fetch(`http://127.0.0.1:5348${route}`, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `${response.status}`); return data;
  }
  const a = await api('/api/auth/register', null, account), b = await api('/api/auth/register', null, { ...account, email: 'opponent-preview@example.test', username: 'CircuitRival' });
  for (const auth of [a, b]) {
    const socket = io('http://127.0.0.1:5348', { auth: { token: auth.token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  }
  const found = new Promise(resolve => sockets[0].once('match_found', resolve));
  sockets[0].emit('join_queue'); sockets[1].emit('join_queue');
  const match = await found;
  const fixture = { url: 'http://127.0.0.1:5347', matchId: match.roomId, ...account };
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true }); fs.writeFileSync(path.join(root, '.cache/preview-session.json'), JSON.stringify(fixture));
  console.log('READY: disposable preview http://127.0.0.1:5347; credentials in .cache/preview-session.json. Commands: finish, stop');
  const source = {
    'Two Sum': "const a=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);const n=a[0],target=a[1],seen=new Map();for(let i=0;i<n;i++){const v=a[i+2];if(seen.has(target-v)){console.log(seen.get(target-v),i);break;}seen.set(v,i);}",
    'Balanced Brackets': "const s=require('fs').readFileSync(0,'utf8').trim();const stack=[],pairs={')':'(',']':'[','}':'{'};let ok=true;for(const c of s){if('([{'.includes(c))stack.push(c);else if(stack.pop()!==pairs[c]){ok=false;break;}}console.log(ok&&stack.length===0?'true':'false');",
  };
  async function finish() {
    for (const p of match.problems) {
      // RUN has no score; SUBMIT uses private tests via the real Docker judge.
      for (const mode of ['runs', 'submissions']) {
        const submission = await api(`/api/matches/${match.roomId}/${mode}`, a.token, { problemId: p.id, language: 'javascript', sourceCode: source[p.title], requestId: randomUUID() });
        let detail; for (let i = 0; i < 200; i++) { detail = await api(`/api/submissions/${submission.id}`, a.token); if (detail.state === 'FINISHED') break; await delay(500); }
        if (detail?.verdict !== 'ACCEPTED') throw new Error(`${p.title} ${mode}: ${detail?.verdict}`);
        if (mode === 'submissions' && detail.examples.length !== p.examples.length) throw new Error('Public result exposed hidden diagnostics');
        console.log(`PASS real Judge0 ${p.title} ${mode}: ${detail.passed}/${detail.total}`);
      }
    }
    const result = await api(`/api/matches/${match.roomId}`, a.token), profile = await api('/api/profile', a.token);
    if (result.result?.outcome !== 'win' || profile.rating !== 1216 || profile.solvedProblems !== 2 || !profile.achievements.some(x => x.id === 'first-win' && x.unlocked)) throw new Error('Result/profile mismatch');
    console.log('PASS full flow: persisted victory, +16 Elo, 2 solved problems, real achievements. Preview stays open for browser checks.');
  }
  const input = readline.createInterface({ input: process.stdin });
  let busy = false;
  input.on('line', async line => { if (busy) return; busy = true; try { if (line.trim() === 'finish') await finish(); if (line.trim() === 'stop') { input.close(); await cleanup(); process.exit(0); } } catch (e) { console.error('FAIL', e.message); } finally { busy = false; } });
  process.on('SIGINT', () => { void cleanup().finally(() => process.exit()); });
}
main().catch(async e => { console.error(e.message); await cleanup(); process.exitCode = 1; });
