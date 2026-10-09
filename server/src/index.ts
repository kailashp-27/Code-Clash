import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocketServer } from './socket.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import { prisma } from './db.js';
import { config } from './config.js';
import { BattleService } from './battles.js';
import { battleRoutes } from './routes/battles.js';
import { authenticated, eligiblePlayer } from './authentication.js';
import { ModerationService } from './moderation.js';
import { moderationRoutes } from './routes/moderation.js';

const app = express();
const battles = new BattleService(prisma, { judge0Url: config.judge0Url });

const PORT = config.port;

app.use(cors({
  origin: config.clientOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/integrity', moderationRoutes(new ModerationService(prisma, config.moderatorIds)));

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Code Clash server is running' });
});

// Local Judge0 instance URL (self-hosted via Docker)
const JUDGE0_URL = config.judge0Url;

app.get('/api/languages', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${JUDGE0_URL}/languages`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(502).json({ error: 'Judge0 failed to return supported languages' });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
    res.status(503).json({ error: 'Judge0 is unavailable. Start the local infrastructure.' });
  }
});

const practiceRequests = new Map<string, { at: number; count: number; busy: boolean }>();
app.post('/api/execute', authenticated, eligiblePlayer, async (req: Request, res: Response) => {
  const userId = String(res.locals.userId);
  let quota = practiceRequests.get(userId);
  if (!quota || Date.now() - quota.at > 60000) { quota = { at: Date.now(), count: 0, busy: false }; practiceRequests.set(userId, quota); }
  if (quota.busy || quota.count >= 6) return res.status(429).json({ error: 'Wait for your run to finish. Limit is six runs per minute.' });
  quota.busy = true; quota.count++;
  try {
    const { source_code, language_id, stdin } = req.body;
    if (!await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) return res.status(401).json({ error: 'Account not found. Please sign in again.' });

    if (typeof source_code !== 'string' || !source_code.trim() || Buffer.byteLength(source_code) > 65536 ||
      ![54, 62, 63, 71, 73, 60].includes(language_id) || (stdin !== undefined && (typeof stdin !== 'string' || Buffer.byteLength(stdin) > 65536))) {
      return res.status(400).json({ error: 'Use a supported language and at most 64 KiB of source and input.' });
    }

    console.log(`[EXECUTION] Received code in language ${language_id}`);

    const response = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code,
        language_id,
        stdin: stdin || "",
        enable_network: false, cpu_time_limit: 4, wall_time_limit: 10, memory_limit: 512000, max_file_size: 64,
      })
    });
    if (!response.ok) return res.status(502).json({ error: 'Judge0 rejected the execution request' });
    const data = await response.json();

    res.status(200).json({
      stdout: data.stdout,
      stderr: data.stderr,
      status: data.status,
      time: data.time,
      memory: data.memory,
      compile_output: data.compile_output
    });
  } catch (error) {
    console.error('Execution error:', error);
    res.status(503).json({ error: 'Judge0 is unavailable. Start the local infrastructure.' });
  } finally { quota.busy = false; }
});

app.use('/api', battleRoutes(battles));
setInterval(() => { for (const [id, quota] of practiceRequests) if (!quota.busy && Date.now() - quota.at > 60000) practiceRequests.delete(id); }, 60000).unref();

const httpServer = createServer(app);
initSocketServer(httpServer, prisma, { jwtSecret: config.jwtSecret, clientOrigins: config.clientOrigins, battles });
battles.start();
httpServer.on('close', () => battles.stop());

httpServer.listen(PORT, () => {
  console.log(`Code Clash server is running on http://localhost:${PORT}`);
  console.log(`Judge0 endpoint: ${JUDGE0_URL}`);
});
