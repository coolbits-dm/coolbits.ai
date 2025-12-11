import express from 'express';
import { getLatestSummary } from '../repositories/analyticsRepo.js';

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.workspaceId || null;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId_required' });
    }
    const summary = await getLatestSummary(workspaceId);
    if (!summary) {
      return res.status(404).json({ error: 'summary_not_found' });
    }
    res.json({ workspaceId, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
