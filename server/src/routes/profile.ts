import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const router = express.Router();
const JWT_SECRET = (process.env.JWT_SECRET || 'supersecretjwtkey') as string;

router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1] as string;
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        matchesAsPlayer1: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { player2: { select: { username: true } }, winner: { select: { id: true } } }
        },
        matchesAsPlayer2: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { player1: { select: { username: true } }, winner: { select: { id: true } } }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const totalBattles = user.wins + user.losses;
    const winRate = totalBattles > 0 ? ((user.wins / totalBattles) * 100).toFixed(1) : 0;

    // Combine matches
    const allMatches = [
      ...user.matchesAsPlayer1.map(m => ({
        id: m.id,
        opponent: m.player2?.username || 'Unknown',
        isWin: m.winnerId === userId,
        ratingChange: m.winnerId === userId ? m.winnerRatingChange : m.loserRatingChange,
        createdAt: m.createdAt
      })),
      ...user.matchesAsPlayer2.map(m => ({
        id: m.id,
        opponent: m.player1?.username || 'Unknown',
        isWin: m.winnerId === userId,
        ratingChange: m.winnerId === userId ? m.winnerRatingChange : m.loserRatingChange,
        createdAt: m.createdAt
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    res.json({
      rating: user.rating,
      wins: user.wins,
      losses: user.losses,
      totalBattles,
      winRate,
      recentMatches: allMatches
    });
  } catch (error) {
    console.error('[Profile Fetch Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
