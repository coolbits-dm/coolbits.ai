import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { workspaceServiceRepo } from '../repos/workspaceServiceRepo.js';
import { buildIntegrationSummary } from '../services/integrationSummaryService.js';

const router = express.Router();

// GET /api/workspaces/:workspaceId/services/summary
router.get('/workspaces/:workspaceId/services/summary', requireUser, async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const summary = await buildIntegrationSummary(workspaceId);
    return res.json(summary);
  } catch (err) {
    console.error('[SERVICE_SUMMARY_ERROR]', { workspaceId, error: err?.message });
    return res.status(500).json({ error: 'SUMMARY_ERROR', message: 'Could not fetch services summary.' });
  }
});

// POST /api/workspaces/:workspaceId/services/:code/connect
router.post('/workspaces/:workspaceId/services/:code/connect', requireUser, async (req, res) => {
  const { workspaceId, code } = req.params;
  const userId = req.userEmail || null;

  try {
    await workspaceServiceRepo.upsert({
      workspaceId,
      serviceCode: code,
      status: 'connected',
      connectedAs: 'Manual',
      updatedBy: userId,
    });

    console.log('[SERVICE_CONNECT]', { workspaceId, code, userId });

    return res.json({
      ok: true,
      status: 'connected',
      connectedAs: 'Manual',
    });
  } catch (err) {
    console.error('[SERVICE_CONNECT_ERROR]', {
      workspaceId,
      code,
      userId,
      error: err?.message,
    });

    return res.status(500).json({
      error: 'CONNECT_ERROR',
      message: 'Could not save service connection.',
    });
  }
});

export default router;
