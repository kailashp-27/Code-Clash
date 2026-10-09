import express from 'express';
import { authenticated } from '../authentication.js';
import { BattleError, type BattleService } from '../battles.js';
export function battleRoutes(service: BattleService) {
  const router = express.Router();
  router.use(authenticated);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const handle = (action: (req: express.Request, res: express.Response) => Promise<void>) => async (req: express.Request, res: express.Response) => {
    try { await action(req, res); } catch (error) {
      if (error instanceof BattleError) { if (error.status === 429) res.setHeader('Retry-After', '10'); res.status(error.status).json({ error: error.message }); }
      else { console.error('[battle route]', error); res.status(500).json({ error: 'Unable to process the battle request. Please retry.' }); }
    }
  };
  router.get('/matches/active', handle(async (_req, res) => { res.json(await service.active(res.locals.userId)); }));
  router.get('/matches/:id', handle(async (req, res) => { res.json(await service.snapshot(String(req.params.id), res.locals.userId)); }));
  for (const [path, mode] of [['runs', 'RUN'], ['submissions', 'SUBMIT']] as const) router.post(`/matches/:id/${path}`, handle(async (req, res) => {
    const submission = await service.submit(String(req.params.id), res.locals.userId, req.body, mode);
    res.setHeader('Location', `/api/submissions/${submission.id}`); res.status(202).json(submission);
  }));
  router.get('/submissions/:id', handle(async (req, res) => { res.json(await service.submission(String(req.params.id), res.locals.userId)); }));
  return router;
}
