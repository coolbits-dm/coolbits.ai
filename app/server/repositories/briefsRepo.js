import { query } from '../db.js';

export async function findByWorkspace(workspaceId, { status } = {}) {
  const params = [workspaceId];
  let sql = `
    SELECT
      id,
      workspace_id,
      title,
      objective,
      budget_monthly_eur,
      channels,
      constraints,
      kpis,
      priority,
      status,
      created_by,
      created_at,
      updated_at
    FROM briefs
    WHERE workspace_id = $1
  `;

  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT 20';

  const { rows } = await query(sql, params);
  return rows;
}

export async function upsert(workspaceId, payload = {}) {
  if (!payload || typeof payload.objective !== 'string' || !payload.objective.trim()) {
    throw new Error('briefs.upsert: objective is required');
  }

  if (payload.id) {
    const { id, ...rest } = payload;
    const { rows } = await query(
      `
      UPDATE briefs
      SET
        title = COALESCE($3, title),
        objective = COALESCE($4, objective),
        budget_monthly_eur = COALESCE($5, budget_monthly_eur),
        channels = COALESCE($6, channels),
        constraints = COALESCE($7, constraints),
        kpis = COALESCE($8, kpis),
        priority = COALESCE($9, priority),
        status = COALESCE($10, status),
        updated_at = now()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
      `,
      [
        id,
        workspaceId,
        rest.title ?? null,
        rest.objective ?? null,
        rest.budget_monthly_eur ?? null,
        rest.channels ?? null,
        rest.constraints ?? null,
        rest.kpis ?? null,
        rest.priority ?? null,
        rest.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  const {
    title,
    objective,
    budget_monthly_eur,
    channels = [],
    constraints = [],
    kpis = [],
    priority,
    status = 'draft',
    created_by = null,
  } = payload;

  const { rows } = await query(
    `
    INSERT INTO briefs (
      workspace_id,
      title,
      objective,
      budget_monthly_eur,
      channels,
      constraints,
      kpis,
      priority,
      status,
      created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
    `,
    [
      workspaceId,
      title ?? null,
      objective,
      budget_monthly_eur ?? null,
      channels,
      constraints,
      kpis,
      priority ?? null,
      status,
      created_by,
    ],
  );

  return rows[0];
}

export default { findByWorkspace, upsert };
