import crypto from 'node:crypto';
import { getAgentProfile, listEnabledAgents } from '../config/cbAgents.js';
import { models as modelRegistry, getDefaultModelId } from '../config/modelRegistry.js';
import { getPlanForUser } from './billingService.js';
import { normalizeProviderKey, normalizeProviderFromModel } from '../utils/providerUtils.js';

const activeContextByUser = new Map();
const byokStateByUser = new Map();

const WORKSPACE_ALIASES = {
  business: 'cbB',
  agency: 'cbA',
  developer: 'cbD',
  dev: 'cbD',
  personal: 'cbP',
  cbB: 'cbB',
  cbA: 'cbA',
  cbD: 'cbD',
  cbP: 'cbP',
  cbb: 'cbB',
  cba: 'cbA',
  cbd: 'cbD',
  cbp: 'cbP',
};

const WORKSPACE_DEFAULT_MODELS = {
  cbB: 'vertex-gemini-2.5-pro',
  cbA: 'vertex-gemini-2.5-flash-lite',
  cbD: 'vertex-gemini-2.5-pro',
  cbP: 'vertex-gemini-2.5-flash-lite',
  custom: 'vertex-gemini-2.5-flash-lite',
};

const PROVIDER_DEFAULT_MODELS = {
  openai: 'openai-gpt-4.1',
  vertex: 'vertex-gemini-2.5-pro',
  google: 'vertex-gemini-2.5-pro',
  anthropic: 'vertex-gemini-2.5-pro',
  xai: 'openai-gpt-4.1',
  deepseek: 'openai-gpt-4.1',
};

const DEFAULT_PROVIDER = normalizeProviderKey(
  process.env.CHAT_PROVIDER || process.env.OPENAI_PROVIDER || 'vertex',
);
const OPENAI_ENABLED = String(process.env.ENABLE_OPENAI || '').toLowerCase() === 'true';
const REQUIRE_ACTIVE_CONTEXT_STRICT =
  String(process.env.REQUIRE_ACTIVE_CONTEXT_STRICT || '').toLowerCase() === 'true';
const ALLOWED_PROVIDERS = new Set([DEFAULT_PROVIDER]);
if (OPENAI_ENABLED || DEFAULT_PROVIDER === 'openai') {
  ALLOWED_PROVIDERS.add('openai');
}

function normalizeProvider(value) {
  return normalizeProviderKey(value);
}

function normalizeWorkspace(value) {
  if (!value) return 'custom';
  const key = String(value).trim().toLowerCase();
  return WORKSPACE_ALIASES[key] || 'custom';
}

function deriveWorkspaceFromAgentId(agentId) {
  if (!agentId) return 'custom';
  const match = String(agentId).match(/cbAgent-([A-Z])-?/);
  if (!match) return 'custom';
  const prefix = match[1].toUpperCase();
  if (prefix === 'B') return 'cbB';
  if (prefix === 'A') return 'cbA';
  if (prefix === 'D') return 'cbD';
  if (prefix === 'P') return 'cbP';
  return 'custom';
}

function pickFallbackAgent(workspaceCode) {
  const enabled = listEnabledAgents();
  if (!enabled.length) return null;
  if (!workspaceCode || workspaceCode === 'custom') return enabled[0];
  const prefix = workspaceCode.slice(-1);
  return enabled.find((agent) => agent.id.includes(`-${prefix}-`)) || enabled[0];
}

function defaultModelForWorkspace(workspaceCode) {
  const modelId = WORKSPACE_DEFAULT_MODELS[workspaceCode] || WORKSPACE_DEFAULT_MODELS.custom;
  return modelRegistry[modelId] ? modelId : getDefaultModelId();
}

function defaultModelForProvider(provider, workspaceCode) {
  const fallback = PROVIDER_DEFAULT_MODELS[provider] || defaultModelForWorkspace(workspaceCode);
  return modelRegistry[fallback] ? fallback : defaultModelForWorkspace(workspaceCode);
}

function resolveProviderOverride(providerRaw) {
  const requestedProvider = normalizeProvider(providerRaw);
  if (requestedProvider === 'auto') {
    return { requestedProvider, resolvedProvider: DEFAULT_PROVIDER, reason: null };
  }
  if (!ALLOWED_PROVIDERS.has(requestedProvider)) {
    return { requestedProvider, resolvedProvider: DEFAULT_PROVIDER, reason: 'provider_not_allowed' };
  }
  return { requestedProvider, resolvedProvider: requestedProvider, reason: null };
}

