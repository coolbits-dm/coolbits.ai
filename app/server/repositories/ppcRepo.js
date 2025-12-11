import { query } from '../db.js';

/**
 * Save a PPC plan for a workspace.
 * plan: { channel, ...planBody }
 */
export async function savePlan(workspaceId, plan = {}) {
  const { channel, ...rest } = plan;
  if (!channel) {
    throw new Error('ppc.savePlan: channel is required');
  }

  const { rows } = await query(
    `
    INSERT INTO ppc_plans (workspace_id, channel, plan)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [workspaceId, channel, rest],
  );
  return rows[0];
}

/**
 * Save a PPC change proposal.
 * proposal: { plan_id?, status?, ...rest }
 */
export async function saveChangeProposal(workspaceId, proposal = {}) {
  const { plan_id = null, status = 'draft', ...rest } = proposal;
  const { rows } = await query(
    `
    INSERT INTO ppc_change_proposals (
      workspace_id,
      plan_id,
      proposal,
      status
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [workspaceId, plan_id, rest, status],
  );
  return rows[0];
}

export async function getLatestProposals(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `
    SELECT
      id,
      workspace_id,
      plan_id,
      proposal,
      status,
      approved_by,
      applied_by,
      created_at,
      updated_at
    FROM ppc_change_proposals
    WHERE workspace_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [workspaceId, limit],
  );
  return rows;
}

export default { savePlan, saveChangeProposal, getLatestProposals };
