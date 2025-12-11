import express from 'express';
import { query } from '../db.js';

const router = express.Router();

function isAuthorized(req) {
  const tokenHeader = req.headers['x-admin-token'] || '';
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const candidate = tokenHeader || bearer;
  const expected = process.env.ADMIN_TOKEN || '';
  return expected && candidate && candidate === expected;
}

router.get('/token-usage', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ errorCode: 'UNAUTHORIZED', message: 'Admin token required.' });
  }

  const rawDays = parseInt(req.query.days || '7', 10);
  const windowDays = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 7;

  try {
    const { rows } = await query(
      `SELECT
          workspace_id,
          scenario_id,
          agent_id,
          provider,
          model,
          provider_model_id,
          COUNT(*) AS calls,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(total_cost), 0) AS total_cost
        FROM token_usage
       WHERE created_at >= now() - ($1::int || ' days')::interval
       GROUP BY workspace_id, scenario_id, agent_id, provider, model, provider_model_id
       ORDER BY total_tokens DESC NULLS LAST, calls DESC`,
      [windowDays],
    );

    return res.json({ windowDays, records: rows });
  } catch (err) {
    console.error('[ADMIN_USAGE_ERROR]', err?.message);
    return res.status(500).json({ errorCode: 'ADMIN_USAGE_FAILED', message: 'Failed to load usage data.' });
  }
});

export default router;
