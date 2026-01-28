import express from 'express';
import { requireUser } from '../middleware/auth.js';
import {
  getCouncilRegistry,
  getCouncilSummary,
  getCouncilPerformanceSummary,
  runCouncilAgents,
} from '../services/councilService.js';
import { getPlanForUser, getCurrentPeriodForUser } from '../services/billingService.js';

const router = express.Router();

router.use(requireUser);

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function resolveWorkspace(req, res) {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) {
    res.status(403).json({ error: 'workspace_not_bound' });
    return null;
  }
  const requested = req.params.workspaceId || req.query.workspaceId || req.body?.workspaceId || null;
  if (requested) {
    const normalized = String(requested).trim();
    if (normalized && normalized !== workspaceId) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
  }
  return workspaceId;
}

router.get('/registry', async (_req, res, next) => {
  try {
    const councils = await getCouncilRegistry();
    res.json({ councils });
  } catch (err) {
    next(err);
  }
});

async function handlePerformanceSummary(req, res) {
  try {
    const workspaceId = resolveWorkspace(req, res);
    if (!workspaceId) return;
    const rawRange = (req.query?.range || '').toString().toLowerCase();
    const validRanges = ['billing_period', 'last_7_days', 'last_30_days'];
    const range = validRanges.includes(rawRange) ? rawRange : 'billing_period';

    let from = null;
    let to = null;

    if (range === 'last_7_days' || range === 'last_30_days') {
      to = new Date();
      from = new Date(to);
      const days = range === 'last_7_days' ? 7 : 30;
      from.setUTCDate(from.getUTCDate() - days);
    } else {
      try {
        const plan = await getPlanForUser(req.user?.id || req.user);
        const period = await getCurrentPeriodForUser(req.user?.id || req.user, plan?.planCode);
        if (period?.start && period?.end) {
          from = period.start;
          to = period.end;
        }
      } catch (err) {
        console.error('[COUNCIL_PERFORMANCE_RANGE_BILLING_ERROR]', err?.message);
      }
    }

    const summary = await getCouncilPerformanceSummary(workspaceId, { from, to });
    if (!summary) {
      return res.status(404).json({ error: 'council_not_found' });
    }
    const result = {
      workspaceId,
      totalTokens: summary.totalTokens ?? 0,
      totalCostUsd: summary.totalCostUsd ?? 0,
      lastUpdatedAt: summary.lastUpdatedAt || new Date().toISOString(),
      agents: (summary.agents || []).map((a) => ({
        id: a.id,
        name: a.name || a.id,
        status: a.status || 'idle',
        lastRunAt: a.lastRunAt || null,
        tokensUsed: a.tokensUsed ?? 0,
        costUsd: a.costUsd ?? 0,
      })),
      period: {
        range,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
    };
    console.log('[COUNCIL_PERFORMANCE_RANGE]', {
      workspaceId,
      range,
      from: result.period.from,
      to: result.period.to,
    });
    res.json(result);
  } catch (err) {
    console.error('GET /councils/performance/summary error', err);
    res.status(500).json({ error: 'Internal error in council summary' });
  }
}

// Primary path (console/chat)
router.get('/performance/summary', handlePerformanceSummary);
// Allow variant paths that may come from older frontends (singular /council or path param)
router.get('/performance/summary/:workspaceId', handlePerformanceSummary);
router.get('/council/performance/summary', handlePerformanceSummary);

router.get('/:slug/summary', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const workspaceId = resolveWorkspace(req, res);
    if (!workspaceId) return;
    const result = await getCouncilSummary({ slug, workspaceId });
    if (!result) {
      return res.status(404).json({ error: 'council_not_found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/agents/run', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req, res);
    if (!workspaceId) return;
    const agentId = req.body?.agentId ?? null;
    const usage = req.body?.usage ?? null;
    const councilSlug = req.body?.councilSlug || 'performance';
    const userId = req.user?.id || null;

    const runResult = await runCouncilAgents({
      workspaceId,
      agentId,
      usage,
      userId,
      councilSlug,
    });
    return res.status(202).json({
      workspaceId,
      agentId,
      runId: runResult.runId,
      status: runResult.status || 'queued',
    });
  } catch (err) {
    console.error('POST /councils/agents/run error', err);
    res.status(500).json({ error: 'Internal error running council agents' });
  }
});

export default router;
