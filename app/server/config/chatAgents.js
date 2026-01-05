import cbAgentsConfig from './cbAgents.config.json' with { type: 'json' };
import { loadCanon } from '../../shared/canon/loadCanon.js';

const { canon, models, canonHash } = loadCanon();

const WORKSPACE_ALIASES = {
  business: 'B',
  agency: 'A',
  developer: 'D',
  dev: 'D',
  personal: 'P',
};

const roles = Array.isArray(canon?.roles) ? canon.roles : [];
const rolesById = new Map(roles.map((role) => [role.id.toLowerCase(), role]));
const routingPolicy = canon?.routingPolicy || {};
const configById = new Map(Object.entries(cbAgentsConfig || {}).map(([key, value]) => [key.toLowerCase(), value]));

const modelList = Array.isArray(models?.models) ? models.models : [];
const modelsById = new Map(modelList.map((model) => [model.modelId, model]));

function fail(code, detail) {
  const err = new Error(detail ? `${code}:${detail}` : code);
  err.code = code;
  return err;
}

function resolveWorkspaceKey(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'B';
  const lower = raw.toLowerCase();
  if (WORKSPACE_ALIASES[lower]) return WORKSPACE_ALIASES[lower];
  const upper = raw.toUpperCase();
  if (['P', 'B', 'A', 'D'].includes(upper)) return upper;
  return 'B';
}

function resolveRole(roleId) {
  if (!roleId) return null;
  const key = String(roleId).trim().toLowerCase();
  if (!key) return null;
  const role = rolesById.get(key);
  if (!role) {
    throw fail('canon_invalid', `role_missing:${roleId}`);
  }
  return role;
}

function resolveAgentConfig(roleId) {
  const config = configById.get(String(roleId).toLowerCase());
  if (!config) {
    throw fail('canon_invalid', `config_missing:${roleId}`);
  }
  return config;
}

function resolvePolicy(roleId) {
  const policy = routingPolicy[roleId];
  if (!policy) {
    throw fail('canon_invalid', `routing_missing:${roleId}`);
  }
  return policy;
}

function resolveModelId(roleId, policy, { requestedModelId, requestedProvider } = {}) {
  const allowlist = new Set([policy.primaryModelId, ...(policy.fallbackModelIds || [])]);
  const hasOverride = Boolean(requestedModelId || requestedProvider);
  const primaryProvider = modelsById.get(policy.primaryModelId)?.provider || null;

  if (hasOverride) {
    if (!policy.providerOverride) {
      if (requestedModelId && requestedModelId !== policy.primaryModelId) {
        throw fail('provider_model_mismatch', `${roleId}:${requestedModelId}`);
      }
      if (requestedProvider && primaryProvider && requestedProvider !== primaryProvider) {
        throw fail('provider_model_mismatch', `${roleId}:${requestedProvider}`);
      }
      return policy.primaryModelId;
    }
    let candidate = requestedModelId || null;
    if (candidate && !allowlist.has(candidate)) {
      throw fail('provider_model_mismatch', `${roleId}:${candidate}`);
    }
    if (candidate && requestedProvider) {
      const candidateProvider = modelsById.get(candidate)?.provider || null;
      if (candidateProvider && candidateProvider !== requestedProvider) {
        throw fail('provider_model_mismatch', `${roleId}:${requestedProvider}`);
      }
    }
    if (!candidate && requestedProvider) {
      const match = [...allowlist].find((modelId) => modelsById.get(modelId)?.provider === requestedProvider);
      if (!match) {
        throw fail('provider_model_mismatch', `${roleId}:${requestedProvider}`);
      }
      candidate = match;
    }
    if (!candidate) {
      throw fail('provider_model_mismatch', roleId);
    }
    return candidate;
  }

  return policy.primaryModelId;
}

function resolveModelConfig(roleId, policy, overrides = {}) {
  const modelId = resolveModelId(roleId, policy, overrides);
  const model = modelsById.get(modelId);
  if (!model) {
    throw fail('model_not_found', modelId || roleId);
  }
  if (!policy.allowedProviders.includes(model.provider)) {
    throw fail('provider_not_allowed', `${roleId}:${model.provider}`);
  }
  return { modelId, model };
}

export function getDefaultRoleId(workspaceId) {
  const key = resolveWorkspaceKey(workspaceId);
  const ws = canon.workspaces?.[key];
  const roleId = ws?.roles?.[0] || null;
  if (!roleId) {
    throw fail('canon_invalid', `default_role_missing:${key}`);
  }
  return roleId;
}

export function getChatAgentOrNull(rawKey, { requestedModelId = null, requestedProvider = null } = {}) {
  const role = resolveRole(rawKey);
  if (!role) return null;

  const policy = resolvePolicy(role.id);
  const config = resolveAgentConfig(role.id);
  const { modelId, model } = resolveModelConfig(role.id, policy, { requestedModelId, requestedProvider });
  const promptId = policy.promptId || config.promptId || config.systemPromptId || null;

  return {
    id: role.id,
    role,
    policy,
    modelId,
    provider: model.provider,
    providerModel: model.providerModel,
    promptId,
    canonHash,
  };
}

export function resolveDefaultAgentForWorkspace(workspaceId, overrides = {}) {
  const roleId = getDefaultRoleId(workspaceId);
  return getChatAgentOrNull(roleId, overrides);
}

export function getCanonHash() {
  return canonHash;
}

export default {
  getChatAgentOrNull,
  getDefaultRoleId,
  resolveDefaultAgentForWorkspace,
  getCanonHash,
};
