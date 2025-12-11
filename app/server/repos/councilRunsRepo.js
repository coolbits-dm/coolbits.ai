import { query } from '../db.js';

export async function insertCouncilRun({
  workspaceId,
  userId,
  councilSlug,
  model,
  promptTokens,
  completionTokens,
  totalTokens,
  costUsd,
}) {
  const text = `
    INSERT INTO council_runs (
      workspace_id,
      user_id,
      council_slug,
      model,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cost_usd
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id, created_at
  `;

  const values = [
    workspaceId,
    userId,
    councilSlug,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  ];

  const { rows } = await query(text, values);
  return rows[0];
}

export async function getCouncilStatsForWorkspace(workspaceId, { from = null, to = null } = {}) {
  if (!workspaceId) return { totalTokens: 0, totalCostUsd: 0, byCouncil: [] };

  let where = 'workspace_id = $1';
  const params = [workspaceId];
  let idx = 2;

  if (from) {
    where += ` AND created_at >= $${idx}`;
    params.push(from);
    idx += 1;
  }
  if (to) {
    where += ` AND created_at < $${idx}`;
    params.push(to);
    idx += 1;
  }

  const totalQuery = `
    SELECT
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd
    FROM council_runs
    WHERE ${where}
  `;

  const byCouncilQuery = `
    SELECT
      council_slug,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd
    FROM council_runs
    WHERE ${where}
    GROUP BY council_slug
    ORDER BY total_cost_usd DESC
  `;

  const [totalRes, byCouncilRes] = await Promise.all([
    query(totalQuery, params),
    query(byCouncilQuery, params),
  ]);

  const totals = totalRes.rows[0] || { total_tokens: 0, total_cost_usd: 0 };
  const byCouncil = byCouncilRes.rows || [];

  return {
    totalTokens: Number(totals.total_tokens) || 0,
    totalCostUsd: Number(totals.total_cost_usd) || 0,
    byCouncil: byCouncil.map((row) => ({
      slug: row.council_slug,
      totalTokens: Number(row.total_tokens) || 0,
      totalCostUsd: Number(row.total_cost_usd) || 0,
    })),
  };
}

export async function getCouncilTotalsForUser({ userId, workspaceId = null, from = null, to = null }) {
  if (!userId) return { totalTokens: 0, totalCostUsd: 0 };

  const params = [userId];
  let where = 'user_id = $1';
  let idx = params.length + 1;

  if (workspaceId) {
    where += ` AND workspace_id = $${idx}`;
    params.push(workspaceId);
    idx += 1;
  }

  if (from) {
    where += ` AND created_at >= $${idx}`;
    params.push(from);
    idx += 1;
  }

  if (to) {
    where += ` AND created_at < $${idx}`;
    params.push(to);
    idx += 1;
  }

  const text = `
    SELECT
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd
    FROM council_runs
    WHERE ${where}
  `;

  const { rows } = await query(text, params);
  const row = rows[0] || { total_tokens: 0, total_cost_usd: 0 };
  return {
    totalTokens: Number(row.total_tokens) || 0,
    totalCostUsd: Number(row.total_cost_usd) || 0,
  };
}

export default {
  insertCouncilRun,
  getCouncilStatsForWorkspace,
  getCouncilTotalsForUser,
};
