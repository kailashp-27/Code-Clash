import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './db.js';

export function authenticated(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
    const claims = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || typeof claims.userId !== 'string') throw new Error('Invalid identity');
    res.locals.userId = claims.userId;
    next();
  } catch { res.status(401).json({ error: 'Please sign in again.' }); }
}

export async function eligiblePlayer(_req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: res.locals.userId }, select: { bannedAt: true, banReason: true } });
    if (!user) return void res.status(401).json({ error: 'Account unavailable.' });
    if (user.bannedAt) return void res.status(403).json({ error: `Account banned from competitive play. ${user.banReason ?? ''}` });
    next();
  } catch { res.status(503).json({ error: 'Unable to check account standing. Please retry.' }); }
}
