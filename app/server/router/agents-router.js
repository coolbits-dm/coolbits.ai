import express from 'express';
import { verifyToken } from '../jwtService.js';
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
import { getActiveContext } from '../services/activeContextService.js';

const router = express.Router();

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.match(/cb_token=([^;]+)/);
  if (cookieMatch && cookieMatch[1]) return cookieMatch[1];
  return '';
}

function respondError(res, status, errorCode, message) {
  return res.status(status).json({ errorCode, message });
}

function ensureAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return respondError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  const decoded = verifyToken(token);
  if (!decoded?.email) return respondError(res, 401, 'UNAUTHORIZED', 'Authentication invalid.');
  req.authEmail = decoded.email;
  return next();
}

router.get('/registry', ensureAuth, rateLimitAgentsUserWorkspace, async (_req, res) => {
  const { agents, comingSoon } = listAgents();
  return res.json({ agents, comingSoon });
});

router.post('/run', ensureAuth, rateLimitAgentsUserWorkspace, async (req, res) => {
  try {
    const scenarioId = typeof req.body?.scenarioId === 'string' && req.body.scenarioId.trim()
      ? req.body.scenarioId.trim()
      : 'googleAdsAudit';
    const workspaceId = typeof req.body?.workspaceId === 'string' && req.body.workspaceId.trim()
      ? req.body.workspaceId.trim()
      : 'business';

    const user = await getUserByEmail(req.authEmail);
    if (!user) return respondError(res, 401, 'UNAUTHORIZED', 'User not found.');

    const activeContext = getActiveContext(user.id);
    if (!activeContext || activeContext.status !== 'active') {
      return respondError(res, 409, 'ACTIVE_CONTEXT_REQUIRED', 'Activate context before running agents.');
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

router.get('/runs', ensureAuth, async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.workspaceId || null;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId_required' });
    }
    const scenarioId = req.query.scenarioId || null;
    const limit = Number(req.query.limit || 20);
    const runs = await findRunsForWorkspace(workspaceId, { scenarioId, limit });
    return res.json({ workspaceId, scenarioId, runs });
  } catch (err) {
    next(err);
  }
});

export default router;
