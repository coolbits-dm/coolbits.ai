import { query } from '../db.js';

export async function insertAgentRun({
  workspaceId,
  scenarioId,
  stepIndex,
  agentId,
  autonomyLevel,
  toolsUsed = [],
  status = 'success',
  errorCode = null,
  costTokensInput = null,
  costTokensOutput = null,
  durationMs = null,
}) {
  const { rows } = await query(
    `
    INSERT INTO agent_runs (
      workspace_id,
      scenario_id,
      step_index,
      agent_id,
      autonomy_level,
      tools_used,
      status,
      error_code,
      cost_tokens_input,
      cost_tokens_output,
      duration_ms
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      workspaceId,
      scenarioId,
      stepIndex,
      agentId,
      autonomyLevel,
      toolsUsed,
      status,
      errorCode,
      costTokensInput,
      costTokensOutput,
      durationMs,
    ],
  );
  return rows[0];
}

export async function findRunsForWorkspace(workspaceId, { scenarioId = null, limit = 20 } = {}) {
  const params = [workspaceId];
  let sql = `
    SELECT
      id,
      workspace_id,
      scenario_id,
      step_index,
      agent_id,
      autonomy_level,
      status,
      error_code,
      tools_used,
      cost_tokens_input,
      cost_tokens_output,
      duration_ms,
      created_at
    FROM agent_runs
    WHERE workspace_id = $1
  `;
  if (scenarioId) {
    sql += ' AND scenario_id = $2';
    params.push(scenarioId);
  }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(Number(limit) || 20);

  const { rows } = await query(sql, params);
  return rows;
}

export default { insertAgentRun, findRunsForWorkspace };
