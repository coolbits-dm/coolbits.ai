import { getModelConfig, getDefaultModelId } from '../config/modelRegistry.js';
import { normalizeUsage } from './tokenUsageHelper.js';
import { generateVertexReply } from './vertexClient.js';
import { openaiChatCompletion } from './openaiClient.js';
import { recordUsage } from './usageService.js';
import { getAgentProfile as getCbAgentProfile, listAgents as listCbAgents } from '../config/cbAgents.js';
import { TOOL_IMPL } from './toolRegistry.js';
import { loadAgentSystemPrompt } from './promptService.js';
import { toolMetadataFor } from './toolMetadata.js';
import { validateToolInput, validateToolOutput } from './toolValidators.js';
import { normalizeProviderKey } from '../utils/providerUtils.js';

const DEFAULT_PROVIDER = normalizeProviderKey(
  process.env.CHAT_PROVIDER || process.env.OPENAI_PROVIDER || 'vertex',
);
const OPENAI_ENABLED = String(process.env.ENABLE_OPENAI || '').toLowerCase() === 'true';
const OPENAI_ALLOWED = OPENAI_ENABLED || DEFAULT_PROVIDER === 'openai';

function cleanHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));
}

async function callVertex(modelConfig, params) {
  const { system, user, history, temperature, maxTokens } = params;
  return generateVertexReply({
    systemPrompt: system,
    message: user,
    history,
    temperature,
    maxTokens,
    modelId: modelConfig.providerModelId,
  });
}

