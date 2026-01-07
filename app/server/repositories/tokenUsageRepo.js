import { query } from '../db.js';

function normalizeUuidOrNull(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) return null;
  return value;
}

function assertInsertCounts(text, values, label) {
  const insertMatch = text.match(/INSERT INTO token_usage\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/s);
  const placeholders = text.match(/\$\d+/g) || [];
  const columns = insertMatch
    ? insertMatch[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const columnCount = columns.length;
  const placeholderCount = placeholders.length;
  const valuesCount = values.length;
  if (columnCount !== valuesCount || placeholderCount !== valuesCount) {
    const error = new Error(
      `[TOKEN_USAGE_QUERY_MISMATCH] ${label} columns=${columnCount} placeholders=${placeholderCount} values=${valuesCount}`,
    );
    error.code = 'TOKEN_USAGE_QUERY_MISMATCH';
    throw error;
  }
}

export async function insertTokenUsage({
  traceId = null,
  userId,
  workspaceId = null,
  projectId = null,
  chatId = null,
  agentId = null,
  scenarioId = null,
  provider = null,
  model = null,
  providerModelId = null,
  requestedProvider = null,
  requestedModel = null,
  resolvedProvider = null,
  resolvedModel = null,
  routingReason = null,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  cbtDelta = 0,
  totalCost = null,
  pricingVersion = null,
  fxVersion = null,
  walletBeforeCbt = null,
  walletAfterCbt = null,
  allowanceBeforeCbt = null,
  allowanceAfterCbt = null,
  planCode = null,
  periodStart,
  periodEnd = null,
}, client = null) {
  const normalizedWorkspaceId = normalizeUuidOrNull(workspaceId);
  const normalizedProjectId = normalizeUuidOrNull(projectId);
  const executor = client || { query };

  const text = `
    INSERT INTO token_usage (
      trace_id,
      user_id,
      workspace_id,
      project_id,
      chat_id,
      agent_id,
      scenario_id,
      provider,
      model,
      provider_model_id,
      requested_provider,
      requested_model,
      resolved_provider,
      resolved_model,
      routing_reason,
      input_tokens,
      output_tokens,
      total_tokens,
      cbt_delta,
      total_cost,
      pricing_version,
      fx_version,
      wallet_before_cbt,
      wallet_after_cbt,
      allowance_before_cbt,
      allowance_after_cbt,
      plan_code,
      period_start,
      period_end
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
    ON CONFLICT (trace_id) DO NOTHING
    RETURNING *
  `;
  const values = [
    traceId,
    userId,
    normalizedWorkspaceId,
    normalizedProjectId,
    chatId,
    agentId,
    scenarioId,
    provider,
    model,
    providerModelId,
    requestedProvider,
    requestedModel,
    resolvedProvider,
    resolvedModel,
    routingReason,
    inputTokens || 0,
    outputTokens || 0,
    totalTokens || 0,
    cbtDelta || 0,
    totalCost,
    pricingVersion,
    fxVersion,
    walletBeforeCbt,
    walletAfterCbt,
    allowanceBeforeCbt,
    allowanceAfterCbt,
    planCode || null,
    periodStart,
    periodEnd || null,
  ];
  assertInsertCounts(text, values, 'insertTokenUsage');
  const result = await executor.query(text, values);
  return result?.rows?.[0] || null;
}

export async function insertTokenUsageLegacy(payload, client = null) {
  const {
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
  } = payload || {};
  const normalizedWorkspaceId = normalizeUuidOrNull(workspaceId);
  const normalizedProjectId = normalizeUuidOrNull(projectId);
  const executor = client || { query };
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
  await executor.query(text, values);
  return null;
}

export async function getTokenUsageByTraceId(traceId, client = null) {
  if (!traceId) return null;
  const executor = client || { query };
  const result = await executor.query(
    `SELECT * FROM token_usage WHERE trace_id = $1 LIMIT 1`,
    [traceId],
  );
  return result.rows[0] || null;
}

export default {
  insertTokenUsage,
  insertTokenUsageLegacy,
  getTokenUsageByTraceId,
};
