import { getModelConfig, getDefaultModelId } from '../config/modelRegistry.js';
import { normalizeProviderKey, normalizeProviderFromModel } from '../utils/providerUtils.js';
import { normalizeCouncil } from '../utils/councilUtils.js';

const FALLBACK_DEFAULT_REASON = 'fallback_error';
const ROUTING_REASONS = new Set([
  'user_selected',
  'agent_default',
  'workspace_default',
  'auto_route',
  'provider_not_allowed',
  'fallback_rate_limit',
  'fallback_missing_key',
  'fallback_timeout',
  'fallback_error',
]);

function normalizeRoutingReason(reason, fallback = null) {
  if (!reason || typeof reason !== 'string') return fallback;
  const key = reason.trim();
  return ROUTING_REASONS.has(key) ? key : fallback;
}

const stringifyAgents = (agents = []) =>
  Array.isArray(agents) ? agents.filter(Boolean).map((v) => String(v)) : [];

export function buildRequestedContext({ body = {}, council = null, activeContext = null } = {}) {
  const normalizedCouncil = normalizeCouncil(council || body || {});
  const mode = normalizedCouncil.armed && normalizedCouncil.agents.length ? 'council' : 'solo';
  const agents = stringifyAgents(normalizedCouncil.agents);

  const providerRaw = body?.provider || activeContext?.requested?.provider || activeContext?.provider || 'auto';
  const modelRaw = body?.model || activeContext?.requested?.model || activeContext?.model || 'auto';

  return {
    provider: normalizeProviderKey(providerRaw),
    model: typeof modelRaw === 'string' && modelRaw.trim() ? modelRaw.trim() : 'auto',
    mode,
    agents,
  };
}

export function buildResolvedContext({ modelId, provider = null, council = null } = {}) {
  const normalizedCouncil = normalizeCouncil(council || {});
  const mode = normalizedCouncil.armed && normalizedCouncil.agents.length ? 'council' : 'solo';
  const agents = stringifyAgents(normalizedCouncil.agents);
  const modelConfig = modelId ? getModelConfig(modelId) : getModelConfig(getDefaultModelId());
  const resolvedProvider = normalizeProviderFromModel(provider || modelConfig.provider || 'auto');
  return {
    provider: resolvedProvider,
    model: modelConfig.id,
    mode,
    agents,
  };
}

export function deriveRoutingReason({ activeContext = null, requested = null, resolved = null, fallbackReason = null } = {}) {
  const fallback = normalizeRoutingReason(fallbackReason, FALLBACK_DEFAULT_REASON);
  if (fallback) return fallback;
  const contextReason =
    normalizeRoutingReason(activeContext?.resolutionReason, null) ||
    normalizeRoutingReason(activeContext?.reason, null);
  if (contextReason) return contextReason;
  const requestedProvider = requested?.provider || activeContext?.requested?.provider || activeContext?.provider || 'auto';
  const requestedModel = requested?.model || activeContext?.requested?.model || 'auto';
  const normalizedProvider = normalizeProviderKey(requestedProvider);
  const normalizedModel = typeof requestedModel === 'string' && requestedModel.trim() ? requestedModel.trim() : 'auto';

  if (normalizedProvider !== 'auto' && normalizedModel !== 'auto') {
    if (resolved && resolved.provider === normalizedProvider && resolved.model === normalizedModel) {
      return 'user_selected';
    }
    return 'auto_route';
  }

  if (normalizedProvider !== 'auto' && normalizedModel === 'auto') {
    return 'auto_route';
  }

  if (normalizedProvider === 'auto' && normalizedModel !== 'auto') {
    return 'user_selected';
  }

  if (activeContext?.agentId) {
    return 'agent_default';
  }
  return 'workspace_default';
}

export function classifyFallbackReason(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('rate') && message.includes('limit')) return 'fallback_rate_limit';
  if (message.includes('quota')) return 'fallback_rate_limit';
  if (message.includes('timeout') || message.includes('etimedout')) return 'fallback_timeout';
  if (message.includes('api key') || message.includes('unauthorized') || message.includes('auth')) {
    return 'fallback_missing_key';
  }
  return FALLBACK_DEFAULT_REASON;
}

export function shouldFallbackToDefault(primaryModelId) {
  const fallback = getDefaultModelId();
  if (!fallback) return false;
  return fallback !== primaryModelId;
}

export function getFallbackModelId(primaryModelId) {
  const fallback = getDefaultModelId();
  return fallback && fallback !== primaryModelId ? fallback : primaryModelId;
}

export default {
  buildRequestedContext,
  buildResolvedContext,
  deriveRoutingReason,
  classifyFallbackReason,
  getFallbackModelId,
  shouldFallbackToDefault,
};