function mapExternalModelToInternal(provider, modelValue) {
  if (!modelValue) return null;
  const normalized = String(modelValue).trim().toLowerCase();
  if (!normalized) return null;
  if (modelRegistry[modelValue]) return modelValue;
  if (modelRegistry[normalized]) return normalized;

  if (normalized.includes('gemini')) {
    if (normalized.includes('2.5-pro')) return 'vertex-gemini-2.5-pro';
    if (normalized.includes('2.0-pro')) return 'vertex-gemini-2.0-pro';
    if (normalized.includes('2.5-flash')) return 'vertex-gemini-2.5-flash-lite';
    if (normalized.includes('2.0-flash')) return 'vertex-gemini-2.5-flash-lite';
    if (normalized.includes('flash')) return 'vertex-gemini-2.5-flash-lite';
    return 'vertex-gemini-2.5-pro';
  }

  if (normalized.includes('gpt') || normalized.includes('o1')) {
    if (normalized.includes('mini')) return 'openai-gpt-4.1-mini';
    return 'openai-gpt-4.1';
  }

  if (provider === 'openai') {
    return normalized.includes('mini') ? 'openai-gpt-4.1-mini' : 'openai-gpt-4.1';
  }

  if (provider === 'vertex') {
    return 'vertex-gemini-2.5-pro';
  }

  return null;
}

function providerFromModel(modelId, fallbackProvider) {
  const modelConfig = modelId && modelRegistry[modelId] ? modelRegistry[modelId] : null;
  const provider = modelConfig?.provider || fallbackProvider || 'vertex';
  return normalizeProviderFromModel(provider);
}

function normalizeBillingSource(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'byok') return 'byok';
  return 'coolbits';
}

function pickFirstAgentId(payload) {
  if (payload?.agentId && typeof payload.agentId === 'string' && payload.agentId.trim()) {
    return payload.agentId.trim();
  }
  if (Array.isArray(payload?.agents) && payload.agents.length) {
    return String(payload.agents[0]);
  }
  if (Array.isArray(payload?.council?.members) && payload.council.members.length) {
    return String(payload.council.members[0]);
  }
  return null;
}

export function buildContextActivationRequest({
  body = {},
  workspaceId = null,
  projectId = null,
  traceId = null,
} = {}) {
  const agentId = pickFirstAgentId(body);
  const workspaceValue =
    (typeof body?.workspaceId === 'string' && body.workspaceId.trim())
      ? body.workspaceId.trim()
      : (typeof body?.workspace === 'string' && body.workspace.trim() ? body.workspace.trim() : '');
  const provider = typeof body?.provider === 'string' && body.provider.trim()
    ? body.provider.trim()
    : 'auto';
  const model = typeof body?.model === 'string' && body.model.trim()
    ? body.model.trim()
    : 'auto';
  const billingSource = typeof body?.billingSource === 'string' && body.billingSource.trim()
    ? body.billingSource.trim()
    : undefined;
  const byokKeyPresent = body?.byokKeyPresent === true;
  const byokKeyLast4 = typeof body?.byokKeyLast4 === 'string' && body.byokKeyLast4.trim()
    ? body.byokKeyLast4.trim()
    : undefined;
  const customName = typeof body?.customName === 'string' && body.customName.trim()
    ? body.customName.trim()
    : undefined;

  return {
    agentId: agentId || undefined,
    workspaceId: workspaceValue || workspaceId || undefined,
    projectId: projectId || undefined,
    provider,
    model,
    billingSource,
    byokKeyPresent,
    byokKeyLast4,
    customName,
    traceId: traceId || undefined,
  };
}

export function isActiveContextStrict() {
  return REQUIRE_ACTIVE_CONTEXT_STRICT;
}

function getByokState(userId) {
  if (!byokStateByUser.has(userId)) {
    byokStateByUser.set(userId, {});
  }
  return byokStateByUser.get(userId);
}

function hasByokKey(userId, provider) {
  const state = getByokState(userId);
  return Boolean(state[provider]?.present);
}

function setByokState(userId, provider, payload = {}) {
  const state = getByokState(userId);
  state[provider] = {
    present: true,
    last4: payload.last4 || state[provider]?.last4 || '',
  };
}

function resolveModel({ provider, model, agentProfile, workspaceCode }) {
  const normalizedModel = typeof model === 'string' ? model.trim() : '';
  const normalizedProvider = provider || 'auto';

  if (normalizedModel && normalizedModel.toLowerCase() !== 'auto') {
    const mapped = mapExternalModelToInternal(normalizedProvider, normalizedModel);
    if (mapped && modelRegistry[mapped]) return mapped;
    if (modelRegistry[normalizedModel]) return normalizedModel;
  }

  if (normalizedProvider && normalizedProvider !== 'auto') {
    return defaultModelForProvider(normalizedProvider, workspaceCode);
  }

  if (agentProfile?.model && modelRegistry[agentProfile.model]) {
    return agentProfile.model;
  }

  return defaultModelForWorkspace(workspaceCode);
}

export function getActiveContext(userId) {
  if (!userId) return null;
  return activeContextByUser.get(userId) || null;
}

