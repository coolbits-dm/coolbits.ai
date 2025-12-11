import express from 'express';
import { getLatestProposals } from '../repositories/ppcRepo.js';

const router = express.Router();

router.get('/proposals', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.workspaceId || null;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId_required' });
    }
    const limit = Number(req.query.limit || 20);
    const proposals = await getLatestProposals(workspaceId, { limit });
    res.json({ workspaceId, proposals });
  } catch (err) {
    next(err);
  }
});

export default router;
