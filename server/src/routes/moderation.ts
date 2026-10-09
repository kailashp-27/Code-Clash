import express from 'express';
import { authenticated, eligiblePlayer } from '../authentication.js';
import { BattleError } from '../battles.js';
import type { ModerationService } from '../moderation.js';
export function moderationRoutes(service: ModerationService) {
  const router = express.Router();
  router.use(authenticated);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const handle = (action: (req: express.Request, res: express.Response) => Promise<unknown>) => async (req: express.Request, res: express.Response) => {
    try { res.json(await action(req, res)); } catch (e) {
      if (e instanceof BattleError) res.status(e.status).json({ error: e.message });
      else { console.error('[integrity report]', e); res.status(500).json({ error: 'Unable to save the integrity request.' }); }
    }
  };
  router.get('/standing', handle((_req, res) => service.standing(res.locals.userId)));
  router.get('/matches/:id/targets', handle((req, res) => service.targets(String(req.params.id), res.locals.userId)));
  router.post('/reports', eligiblePlayer, handle((req, res) => service.report(res.locals.userId, req.body ?? {})));
  router.post('/reports/:id/appeal', handle((req, res) => service.appeal(res.locals.userId, String(req.params.id), req.body?.text)));
  router.get('/review', handle((_req, res) => service.list(res.locals.userId)));
  router.post('/review/:id', handle((req, res) => service.review(res.locals.userId, String(req.params.id), req.body?.status, req.body?.reason)));
  return router;
}
