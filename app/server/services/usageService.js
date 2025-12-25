import { insertTokenUsage } from '../repositories/tokenUsageRepo.js';
import { getPlanForUser, getCurrentPeriodForUser, incrementTokensUsed } from './billingService.js';
import { getModelConfig } from '../config/modelRegistry.js';
import { normalizeUsage } from './tokenUsageHelper.js';

export async function recordUsage({
  userId,
  workspaceId = null,
  projectId = null,
  chatId = null,
  agentId = null,
  scenarioId = null,
  contextId = null,
  provider,
  modelId,
  rawUsage,
  planCode,
  period,
}) {
  if (!userId) return null;
  const modelConfig = getModelConfig(modelId);
  const normalized = normalizeUsage(provider, rawUsage, modelConfig);
  const shouldPersist = normalized.totalTokens > 0 || normalized.totalCost > 0;
  const planMeta = await getPlanForUser(userId);
  const activePlan = planCode || planMeta.planCode;
  const resolvedPeriod = period || (await getCurrentPeriodForUser(userId, activePlan));

  const payload = {
    userId,
    workspaceId,
    projectId,
    chatId,
    agentId,
    scenarioId,
    contextId,
    provider: provider || modelConfig.provider,
    model: modelId || modelConfig.id,
    providerModelId: normalized.providerModelId,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    totalTokens: normalized.totalTokens,
    cbtDelta: normalized.cbtDelta,
    totalCost: normalized.totalCost,
    planCode: activePlan,
    periodStart: resolvedPeriod?.start || new Date(),
    periodEnd: resolvedPeriod?.end || null,
  };

  if (!shouldPersist) return payload;

  try {
    // TODO: persist contextId once token_usage schema supports it.
    await insertTokenUsage(payload);
    if (normalized.totalTokens > 0) {
      await incrementTokensUsed(userId, resolvedPeriod, normalized.totalTokens, activePlan);
    }
  } catch (err) {
    console.warn('[TOKEN_USAGE_INSERT_ERROR]', err?.message);
  }

  return payload;
}

export default { recordUsage };
