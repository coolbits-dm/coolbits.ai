import { query } from '../db.js';

export async function saveSnapshot(workspaceId, snapshot = {}) {
  const { period_from, period_to, kpi_summary } = snapshot;
  if (!period_from || !period_to) {
    throw new Error('analytics.saveSnapshot: period_from and period_to are required');
  }
  if (!kpi_summary || typeof kpi_summary !== 'object') {
    throw new Error('analytics.saveSnapshot: kpi_summary is required');
  }

  const { rows } = await query(
    `
    INSERT INTO metric_snapshots (
      workspace_id,
      period_from,
      period_to,
      kpi_summary
    )
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
    [workspaceId, period_from, period_to, kpi_summary],
  );

  return rows[0];
}

export async function saveInsight(workspaceId, insight = {}) {
  const {
    snapshot_id = null,
    type,
    message,
    suggested_action_agent = null,
    priority = null,
  } = insight;

  if (!type || !message) {
    throw new Error('analytics.saveInsight: type and message are required');
  }

  const { rows } = await query(
    `
    INSERT INTO insights (
      workspace_id,
      snapshot_id,
      type,
      message,
      suggested_action_agent,
      priority
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
    `,
    [workspaceId, snapshot_id, type, message, suggested_action_agent, priority],
  );

  return rows[0];
}

export async function getLatestSummary(workspaceId) {
  const { rows } = await query(
    `
    SELECT
      ms.id,
      ms.workspace_id,
      ms.period_from,
      ms.period_to,
      ms.kpi_summary,
      ms.created_at,
      COALESCE(
        (
          SELECT json_agg(i ORDER BY i.created_at DESC)
          FROM insights i
          WHERE i.workspace_id = ms.workspace_id
            AND i.snapshot_id = ms.id
        ),
        '[]'::json
      ) AS insights
    FROM metric_snapshots ms
    WHERE ms.workspace_id = $1
    ORDER BY ms.created_at DESC
    LIMIT 1
    `,
    [workspaceId],
  );

  return rows[0] ?? null;
}

export default { saveSnapshot, saveInsight, getLatestSummary };
