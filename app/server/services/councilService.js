import { listCouncils, getCouncil } from '../config/councils.js';
import { getLatestSummary } from '../repositories/analyticsRepo.js';
import { getLatestProposals } from '../repositories/ppcRepo.js';
import { findByWorkspace as findBriefs } from '../repositories/briefsRepo.js';
import { findRunsForWorkspace } from '../repositories/agentRunsRepo.js';
import { insertCouncilRun, getCouncilStatsForWorkspace } from '../repos/councilRunsRepo.js';

export function getCouncilRegistry() {
  return listCouncils();
}

export async function getCouncilSummary({ slug, workspaceId, limit = 10 }) {
  const council = getCouncil(slug);
  if (!council) return null;

  if (slug !== 'performance') {
    return { council, status: 'coming_soon' };
  }

  const summary = await getLatestSummary(workspaceId);
  const proposals = await getLatestProposals(workspaceId, { limit });
  const briefs = await findBriefs(workspaceId, {});
  const runs = await findRunsForWorkspace(workspaceId, { scenarioId: 'googleAdsAudit', limit: limit * 2 });

  return {
    council,
    status: 'ok',
    summary: summary
      ? {
          period_from: summary.period_from,
          period_to: summary.period_to,
          kpi_summary: summary.kpi_summary,
          insights: summary.insights || [],
        }
      : null,
    proposals: proposals || [],
    briefs: briefs || [],
    runs: runs || [],
  };
}

// Console/contract helper: performance council summary with usage placeholders
export async function getCouncilPerformanceSummary(workspaceId, { from = null, to = null } = {}) {
  const council = getCouncil('performance');
  if (!council) return null;

  const stats = await getCouncilStatsForWorkspace(workspaceId, { from, to });
  const nowIso = new Date().toISOString();

  const agents = (council.agents || []).map((id) => {
    const match = stats.byCouncil.find((row) => row.slug === id);
    return {
      id,
      name: id,
      status: 'idle',
      lastRunAt: null,
      tokensUsed: match?.totalTokens ?? 0,
      costUsd: match?.totalCostUsd ?? 0,
    };
  });

  return {
    workspaceId,
    totalTokens: stats.totalTokens ?? 0,
    totalCostUsd: stats.totalCostUsd ?? 0,
    lastUpdatedAt: nowIso,
    agents,
  };
}

export async function runCouncilAgents({ workspaceId, agentId = null, usage = null, userId = null, councilSlug = 'performance' }) {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  if (usage && typeof usage.totalTokens === 'number') {
    try {
      await insertCouncilRun({
        workspaceId,
        userId: userId || 'unknown',
        councilSlug,
        model: usage.model || 'unknown',
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        costUsd: usage.costUsd ?? 0,
      });
    } catch (err) {
      console.error('[COUNCIL_USAGE_LOG_ERROR]', {
        workspaceId,
        userId,
        councilSlug,
        error: err?.message,
      });
    }
  }

  return {
    runId,
    status: 'queued',
    workspaceId,
    agentId,
  };
}

export default { getCouncilRegistry, getCouncilSummary, getCouncilPerformanceSummary, runCouncilAgents };
