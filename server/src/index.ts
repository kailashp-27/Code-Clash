import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createServer } from 'http';
import { initSocketServer } from './socket.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import { prisma } from './db.js';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'GameGrid Server is running' });
});

// Local Judge0 instance URL (self-hosted via Docker)
const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';

app.get('/api/languages', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${JUDGE0_URL}/languages`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
    res.status(500).json({ error: 'Failed to fetch supported languages' });
  }
});

app.post('/api/execute', async (req: Request, res: Response) => {
  try {
    const { source_code, language_id, stdin } = req.body;

    if (!source_code || !language_id) {
      return res.status(400).json({ error: 'source_code and language_id are required.' });
    }

    console.log(`[EXECUTION] Received code in language ${language_id}`);

    const response = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code,
        language_id,
        stdin: stdin || "",
      })
    });
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
    res.status(500).json({ error: 'Failed to execute code' });
  }
});

const httpServer = createServer(app);
initSocketServer(httpServer, prisma);

httpServer.listen(PORT, () => {
  console.log(`Code Fight server is running on http://localhost:${PORT}`);
  console.log(`Judge0 endpoint: ${JUDGE0_URL}`);
});