export async function activateContext(userId, requested = {}) {
  if (!userId) {
    const err = new Error('user_required');
    err.code = 'USER_REQUIRED';
    throw err;
  }

  const reqAgentId = typeof requested.agentId === 'string' ? requested.agentId.trim() : '';
  let agentProfile = reqAgentId ? getAgentProfile(reqAgentId) : null;
  if (reqAgentId && !agentProfile) {
    const err = new Error('agent_not_found');
    err.code = 'AGENT_NOT_FOUND';
    throw err;
  }

  const workspaceFromRequest = normalizeWorkspace(requested.workspace || requested.workspaceId);
  const workspaceFromAgent = agentProfile ? deriveWorkspaceFromAgentId(agentProfile.id) : null;
  const workspaceCode = workspaceFromRequest !== 'custom'
    ? workspaceFromRequest
    : (workspaceFromAgent !== 'custom' ? workspaceFromAgent : workspaceFromRequest);

  if (!agentProfile) {
    const fallback = pickFallbackAgent(workspaceCode);
    if (!fallback) {
      const err = new Error('agent_required');
      err.code = 'AGENT_REQUIRED';
      throw err;
    }
    agentProfile = fallback;
  }

  const providerResolution = resolveProviderOverride(requested.provider);
  const providerRequested = providerResolution.requestedProvider;
  const providerForResolution = providerResolution.resolvedProvider;
  if (providerResolution.reason) {
    console.warn('[PROVIDER_OVERRIDE]', JSON.stringify({
      traceId: requested?.traceId || null,
      requestedProvider: providerRequested,
      resolvedProvider: providerForResolution,
      reason: providerResolution.reason,
    }));
  }
  const modelResolved = resolveModel({
    provider: providerForResolution,
    model: requested.model,
    agentProfile,
    workspaceCode,
  });
  const providerResolved = providerFromModel(modelResolved, providerForResolution);

  const billingSource = normalizeBillingSource(requested.billingSource);
  if (billingSource === 'coolbits') {
    const planMeta = await getPlanForUser(userId);
    if (!planMeta?.planCode) {
      const err = new Error('billing_plan_missing');
      err.code = 'BILLING_PLAN_MISSING';
      throw err;
    }
  }

  if (billingSource === 'byok') {
    const hasKey =
      requested.byokKeyPresent === true ||
      (typeof requested.byokKeyLast4 === 'string' && requested.byokKeyLast4.trim()) ||
      hasByokKey(userId, providerResolved);
    if (!hasKey) {
      const err = new Error('byok_missing');
      err.code = 'BYOK_REQUIRED';
      throw err;
    }
    if (typeof requested.byokKeyLast4 === 'string' && requested.byokKeyLast4.trim()) {
      setByokState(userId, providerResolved, { last4: requested.byokKeyLast4.trim() });
    }
  }

  const requestedModel = typeof requested.model === 'string' && requested.model.trim()
    ? requested.model.trim()
    : 'auto';
  let resolutionReason = providerResolution.reason || 'workspace_default';
  if (!providerResolution.reason) {
    if (providerRequested !== 'auto' && requestedModel !== 'auto') {
      resolutionReason = 'user_selected';
    } else if (providerRequested !== 'auto') {
      resolutionReason = 'auto_route';
    } else if (requestedModel !== 'auto') {
      resolutionReason = 'user_selected';
    } else if (agentProfile?.model) {
      resolutionReason = 'agent_default';
    }
  }

  const context = {
    contextId: `ctx_${crypto.randomUUID()}`,
    userId,
    workspace: workspaceCode || 'custom',
    agentId: agentProfile.id,
    role: agentProfile.label || agentProfile.role || 'Agent',
    defaultName: agentProfile.label || agentProfile.id,
    customName: typeof requested.customName === 'string' && requested.customName.trim()
      ? requested.customName.trim()
      : null,
    provider: providerResolved || providerRequested || 'auto',
    model: modelResolved,
    requested: {
      provider: providerRequested,
      model: requestedModel,
      billingSource,
      agentId: agentProfile.id,
    },
    resolved: {
      provider: providerResolved || providerRequested || 'auto',
      model: modelResolved,
      agentId: agentProfile.id,
    },
    resolutionReason,
    billingSource,
    status: 'active',
    error: null,
    confirmedAt: new Date().toISOString(),
  };

  activeContextByUser.set(userId, context);
  return context;
}

export async function ensureActiveContext(userId, desired = {}, meta = {}) {
  const existing = getActiveContext(userId);
  if (existing && existing.status === 'active') return existing;

  const context = await activateContext(userId, desired);
  console.log('[CTX_AUTO_ACTIVATE]', JSON.stringify({
    userId,
    workspaceId: desired.workspaceId || desired.workspace || null,
    projectId: meta.projectId || desired.projectId || null,
    requestedProvider: context?.requested?.provider || desired.provider || 'auto',
    resolvedProvider: context?.resolved?.provider || context?.provider || null,
    reason: meta.reason || 'missing_active_context',
  }));
  return context;
}

export default {
  getActiveContext,
  activateContext,
  ensureActiveContext,
  buildContextActivationRequest,
  isActiveContextStrict,
};
