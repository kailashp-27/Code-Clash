import { Prisma, type PrismaClient } from '@prisma/client';
import { BattleError } from './battles.js';

export const BAN_THRESHOLD = 3;
const categories = ['SUSPECTED_AI', 'COPYING', 'OTHER'];
export class ModerationService {
  constructor(private prisma: PrismaClient, private reviewers: string[] = []) {}
  canReview(id: string) { return this.reviewers.includes(id); }
  private async requireReviewer(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!this.canReview(id) || !user || user.bannedAt) throw new BattleError(403, 'Moderator access required.');
  }
  async standing(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BattleError(401, 'Account unavailable.');
    const reports = await this.prisma.integrityReport.findMany({ where: { subjectId: userId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, matchId: true, problemId: true, category: true, status: true, createdAt: true, reviewedAt: true, reviewReason: true, appeal: true, appealedAt: true } });
    const cases = await this.prisma.integrityReport.groupBy({ by: ['matchId', 'problemId'], where: { subjectId: userId, status: 'CONFIRMED' } });
    return { banned: Boolean(user.bannedAt), bannedAt: user.bannedAt, reason: user.banReason, strikes: cases.length, threshold: BAN_THRESHOLD, canReview: this.canReview(userId), reports };
  }
  async targets(matchId: string, reporterId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || ![match.player1Id, match.player2Id].includes(reporterId)) throw new BattleError(404, 'Battle not found.');
    if (match.status !== 'COMPLETED') return [];
    // Reveal submission metadata only after battle completion; never opponent source or judge diagnostics.
    return this.prisma.submission.findMany({ where: { matchId, userId: reporterId === match.player1Id ? match.player2Id : match.player1Id, mode: 'SUBMIT', state: 'FINISHED' },
      select: { id: true, problemId: true, language: true, receivedAt: true, verdict: true, reports: { where: { reporterId }, select: { id: true, status: true } } }, orderBy: { sequence: 'asc' }, take: 100 });
  }
  async report(reporterId: string, body: Record<string, unknown>) {
    if (typeof body.submissionId !== 'string' || typeof body.category !== 'string' || !categories.includes(body.category) || typeof body.details !== 'string' || body.details.trim().length < 20 || body.details.length > 2000) throw new BattleError(400, 'Choose a submission and provide 20–2000 characters of specific evidence.');
    const submission = await this.prisma.submission.findUnique({ where: { id: body.submissionId }, include: { match: true } });
    if (!submission || submission.userId === reporterId || ![submission.match.player1Id, submission.match.player2Id].includes(reporterId)) throw new BattleError(404, 'Opponent submission not found.');
    if (submission.match.status !== 'COMPLETED' || submission.mode !== 'SUBMIT' || submission.state !== 'FINISHED') throw new BattleError(409, 'Reports are available for finished official submissions after the battle.');
    const previous = await this.prisma.integrityReport.findUnique({ where: { reporterId_submissionId: { reporterId, submissionId: submission.id } } });
    if (previous) return { id: previous.id, status: previous.status };
    const recent = await this.prisma.integrityReport.count({ where: { reporterId, createdAt: { gt: new Date(Date.now() - 86400000) } } });
    if (recent >= 10) throw new BattleError(429, 'Report limit reached. Please try tomorrow.');
    try {
      const report = await this.prisma.integrityReport.create({ data: { submissionId: submission.id, matchId: submission.matchId, problemId: submission.problemId, reporterId, subjectId: submission.userId, category: body.category, details: body.details.trim() } });
      return { id: report.id, status: report.status };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const saved = await this.prisma.integrityReport.findUniqueOrThrow({ where: { reporterId_submissionId: { reporterId, submissionId: submission.id } } });
        return { id: saved.id, status: saved.status };
      }
      throw e;
    }
  }
  async list(reviewerId: string) {
    await this.requireReviewer(reviewerId);
    return this.prisma.integrityReport.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: {
      reporter: { select: { username: true } }, subject: { select: { username: true } },
      submission: { select: { sourceCode: true, language: true, integrity: true, verdict: true } },
    } });
  }
  async review(reviewerId: string, reportId: string, status: unknown, reason: unknown) {
    await this.requireReviewer(reviewerId);
    if (!['CONFIRMED', 'DISMISSED'].includes(String(status)) || typeof reason !== 'string' || reason.trim().length < 20 || reason.length > 2000) throw new BattleError(400, 'Record a decision and 20–2000 characters explaining the evidence.');
    const report = await this.prisma.integrityReport.findUnique({ where: { id: reportId } });
    if (!report) throw new BattleError(404, 'Report not found.');
    if ([report.reporterId, report.subjectId].includes(reviewerId)) throw new BattleError(403, 'A reviewer cannot adjudicate their own battle.');
    // A subject-row lock serializes decisions on different reports, including ban reversals.
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${report.subjectId} FOR UPDATE`;
      await tx.integrityReport.update({ where: { id: reportId }, data: { status: String(status), reviewReason: reason.trim(), reviewerId, reviewedAt: new Date() } });
      const cases = await tx.integrityReport.groupBy({ by: ['matchId', 'problemId'], where: { subjectId: report.subjectId, status: 'CONFIRMED' } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: report.subjectId } });
      const banned = cases.length >= BAN_THRESHOLD;
      await tx.user.update({ where: { id: user.id }, data: { bannedAt: banned ? user.bannedAt ?? new Date() : null, banReason: banned ? `${cases.length} confirmed integrity violations. Contact a moderator or appeal from account standing.` : null } });
      // Cancel ongoing battles without changing ratings; all competitive entry points check the ban.
      if (banned) {
        const active = await tx.activePlayer.findUnique({ where: { userId: user.id } });
        if (active) {
          const match = await tx.match.findUniqueOrThrow({ where: { id: active.matchId } });
          await tx.$queryRaw`SELECT id FROM matches WHERE id = ${match.id} FOR UPDATE`;
          if (['IN_PROGRESS', 'DRAINING'].includes(match.status)) {
            await tx.match.update({ where: { id: match.id }, data: { status: 'CANCELLED', winnerId: null, loserId: null, endedAt: new Date(), reason: 'Account restricted after confirmed integrity violations; ratings unchanged.', player1Change: 0, player2Change: 0 } });
            await tx.activePlayer.deleteMany({ where: { matchId: match.id } });
          }
        }
      }
      return { status, strikes: cases.length, banned };
    }, { timeout: 15000 });
  }
  async appeal(userId: string, reportId: string, text: unknown) {
    if (typeof text !== 'string' || text.trim().length < 20 || text.length > 2000) throw new BattleError(400, 'Explain your appeal in 20–2000 characters.');
    const report = await this.prisma.integrityReport.findUnique({ where: { id: reportId } });
    if (!report || report.subjectId !== userId) throw new BattleError(404, 'Report not found.');
    if (report.status !== 'CONFIRMED') throw new BattleError(409, 'Only confirmed findings can be appealed.');
    await this.prisma.integrityReport.update({ where: { id: reportId }, data: { appeal: text.trim(), appealedAt: new Date() } });
    return { status: 'APPEAL_RECEIVED' };
  }
}
