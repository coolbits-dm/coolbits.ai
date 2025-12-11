// Normalize provider usage metadata into a common shape and compute cost.

function pickNumber(...candidates) {
  for (const value of candidates) {
    if (value == null) continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function computeCost(inputTokens = 0, outputTokens = 0, modelConfig = {}) {
  const inCost = Number(modelConfig.costPer1kInput || modelConfig.costPer1k || 0) || 0;
  const outCost = Number(modelConfig.costPer1kOutput || modelConfig.costPer1k || 0) || 0;
  const total = (inputTokens / 1000) * inCost + (outputTokens / 1000) * outCost;
  return Number(total.toFixed(6));
}

function computeCbtDelta(totalTokens = 0, modelConfig = {}) {
  const factor = Number(modelConfig.cbtFactor || modelConfig.factor || 1) || 1;
  if (!totalTokens) return 0;
  return Math.max(1, Math.ceil((totalTokens / 1000) * factor));
}

export function normalizeUsage(provider, usageMeta = {}, modelConfig = {}) {
  const usage = usageMeta?.usage || usageMeta?.usageMetadata || usageMeta?.raw || usageMeta || {};
  const inputTokens = pickNumber(
    usage.inputTokens,
    usage.promptTokens,
    usage.promptTokenCount,
    usage.prompt_tokens,
    usage.promptTokensCount,
  );
  const outputTokens = pickNumber(
    usage.outputTokens,
    usage.completionTokens,
    usage.completionTokenCount,
    usage.completion_tokens,
    usage.candidatesTokenCount,
    usage.completionTokensCount,
  );
  const totalTokens = pickNumber(usage.totalTokens, usage.total_tokens, (inputTokens || 0) + (outputTokens || 0)) || 0;

  const modelId = modelConfig.id || modelConfig.modelId || modelConfig.family || null;
  const providerModelId = modelConfig.providerModelId || modelConfig.family || modelId;

  const normalized = {
    provider: provider || modelConfig.provider || null,
    modelId,
    providerModelId,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    totalTokens,
    totalCost: computeCost(inputTokens || 0, outputTokens || 0, modelConfig),
    cbtDelta: computeCbtDelta(totalTokens, modelConfig),
  };
  return normalized;
}

export function extractUsageFromProviderResponse(resp, modelConfig = {}) {
  return normalizeUsage(resp?.provider || null, resp, modelConfig);
}

export default { normalizeUsage, extractUsageFromProviderResponse };
