import express from 'express';
import { prisma } from '../db.js';
import { authenticated } from '../authentication.js';
import { getProfile } from '../profile-data.js';
const router = express.Router();
router.get('/leaderboard', authenticated, async (_req, res) => {
  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({ orderBy: [{ rating: 'desc' }, { createdAt: 'asc' }], take: 100,
        select: { id: true, username: true, rating: true, wins: true, losses: true, draws: true } }), prisma.user.count(),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ total, players: users.map((user, index) => ({ ...user, position: users.findIndex(u => u.rating === user.rating) + 1,
      isYou: user.id === res.locals.userId, order: index + 1 })) });
  } catch { res.status(500).json({ error: 'Unable to load the leaderboard.' }); }
});
router.get('/', authenticated, async (_req, res) => {
  try {
    const data = await getProfile(prisma, res.locals.userId);
    if (!data) return res.status(404).json({ error: 'Account not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) { console.error('[profile]', error); res.status(500).json({ error: 'Unable to load profile. Please retry.' }); }
});
export default router;