async function callOpenAI(modelConfig, params) {
  const { system, user, history, temperature, maxTokens } = params;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  (history || []).forEach((m) => messages.push({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: user || '' });

  const response = await openaiChatCompletion({
    messages,
    model: modelConfig.providerModelId || modelConfig.id,
    temperature,
    maxTokens,
  });
  return response;
}

const PROVIDER_CALLS = {
  vertex: callVertex,
  openai: callOpenAI,
};

export async function call(modelIdInput, params = {}, usageContext = null) {
  const modelConfig = getModelConfig(modelIdInput || getDefaultModelId());
  const provider = modelConfig.provider || 'vertex';
  if (provider === 'openai' && !OPENAI_ALLOWED) {
    const err = new Error('provider_not_allowed:openai');
    err.code = 'PROVIDER_NOT_ALLOWED';
    throw err;
  }
  const history = cleanHistory(params.history || []);
  const payload = {
    system: params.system,
    user: params.user,
    history,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens || modelConfig.maxTokens || 1024,
  };

  const providerFn = PROVIDER_CALLS[provider];
  if (!providerFn) {
    throw new Error(`llm_provider_unsupported_${provider}`);
  }

  const raw = await providerFn(modelConfig, payload);
  const normalizedUsage = normalizeUsage(provider, raw?.usage || raw?.raw || raw, modelConfig);
  const result = {
    text: raw?.text || '',
    raw,
    provider,
    modelId: modelConfig.id,
    providerModelId: normalizedUsage.providerModelId,
    usage: normalizedUsage,
  };

  if (usageContext?.userId) {
    const accounting = await recordUsage({
      ...usageContext,
      provider,
      modelId: modelConfig.id,
      rawUsage: normalizedUsage,
      planCode: usageContext.planCode,
    });
    result.accounting = accounting;
  }

  return result;
}

function extractUserAndHistory(messages = []) {
  const safe = cleanHistory(messages);
  const lastUser = [...safe].reverse().find((m) => m.role === 'user');
  const userContent = lastUser ? lastUser.content : '';
  const history = safe.filter((m) => m !== lastUser);
  return { userContent, history };
}

function isAutonomyEnough(effectiveLevel, requiredLevel) {
  const order = { L0: 0, L1: 1, L2: 2 };
  return (order[effectiveLevel] ?? 0) >= (order[requiredLevel] ?? 0);
}

function wrapToolWithValidation(agentId, toolName, impl, meta, effAutonomy) {
  return async function wrapped(ctx, params) {
    if (meta.autonomy && !isAutonomyEnough(effAutonomy, meta.autonomy)) {
      throw new Error(`autonomy_violation:${agentId}:${toolName}:required=${meta.autonomy},effective=${effAutonomy}`);
    }
    if (meta.kind === 'apply_external') {
      if (!ctx || ctx.approvedByUser !== true) {
        throw new Error(`apply_blocked:${agentId}:${toolName}:missing_user_approval`);
      }
    }
    validateToolInput(toolName, params);
    const result = await impl(ctx, params);
    validateToolOutput(toolName, result);
    if (ctx && Array.isArray(ctx._usedTools)) {
      ctx._usedTools.push(toolName);
    }
    return result;
  };
}

function buildToolContext(agentId, allowedTools = [], canApplyChanges = false, effectiveAutonomy = 'L0', usedTools = []) {
  const activeTools = {};
  for (const toolName of allowedTools) {
    const meta = toolMetadataFor(toolName);
    const impl = TOOL_IMPL[toolName];
    if (!impl) {
      console.warn('[TOOL_IMPL_MISSING]', { agentId, toolName });
      continue;
    }
    if (meta.autonomy && !isAutonomyEnough(effectiveAutonomy, meta.autonomy)) {
      continue;
    }
    if (meta.kind === 'apply_external' && !canApplyChanges) {
      continue;
    }
    activeTools[toolName] = wrapToolWithValidation(agentId, toolName, impl, meta, effectiveAutonomy);
  }

  return {
    list: () => Object.keys(activeTools),
    async call(toolName, params, ctx = {}) {
      if (!activeTools[toolName]) {
        throw new Error(`tool_not_allowed:${toolName}`);
      }
      const effectiveCtx = { ...ctx };
      if (Array.isArray(usedTools)) {
        effectiveCtx._usedTools = usedTools;
      }
      return activeTools[toolName](effectiveCtx, params);
    },
  };
}

async function buildAgentSystemPrompt(agentId, profile) {
  const base = await loadAgentSystemPrompt(agentId);
  const tools = (profile.tools || []).join(', ') || 'none';
  return `${base}\n\nAvailable tools for this agent: ${tools}. Use only these tools.`;
}

function computeEffectiveAutonomy(profile, scenarioAutonomy) {
  const order = { L0: 0, L1: 1, L2: 2 };
  const maxA = profile.maxAutonomy || 'L1';
  const scenarioA = scenarioAutonomy || profile.defaultAutonomy || 'L0';
  const effIdx = Math.min(order[maxA] ?? 1, order[scenarioA] ?? 0);
  return Object.keys(order).find((k) => order[k] === effIdx) || 'L0';
}

export async function runAgent({ agentId, messages = [], scenario = null, extraContext = {} }) {
  const profile = getCbAgentProfile(agentId);
  if (!profile) {
    const err = new Error('agent_not_found');
    err.status = 404;
    throw err;
  }

  const scenarioAutonomy = scenario?.autonomyLevel || scenario?.autonomy || null;
  const effectiveAutonomy = computeEffectiveAutonomy(profile, scenarioAutonomy);
  const { tools: allowedTools = [], canApplyChanges = false } = profile;
  const usedTools = [];
  const toolContext = buildToolContext(agentId, allowedTools, canApplyChanges, effectiveAutonomy, usedTools);
  const { userContent, history } = extractUserAndHistory(messages);
  const systemPrompt = await buildAgentSystemPrompt(agentId, profile);

  console.info('[CB_AGENT_PROFILE]', {
    agentId,
    tools: toolContext.list(),
    canApplyChanges,
    autonomy: effectiveAutonomy,
  });

  const started = Date.now();

  const aiContent = await call(
    profile.model,
    {
      system: systemPrompt,
      user: userContent,
      history,
      temperature: profile.temperature ?? 0.35,
      maxTokens: profile.maxTokens || undefined,
    },
    extraContext?.userId
        ? {
          userId: extraContext.userId,
          workspaceId: extraContext.workspaceId,
          projectId: extraContext.projectId,
          chatId: extraContext.chatId,
          agentId,
          scenarioId: (scenario && scenario.id) || scenario || extraContext.scenarioId,
          planCode: extraContext.planCode,
          autonomyLevel: effectiveAutonomy,
          contextId: extraContext.contextId || null,
        }
      : null,
  );

  const durationMs = Date.now() - started;

  return {
    agentId,
    model: profile.model,
    tools: toolContext.list(),
    canApplyChanges,
    text: aiContent.text,
    usage: aiContent.usage,
    raw: aiContent.raw,
    usedTools,
    autonomy: effectiveAutonomy,
    durationMs,
  };
}

export function listAgents() {
  return listCbAgents();
}

export function listEnabledAgents() {
  return listCbAgents().filter((a) => a.enabled);
}

export default { call, runAgent, listAgents, listEnabledAgents };
