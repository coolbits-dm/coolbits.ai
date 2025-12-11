import express from 'express';
import { fetchCampaignSummary, ingestDailyStatsFromSummary } from '../services/googleAdsService.js';

const router = express.Router();

// POST /api/dev/ads/ingest
// Body: { workspaceId, period_from?, period_to? }
router.post('/ingest', async (req, res, next) => {
  try {
    const { workspaceId, period_from, period_to } = req.body || {};
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId_required' });
    }

    const summary = await fetchCampaignSummary(workspaceId, {
      period_from,
      period_to,
    });

    const rows = await ingestDailyStatsFromSummary(workspaceId, summary);

    return res.json({
      workspaceId,
      period_from: summary.period_from,
      period_to: summary.period_to,
      campaigns_count: summary.campaigns?.length || 0,
      rows_upserted: rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
