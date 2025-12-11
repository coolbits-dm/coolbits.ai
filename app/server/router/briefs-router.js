import express from 'express';
import { findByWorkspace } from '../repositories/briefsRepo.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.workspaceId || null;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId_required' });
    }
    const status = req.query.status || null;
    const briefs = await findByWorkspace(workspaceId, { status });
    res.json({ workspaceId, briefs });
  } catch (err) {
    next(err);
  }
});

export default router;
