import { getAgentProfile, listAgents, listEnabledAgents } from '../config/cbAgents.js';
import { getDefaultModelId, models as modelRegistry } from '../config/modelRegistry.js';
import { normalizeCouncil } from '../utils/councilUtils.js';

const PROVIDER_KEYS = new Set(['auto', 'chatgpt', 'claude', 'gemini', 'grok', 'copilot']);

const WORKSPACE_PREFIX = {
  business: 'B',
  agency: 'A',
  developer: 'D',
  personal: 'P',
};

const normalizeWorkspaceId = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const workspacePrefixFromId = (workspaceId) => {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (!normalized) return null;
  if (WORKSPACE_PREFIX[normalized]) return WORKSPACE_PREFIX[normalized];
  const match = normalized.match(/^cb([abdp])$/);
  if (match) return match[1].toUpperCase();
  return null;
};

const agentPrefixFromId = (agentId) => {
  if (!agentId) return null;
  const match = String(agentId).match(/cbAgent-([A-Z])-?/);
  if (match) return match[1].toUpperCase();
  return null;
};

const findAgentByKey = (agentKey) => {
  const key = typeof agentKey === 'string' ? agentKey.trim().toLowerCase() : '';
  if (!key) return null;
  return listAgents().find((agent) => {
    const id = String(agent?.id || '').toLowerCase();
    return id.endsWith(`-${key}`) || id.includes(`-${key}-`);
  }) || null;
};

const pickFallbackAgent = (workspacePrefix) => {
  const enabled = listEnabledAgents();
  if (!enabled.length) return null;
  if (!workspacePrefix) return enabled[0];
  return enabled.find((agent) => agentPrefixFromId(agent.id) === workspacePrefix) || enabled[0];
};

const resolveModel = ({ selectedModel, agentProfile }) => {
  const agentModel = agentProfile?.model || agentProfile?.modelId || null;
  const defaultModel = agentModel || getDefaultModelId();
  const normalized = typeof selectedModel === 'string' ? selectedModel.trim() : '';
  if (!normalized || PROVIDER_KEYS.has(normalized.toLowerCase())) {
    return { status: 'valid', resolved: defaultModel, label: 'Auto', detail: `Using ${defaultModel}` };
  }
  if (modelRegistry[normalized] || normalized === agentModel) {
    return { status: 'valid', resolved: normalized, label: 'Supported', detail: `Using ${normalized}` };
  }
  return {
    status: 'warn',
    resolved: defaultModel,
    label: 'Fallback',
    detail: `Model not supported, using ${defaultModel}`,
  };
};

export function validateContext(payload = {}, options = {}) {
  const context = payload && typeof payload.context === 'object' ? payload.context : {};
  const merged = { ...payload, ...context };
  const council = normalizeCouncil(payload);
  const councilAgents = council.agents || [];
  const origin = merged.origin || (council.armed ? 'Council' : 'Solo');
  const workspaceId = normalizeWorkspaceId(merged.workspaceId || merged.workspace);
  const workspacePrefix = workspacePrefixFromId(workspaceId);
  const strict =
    typeof options.strict === 'boolean'
      ? options.strict
      : Boolean(
          merged.contextState ||
            merged.agentId ||
            merged.agentKey ||
            merged.model ||
            merged.origin ||
            councilAgents.length
        );

  const primaryAgentKey =
    merged.agentKey ||
    (Array.isArray(merged.agents) && merged.agents.length ? merged.agents[0] : null) ||
    (councilAgents.length ? councilAgents[0] : null);
  let agentId = merged.agentId || null;
  let agentProfile = agentId ? getAgentProfile(agentId) : null;
  if (!agentProfile && primaryAgentKey) {
    const match = findAgentByKey(primaryAgentKey);
    if (match) {
      agentProfile = match;
      agentId = match.id || agentId;
    }
  }

  const fallbackAgent = pickFallbackAgent(workspacePrefix);
  const resolvedAgentId = agentProfile?.id || fallbackAgent?.id || null;

  let workspaceStatus = 'valid';
  let workspaceLabel = 'Set';
  let workspaceDetail = workspaceId ? `Workspace: ${workspaceId}` : 'Workspace not set';
  if (!workspaceId) {
    workspaceStatus = strict ? 'invalid' : 'warn';
    workspaceLabel = strict ? 'Missing' : 'Unverified';
  }

  let agentStatus = 'valid';
  let agentLabel = 'Ready';
  let agentDetail = agentProfile?.label || agentId || primaryAgentKey || 'Default agent';
  if (origin.toLowerCase() === 'council' && !primaryAgentKey) {
    agentStatus = 'invalid';
    agentLabel = 'Missing';
    agentDetail = 'Select at least one council agent.';
  } else if (!agentProfile && resolvedAgentId) {
    agentStatus = 'warn';
    agentLabel = 'Mocked';
    agentDetail = `Unknown agent. Using ${resolvedAgentId}.`;
  } else if (agentProfile && !agentProfile.enabled) {
    agentStatus = 'warn';
    agentLabel = 'Mocked';
    agentDetail = `Agent disabled. Using ${resolvedAgentId || 'default'}.`;
  } else if (!agentProfile && !resolvedAgentId) {
    agentStatus = strict ? 'invalid' : 'warn';
    agentLabel = strict ? 'Invalid' : 'Unverified';
    agentDetail = 'No valid agent resolved.';
  }

  const agentWorkspacePrefix = agentPrefixFromId(agentProfile?.id || resolvedAgentId);
  if (workspaceStatus !== 'invalid' && workspacePrefix && agentWorkspacePrefix && workspacePrefix !== agentWorkspacePrefix) {
    workspaceStatus = 'warn';
    workspaceLabel = 'Mismatch';
    workspaceDetail = `Agent workspace ${agentWorkspacePrefix} differs from ${workspacePrefix}.`;
  }

  const modelResult = resolveModel({
    selectedModel: merged.model,
    agentProfile: agentProfile || fallbackAgent,
  });

  const modelStatus = modelResult.status;
  const modelLabel =
    modelStatus === 'valid' ? 'Ready' : modelStatus === 'warn' ? 'Fallback' : 'Invalid';
  const modelDetail = modelResult.detail;

  const overall =
    workspaceStatus === 'invalid' || agentStatus === 'invalid' || modelStatus === 'invalid'
      ? 'invalid'
      : workspaceStatus === 'warn' || agentStatus === 'warn' || modelStatus === 'warn'
        ? 'warn'
        : 'valid';

  return {
    overall,
    origin,
    workspace: {
      status: workspaceStatus,
      label: workspaceLabel,
      detail: workspaceDetail,
      value: workspaceId || null,
    },
    agent: {
      status: agentStatus,
      label: agentLabel,
      detail: agentDetail,
      id: agentId || null,
      resolvedId: resolvedAgentId,
    },
    model: {
      status: modelStatus,
      label: modelLabel,
      detail: modelDetail,
      selected: merged.model || null,
      resolved: modelResult.resolved,
    },
    resolved: {
      workspaceId: workspaceId || null,
      agentId: resolvedAgentId,
      modelId: modelResult.resolved,
      origin,
      councilAgents,
    },
  };
}

export default { validateContext };
