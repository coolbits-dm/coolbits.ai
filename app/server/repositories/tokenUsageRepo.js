import { query } from '../db.js';

function normalizeUuidOrNull(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) return null;
  return value;
}

export async function insertTokenUsage({
  userId,
  workspaceId = null,
  projectId = null,
  chatId = null,
  agentId = null,
  scenarioId = null,
  provider = null,
  model = null,
  providerModelId = null,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  cbtDelta = 0,
  totalCost = null,
  planCode = null,
  periodStart,
  periodEnd = null,
}) {
  const normalizedWorkspaceId = normalizeUuidOrNull(workspaceId);
  const normalizedProjectId = normalizeUuidOrNull(projectId);

  const text = `
    INSERT INTO token_usage (
      user_id,
      workspace_id,
      project_id,
      chat_id,
      agent_id,
      scenario_id,
      provider,
      model,
      provider_model_id,
      input_tokens,
      output_tokens,
      total_tokens,
      cbt_delta,
      total_cost,
      plan_code,
      period_start,
      period_end
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  `;
  const values = [
    userId,
    normalizedWorkspaceId,
    normalizedProjectId,
    chatId,
    agentId,
    scenarioId,
    provider,
    model,
    providerModelId,
    inputTokens || 0,
    outputTokens || 0,
    totalTokens || 0,
    cbtDelta || 0,
    totalCost,
    planCode || null,
    periodStart,
    periodEnd || null,
  ];
  await query(text, values);
}

export default { insertTokenUsage };
