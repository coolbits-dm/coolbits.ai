import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { runScenario, listAgents } from '../services/agentService.js';
import { getUserByEmail } from '../userStore.js';
import {
  getPlanForUser,
  getCurrentPeriodForUser,
  getTokensUsed,
  getUsageStateForUser,
} from '../services/billingService.js';
import { rateLimitAgentsUserWorkspace } from '../middleware/rateLimit.js';
import { findRunsForWorkspace } from '../repositories/agentRunsRepo.js';
import {
  getActiveContext,
  ensureActiveContext,
  buildContextActivationRequest,
  isActiveContextStrict,
} from '../services/activeContextService.js';

const router = express.Router();

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function respondError(res, status, errorCode, message) {
  return res.status(status).json({ errorCode, message });
}

router.get('/registry', requireUser, rateLimitAgentsUserWorkspace, async (_req, res) => {
  const { agents, comingSoon } = listAgents();
  return res.json({ agents, comingSoon });
});

router.post('/run', requireUser, rateLimitAgentsUserWorkspace, async (req, res) => {
  try {
    const scenarioId = typeof req.body?.scenarioId === 'string' && req.body.scenarioId.trim()
      ? req.body.scenarioId.trim()
      : 'googleAdsAudit';
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }

    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return respondError(res, 401, 'UNAUTHORIZED', 'User not found.');

    let activeContext = getActiveContext(user.id);
    if (!activeContext || activeContext.status !== 'active') {
      if (isActiveContextStrict()) {
        return respondError(res, 409, 'ACTIVE_CONTEXT_REQUIRED', 'Activate context before running agents.');
      }
      try {
        const desired = buildContextActivationRequest({
          body: req.body,
          workspaceId,
          projectId: req.body?.projectId || null,
        });
        activeContext = await ensureActiveContext(user.id, desired, {
          reason: 'missing_active_context',
          projectId: req.body?.projectId || null,
        });
      } catch (err) {
        return respondError(res, 409, 'ACTIVE_CONTEXT_REQUIRED', 'Activate context before running agents.');
      }
    }

    const { planCode, limits } = await getPlanForUser(user.id || user.email);
    const period = await getCurrentPeriodForUser(user.id, planCode);
    const usageState = await getUsageStateForUser(user.id);
    const allowance = (usageState?.allowance ?? limits.tokensPerMonth) || 0;
    const used = usageState?.used ?? 0;

    if (usageState?.hardCap) {
      console.warn('[CBT_LIMIT_REACHED]', {
        userId: user.id,
        workspaceId,
        planCode,
        used,
        allowance,
        usagePct: usageState.usagePct,
      });
      return respondError(res, 402, 'cbt_limit_reached', 'Your included cbT limit for this period has been reached.');
    }

    if (usageState?.nearCap) {
      console.warn('[CBT_LIMIT_80PCT]', {
        userId: user.id,
        workspaceId,
        planCode,
        used,
        allowance,
        usagePct: usageState.usagePct,
      });
    }

    try {
      const result = await runScenario(scenarioId, req.body || {}, {
        userId: user.id,
        workspaceId,
        planCode,
        contextId: activeContext?.contextId || null,
      });

      const usedAfter = await getTokensUsed(user.id, period);

      return res.json({
        scenario: result.scenario,
        status: result.status,
        summary: result.summary,
        actions: result.actions,
        steps: result.steps,
        usage: {
          tokensUsedBefore: used,
          tokensUsedAfter: usedAfter,
          tokensAllowance: allowance,
          periodStart: period.start,
          periodEnd: period.end,
        },
      });
    } catch (err) {
      if (err.status === 400) {
        return respondError(res, 400, 'INVALID_INPUT', 'Invalid scenario or input payload.');
      }
      throw err;
    }
  } catch (err) {
    console.error('[AGENT_RUN_ERROR]', err?.message);
    return respondError(res, 500, 'AGENT_RUN_FAILED', 'Agent run failed.');
  }
});

router.get('/runs', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) return res.status(403).json({ error: 'workspace_not_bound' });
    const scenarioId = req.query.scenarioId || null;
    const limit = Number(req.query.limit || 20);
    const runs = await findRunsForWorkspace(workspaceId, { scenarioId, limit });
    return res.json({ workspaceId, scenarioId, runs });
  } catch (err) {
    next(err);
  }
});

export default router;
