import { classifyMessage } from './router/intent-router.js';
import { getSuggestions } from './router/suggestions.js';
import { getLevelEngine, buildLevelContext } from './levels/index.js';
import { logError } from './logger.js';
import {
  getPlanForUser,
  getCurrentPeriodForUser,
  getTokensUsed,
  getUsageStateForUser,
} from './services/billingService.js';
import { call as callLlm } from './services/llmService.js';
import { getUserByEmail, upsertUser } from './userStore.js';
import { recordTokenUsage } from './middleware/rateLimit.js';
import { loadAgentSystemPrompt } from './services/promptService.js';
import { getChatAgentOrNull } from './config/chatAgents.js';
import { getModelConfig } from './config/modelRegistry.js';
import { normalizeCouncil } from './utils/councilUtils.js';
import {
  getActiveContext,
  ensureActiveContext,
  buildContextActivationRequest,
  isActiveContextStrict,
} from './services/activeContextService.js';
import { resolveTraceId } from './utils/trace.js';
import {
  buildRequestedContext,
  buildResolvedContext,
  deriveRoutingReason,
  classifyFallbackReason,
  getFallbackModelId,
  shouldFallbackToDefault,
} from './services/chatRoutingService.js';
import { PRICING_VERSION, FX_VERSION } from './config/pricingConfig.js';
import { normalizeUsage } from './services/tokenUsageHelper.js';
import { initSse, sendSse, endSse } from './utils/sse.js';
import { resolvePayloadAttachments } from './services/payloadService.js';

const GUARDRAIL_RESPONSE =
  'I can help you only with CoolBits business, agency or devops topics.\nLet’s get back on track.';

const SUPPORTED_LANGUAGES = ['en', 'ro', 'es', 'fr', 'de'];
const DEFAULT_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS) || 4096;
const USE_REAL_LLM = String(process.env.USE_REAL_LLM || '').toLowerCase() === 'true';
const CHAT_PROVIDER = (process.env.CHAT_PROVIDER || process.env.OPENAI_PROVIDER || 'vertex').toLowerCase();
const MOCK_MODEL_NAME = 'coolbits-mock';
const MOCK_ACK = 'Looking forward to helping with your project. This is a mock response.';
const levelEngine = getLevelEngine();

const SYSTEM_PROMPT = `
You are the CoolBits.ai assistant.

Role:
- Help with Google Ads, analytics, DevOps, and technical implementation details.
- Answer with precise, concrete steps, examples, and code when useful.
- Do NOT describe what CoolBits.ai is or how it works unless the user explicitly asks.
- If the user asks who you are, say you are a technical assistant used by CoolBits.ai.

Language:
- Default: reply in the same language as the user.
- If the user writes in English, answer in English.

Hard rules for council awareness:
- You CANNOT see the UI or the council pill. You only know about council selection from the [COUNCIL_META] block in the system prompt.
- The [COUNCIL_META] block has the structure:
  [COUNCIL_META]
  agents: <comma-separated agent keys or "none">
  armed: true|false
- If agents is "none", you MUST say you do not know which agents are selected and you MUST respond as the default CoolBits.ai Assistant.
- If there is NO [COUNCIL_META] block at all, you MUST say you do not know which agents are selected and you MUST respond as the default CoolBits.ai Assistant.
- You are FORBIDDEN from guessing which agents are selected or armed. Do NOT say you "see" the pill or "detect" agents beyond what [COUNCIL_META] explicitly says.
- If the user asks which agents are selected or armed and [COUNCIL_META] does not list any agents, explicitly answer that you do not know which agents are selected and that you will answer as the default assistant.
`.trim();

function appendClean(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function detectLanguage(req) {
  const header = (req.headers['accept-language'] || '').toLowerCase();
  const bodyLanguage =
    req.body && typeof req.body.language === 'string'
      ? req.body.language.toLowerCase()
      : null;

  if (bodyLanguage && SUPPORTED_LANGUAGES.includes(bodyLanguage)) {
    return bodyLanguage;
  }

  if (header.startsWith('ro')) return 'ro';
  if (header.startsWith('es')) return 'es';
  if (header.startsWith('fr')) return 'fr';
  if (header.startsWith('de')) return 'de';

  return 'en';
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h.role === 'string' && typeof h.content === 'string')
    .map((h) => ({ role: h.role, content: h.content }));
}

function buildEmptyUsage() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    toolTokens: 0,
    costUsd: 0,
    costCbT: 0,
    pricingVersion: PRICING_VERSION,
    fxVersion: FX_VERSION,
    isEstimate: false,
  };
}

function buildMetaPayload({ traceId, requested, resolved, reason, accounting, payloads }) {
  const usage = accounting?.usage && typeof accounting.usage === 'object'
    ? { ...accounting.usage }
    : buildEmptyUsage();
  usage.isEstimate = false;
  if (!usage.pricingVersion) usage.pricingVersion = PRICING_VERSION;
  if (!usage.fxVersion) usage.fxVersion = FX_VERSION;
  const meta = {
    traceId,
    requested,
    resolved,
    reason,
    usage,
    wallet: accounting?.wallet || null,
  };
  if (payloads !== undefined) {
    meta.payloads = payloads;
  }
  return meta;
}

const STREAM_CHUNK_SIZE = 48;

const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
};

async function streamTextChunks(res, traceId, text, { promptTokens = 0, modelId = null } = {}) {
  let cursor = 0;
  const modelConfig = modelId ? getModelConfig(modelId) : null;
  while (cursor < text.length) {
    const chunk = text.slice(cursor, cursor + STREAM_CHUNK_SIZE);
    cursor += STREAM_CHUNK_SIZE;
    const completionTokens = estimateTokens(text.slice(0, cursor));
    const usageUpdate = {
      traceId,
      promptTokens,
      completionTokens,
      isEstimate: true,
    };
    if (modelConfig) {
      const normalized = normalizeUsage(modelConfig.provider, { promptTokens, completionTokens }, modelConfig);
      usageUpdate.totalTokens = normalized.totalTokens;
      usageUpdate.costUsd = normalized.totalCost || 0;
      usageUpdate.costCbT = normalized.cbtDelta || 0;
    }
    sendSse(res, 'chat.delta', { traceId, delta: chunk });
    sendSse(res, 'usage.update', usageUpdate);
  }
}

export function buildCouncilMeta(council) {
  const normalized = normalizeCouncil(council);
  const list = normalized.agents;
  const armed = normalized.armed;

  if (!list.length) {
    return ['[COUNCIL_META]', 'agents: none', `armed: ${armed ? 'true' : 'false'}`, ''].join('\n');
  }

  return [
    '[COUNCIL_META]',
    `agents: ${list.join(', ')}`,
    `armed: ${armed ? 'true' : 'false'}`,
    '',
  ].join('\n');
}

function resolveCouncilAgent(council) {
  const normalized = normalizeCouncil(council);
  if (!normalized.armed || !normalized.agents.length) return null;

  const primaryKey = normalized.agents[0];
  const agentConfig = getChatAgentOrNull(primaryKey);
  if (!agentConfig) return null;

  return {
    key: primaryKey,
    selectedKeys: normalized.agents.slice(),
    armed: true,
    config: agentConfig,
  };
}

function selectModel(intent, userMessage, reasoningActive) {
  if (reasoningActive) return 'vertex-gemini-2.0-pro';
  if (intent === 'devops') return 'openai-gpt-4.1';

  const trimmed = String(userMessage || '').trim();
  if (!trimmed) return 'vertex-gemini-2.5-flash-lite';
  if (trimmed.length > 400) return 'openai-gpt-4.1';
  return 'vertex-gemini-2.5-flash-lite';
}

function buildMockPayload(userMessage) {
  const preview = userMessage
    ? `You said: "${userMessage.slice(0, 200)}".`
    : 'Looking forward to the details.';
  const body = `${preview}\n${MOCK_ACK}`;
  return {
    model: MOCK_MODEL_NAME,
    reply: appendClean(body),
  };
}

async function resolveUser(email) {
  let user = await getUserByEmail(email);
  if (!user) {
    user = await upsertUser({ email });
  }
  return user;
}

export async function handleChat(optionsOrReq, maybeRes) {
  const hasOptions = optionsOrReq && typeof optionsOrReq === 'object' && 'req' in optionsOrReq && 'res' in optionsOrReq;
  const req = hasOptions ? optionsOrReq.req : optionsOrReq;
  const res = hasOptions ? optionsOrReq.res : maybeRes;
  const councilInput = hasOptions ? optionsOrReq.council : req?.council;
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const council = normalizeCouncil(councilInput ?? body ?? {});
  const traceId = resolveTraceId(req);

  console.log('[CHAT_ENTRY]', JSON.stringify({
    body: req.body,
    timestamp: Date.now(),
    council,
    traceId,
  }));

  try {
    const { message: rawMessage, settings } = req.body || {};
    const userMessage = String(rawMessage || '').trim();
    const history = sanitizeHistory(req.body?.history);
    const preferEnglish = Boolean(settings && settings.preferEnglish === true);
    const language = detectLanguage(req);
    const chatAgent = resolveCouncilAgent(council);

    const classification = classifyMessage(userMessage);
    const { intent, redirectMessage, systemPrompt: classifiedPrompt } = classification;

    const levelContext = buildLevelContext(req, {
      tier: req.body?.tier || 'guest',
      historySize: history.length,
      lastIntent: intent,
    });

    const levelDecision = levelEngine.detect(levelContext);
    const capabilities = levelEngine.getChatInterface(levelDecision.level);
    const reasoning = levelEngine.getReasoningStatus(levelContext.visitorId);

    const sharedResponse = {
      visitorId: levelContext.visitorId,
      level: levelDecision.level,
      capabilities,
      unlocks: levelEngine.getMockUnlocks(levelDecision.level),
      onboarding: {
        shouldPrompt: levelEngine.shouldTriggerOnboarding({
          level: levelDecision.level,
          sharedEmail: levelContext.sharedEmail,
        }),
      },
      reasoning,
    };

    let authedUser = null;
    let planMeta = null;
    let period = null;
    let tokensUsedThisPeriod = 0;
    let tokensAllowance = 0;

    const workspaceId = req.workspaceId || 'business';

    if (req.userEmail) {
      authedUser = await resolveUser(req.userEmail);
      planMeta = authedUser ? await getPlanForUser(authedUser.id) : null;
      period = authedUser ? await getCurrentPeriodForUser(authedUser.id, planMeta?.planCode) : null;
      tokensUsedThisPeriod = authedUser ? await getTokensUsed(authedUser.id, period) : 0;
      tokensAllowance = planMeta?.limits?.tokensPerMonth || 0;

      try {
        const usageState = await getUsageStateForUser(authedUser.id);
        if (usageState) {
          tokensUsedThisPeriod = usageState.used;
          tokensAllowance = usageState.allowance;

          if (usageState.hardCap) {
            console.warn('[CBT_LIMIT_REACHED]', {
              userId: authedUser.id,
              workspaceId,
              planCode: usageState.planCode || planMeta?.planCode,
              used: usageState.used,
              allowance: usageState.allowance,
              usagePct: usageState.usagePct,
            });
            return res.status(402).json({
              error: 'cbt_limit_reached',
              message:
                'Your monthly cbT limit for this plan has been reached. Please upgrade your plan in Account & Billing.',
              planCode: usageState.planCode || planMeta?.planCode,
              cbtQuota: usageState.allowance,
              usedTokens: usageState.used,
              remainingTokens: usageState.remaining,
            });
          }

          if (usageState.nearCap) {
            console.warn('[CBT_LIMIT_80PCT]', {
              userId: authedUser.id,
              workspaceId,
              planCode: usageState.planCode || planMeta?.planCode,
              used: usageState.used,
              allowance: usageState.allowance,
              usagePct: usageState.usagePct,
            });
          }
        }
      } catch (err) {
        console.error('[CBT_USAGE_ERROR]', {
          userId: authedUser.id,
          workspaceId,
          error: err?.message,
        });
      }
    }

    if (!authedUser) {
      return res.status(401).json({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' });
    }

    let activeContext = getActiveContext(authedUser.id);
    if (!activeContext || activeContext.status !== 'active') {
      if (isActiveContextStrict()) {
        return res.status(409).json({
          error: 'ACTIVE_CONTEXT_REQUIRED',
          message: 'Select an agent/model and wait for active status before sending.',
        });
      }
      try {
        const desired = buildContextActivationRequest({
          body: req.body,
          workspaceId,
          projectId: req.body?.projectId || null,
          traceId,
        });
        activeContext = await ensureActiveContext(authedUser.id, desired, {
          reason: 'missing_active_context',
          projectId: req.body?.projectId || null,
        });
      } catch (err) {
        return res.status(409).json({
          error: 'ACTIVE_CONTEXT_REQUIRED',
          message: 'Select an agent/model and wait for active status before sending.',
        });
      }
    }

    const payloadIds = Array.isArray(body?.payloadIds) ? body.payloadIds : null;
    let payloadMeta = [];
    let hasPayloadRequest = false;
    try {
      const resolvedPayloads = await resolvePayloadAttachments({
        workspaceId,
        payloadIds,
      });
      payloadMeta = resolvedPayloads.payloads;
      hasPayloadRequest = resolvedPayloads.hasPayloadRequest;
    } catch (err) {
      return res.status(err.status || 400).json({
        error: err.code || 'payload_error',
        message: err.message || 'Invalid payloads request.',
      });
    }

    const requestedContext = buildRequestedContext({ body: req.body, council, activeContext });
    const resolvedContextBase = buildResolvedContext({
      modelId: activeContext?.model,
      provider: activeContext?.provider,
      council,
    });
    const baseReason = deriveRoutingReason({
      activeContext,
      requested: requestedContext,
      resolved: resolvedContextBase,
    });

    const userPayload = () => ({
      user: {
        email: authedUser.email,
        plan: planMeta?.planCode || authedUser.planId,
        tokensRemaining: Math.max((tokensAllowance || 0) - (tokensUsedThisPeriod || 0), 0),
        totalUsed: tokensUsedThisPeriod,
      },
    });

    const respond = (payload, metaOverride = {}) => {
      const meta = buildMetaPayload({
        traceId,
        requested: metaOverride.requested || requestedContext,
        resolved: metaOverride.resolved || resolvedContextBase,
        reason: metaOverride.reason || baseReason,
        accounting: metaOverride.accounting || null,
        payloads: metaOverride.payloads !== undefined
          ? metaOverride.payloads
          : hasPayloadRequest
          ? payloadMeta
          : undefined,
      });
      return res.json({ ...sharedResponse, ...payload, meta, ...userPayload() });
    };

    if (intent === 'out-of-scope') {
      return respond({ intent, reply: GUARDRAIL_RESPONSE, text: GUARDRAIL_RESPONSE });
    }

    if (intent === 'about-us') {
      const message =
        redirectMessage || 'CoolBits.ai is an independent AI development studio.';
      return respond({
        intent,
        reply: appendClean(message),
        text: appendClean(message),
        suggestions: getSuggestions(language),
      });
    }

    if (!USE_REAL_LLM) {
      const mockPayload = buildMockPayload(userMessage);
      return respond({ intent, ...mockPayload, text: mockPayload.reply });
    }

    let model = activeContext?.model || (chatAgent?.config?.modelId
      ? chatAgent.config.modelId
      : selectModel(intent, userMessage, Boolean(reasoning?.active)));

    let systemPrompt = SYSTEM_PROMPT;

    if (chatAgent) {
      const agentPromptId = chatAgent.config.promptId;
      const agentPrompt = agentPromptId ? await loadAgentSystemPrompt(agentPromptId) : null;
      const basePrompt = agentPrompt ? `${agentPrompt}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;
      const roleLabels = chatAgent.selectedKeys.map((k) => String(k).toUpperCase()).join(', ');
      systemPrompt = `${basePrompt}\n\nYou are currently answering as the following council roles for CoolBits.ai: ${roleLabels}. Speak as a coordinated council ("we") and make it clear when different roles contribute to different parts of the reasoning.`;
    }

    const councilMeta = buildCouncilMeta(council);
    if (councilMeta) {
      systemPrompt = `${systemPrompt}\n\n${councilMeta}`;
    }

    if (preferEnglish) {
      systemPrompt += '\n\nAdditional preference: Prefer answering in English, even if the conversation starts in another language.';
    }
    if (classifiedPrompt) {
      systemPrompt += `\n\n${classifiedPrompt}`;
    }

    console.log('[RAW_REQUEST]', JSON.stringify({
      provider: CHAT_PROVIDER,
      model,
      preferEnglish,
      systemPrompt,
      history: history.length,
      timestamp: Date.now(),
    }));

    let resolvedContext = buildResolvedContext({
      modelId: model,
      provider: activeContext?.provider,
      council,
    });
    let routingReason = deriveRoutingReason({
      activeContext,
      requested: requestedContext,
      resolved: resolvedContext,
    });

    let aiContent = null;
    try {
      aiContent = await callLlm(
        model,
        {
          system: systemPrompt,
          user: userMessage,
          history,
          temperature: 0.3,
          maxTokens: DEFAULT_MAX_TOKENS,
        },
        {
          userId: authedUser.id,
          workspaceId: req.body?.workspaceId || 'business',
          chatId: null,
          agentId: activeContext?.agentId || chatAgent?.config?.id || null,
          scenarioId: chatAgent ? 'council-pill' : null,
          planCode: planMeta?.planCode,
          contextId: activeContext?.contextId || null,
          traceId,
          requested: requestedContext,
          resolved: resolvedContext,
          reason: routingReason,
        },
      );
    } catch (error) {
      const fallbackReason = classifyFallbackReason(error);
      if (shouldFallbackToDefault(model)) {
        const fallbackModel = getFallbackModelId(model);
        resolvedContext = buildResolvedContext({
          modelId: fallbackModel,
          provider: activeContext?.provider,
          council,
        });
        routingReason = fallbackReason;
        aiContent = await callLlm(
          fallbackModel,
          {
            system: systemPrompt,
            user: userMessage,
            history,
            temperature: 0.3,
            maxTokens: DEFAULT_MAX_TOKENS,
          },
          {
            userId: authedUser.id,
            workspaceId: req.body?.workspaceId || 'business',
            chatId: null,
            agentId: activeContext?.agentId || chatAgent?.config?.id || null,
            scenarioId: chatAgent ? 'council-pill' : null,
            planCode: planMeta?.planCode,
            contextId: activeContext?.contextId || null,
            traceId,
            requested: requestedContext,
            resolved: resolvedContext,
            reason: routingReason,
          },
        );
      } else {
        throw error;
      }
    }

    if (authedUser && aiContent?.usage?.totalTokens) {
      tokensUsedThisPeriod += aiContent.usage.totalTokens;
    }

    if (aiContent?.usage?.totalTokens) {
      recordTokenUsage(aiContent.usage.totalTokens);
    }

    const rawModelReply = aiContent?.text || aiContent || '';

    console.log('[RAW_MODEL]', JSON.stringify({
      raw: rawModelReply,
      model,
      provider: CHAT_PROVIDER,
      preferEnglish,
      timestamp: Date.now(),
    }));

    const payload = {
      intent,
      model: resolvedContext?.model || model,
      reply: rawModelReply,
      usage: aiContent.usage || null,
    };

    if (intent === 'smalltalk-safe') {
      payload.suggestions = getSuggestions(language);
    }

    const meta = buildMetaPayload({
      traceId,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      accounting: aiContent?.accounting || null,
      payloads: hasPayloadRequest ? payloadMeta : undefined,
    });

    console.log('[CHAT_USAGE]', JSON.stringify({
      traceId,
      userId: authedUser.id,
      workspaceId: req.body?.workspaceId || 'business',
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      tokens: meta.usage?.totalTokens || 0,
      costUsd: meta.usage?.costUsd || 0,
      costCbT: meta.usage?.costCbT || 0,
      walletAfter: meta.wallet?.afterCbT ?? null,
    }));

    return respond({ ...payload, text: rawModelReply }, {
      resolved: resolvedContext,
      reason: routingReason,
      accounting: aiContent?.accounting || null,
    });
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

export async function handleChatStream(optionsOrReq, maybeRes) {
  const hasOptions = optionsOrReq && typeof optionsOrReq === 'object' && 'req' in optionsOrReq && 'res' in optionsOrReq;
  const req = hasOptions ? optionsOrReq.req : optionsOrReq;
  const res = hasOptions ? optionsOrReq.res : maybeRes;
  const councilInput = hasOptions ? optionsOrReq.council : req?.council;
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const council = normalizeCouncil(councilInput ?? body ?? {});
  const traceId = resolveTraceId(req);

  initSse(res);

  try {
    const { message: rawMessage, settings } = req.body || {};
    const userMessage = String(rawMessage || '').trim();
    const history = sanitizeHistory(req.body?.history);
    const preferEnglish = Boolean(settings && settings.preferEnglish === true);
    const language = detectLanguage(req);
    const chatAgent = resolveCouncilAgent(council);

    const classification = classifyMessage(userMessage);
    const { intent, redirectMessage, systemPrompt: classifiedPrompt } = classification;

    const levelContext = buildLevelContext(req, {
      tier: req.body?.tier || 'guest',
      historySize: history.length,
      lastIntent: intent,
    });

    const levelDecision = levelEngine.detect(levelContext);
    const capabilities = levelEngine.getChatInterface(levelDecision.level);
    const reasoning = levelEngine.getReasoningStatus(levelContext.visitorId);

    const sharedResponse = {
      visitorId: levelContext.visitorId,
      level: levelDecision.level,
      capabilities,
      unlocks: levelEngine.getMockUnlocks(levelDecision.level),
      onboarding: {
        shouldPrompt: levelEngine.shouldTriggerOnboarding({
          level: levelDecision.level,
          sharedEmail: levelContext.sharedEmail,
        }),
      },
      reasoning,
    };

    let authedUser = null;
    let planMeta = null;
    let period = null;
    let tokensUsedThisPeriod = 0;
    let tokensAllowance = 0;

    const workspaceId = req.workspaceId || 'business';

    if (req.userEmail) {
      authedUser = await resolveUser(req.userEmail);
      planMeta = authedUser ? await getPlanForUser(authedUser.id) : null;
      period = authedUser ? await getCurrentPeriodForUser(authedUser.id, planMeta?.planCode) : null;
      tokensUsedThisPeriod = authedUser ? await getTokensUsed(authedUser.id, period) : 0;
      tokensAllowance = planMeta?.limits?.tokensPerMonth || 0;
    }

    if (!authedUser) {
      sendSse(res, 'error', { traceId, errorCode: 'UNAUTHENTICATED', message: 'Unauthorized' });
      return endSse(res);
    }

    let activeContext = getActiveContext(authedUser.id);
    if (!activeContext || activeContext.status !== 'active') {
      if (isActiveContextStrict()) {
        sendSse(res, 'error', {
          traceId,
          errorCode: 'ACTIVE_CONTEXT_REQUIRED',
          message: 'Select an agent/model and wait for active status before sending.',
        });
        return endSse(res);
      }
      try {
        const desired = buildContextActivationRequest({
          body,
          workspaceId,
          projectId: body?.projectId || null,
          traceId,
        });
        activeContext = await ensureActiveContext(authedUser.id, desired, {
          reason: 'missing_active_context',
          projectId: body?.projectId || null,
        });
      } catch (err) {
        sendSse(res, 'error', {
          traceId,
          errorCode: 'ACTIVE_CONTEXT_REQUIRED',
          message: 'Select an agent/model and wait for active status before sending.',
        });
        return endSse(res);
      }
    }

    const payloadIds = Array.isArray(body?.payloadIds) ? body.payloadIds : null;
    let payloadMeta = [];
    let hasPayloadRequest = false;
    try {
      const resolvedPayloads = await resolvePayloadAttachments({
        workspaceId,
        payloadIds,
      });
      payloadMeta = resolvedPayloads.payloads;
      hasPayloadRequest = resolvedPayloads.hasPayloadRequest;
    } catch (err) {
      sendSse(res, 'error', {
        traceId,
        errorCode: err.code || 'payload_error',
        message: err.message || 'Invalid payloads request.',
      });
      return endSse(res);
    }

    const requestedContext = buildRequestedContext({ body: req.body, council, activeContext });
    let resolvedContext = buildResolvedContext({
      modelId: activeContext?.model,
      provider: activeContext?.provider,
      council,
    });
    let routingReason = deriveRoutingReason({
      activeContext,
      requested: requestedContext,
      resolved: resolvedContext,
    });

    if (intent === 'out-of-scope') {
      const meta = buildMetaPayload({
        traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
        accounting: null,
        payloads: hasPayloadRequest ? payloadMeta : undefined,
      });
      sendSse(res, 'route.resolved', { traceId, requested: requestedContext, resolved: resolvedContext, reason: routingReason });
      await streamTextChunks(res, traceId, GUARDRAIL_RESPONSE, { promptTokens: estimateTokens(userMessage) });
      sendSse(res, 'chat.final', { traceId, text: GUARDRAIL_RESPONSE, meta, ...sharedResponse });
      return endSse(res);
    }

    if (intent === 'about-us') {
      const message = redirectMessage || 'CoolBits.ai is an independent AI development studio.';
      const cleaned = appendClean(message);
      const meta = buildMetaPayload({
        traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
        accounting: null,
        payloads: hasPayloadRequest ? payloadMeta : undefined,
      });
      sendSse(res, 'route.resolved', { traceId, requested: requestedContext, resolved: resolvedContext, reason: routingReason });
      await streamTextChunks(res, traceId, cleaned, { promptTokens: estimateTokens(userMessage) });
      sendSse(res, 'chat.final', { traceId, text: cleaned, meta, suggestions: getSuggestions(language), ...sharedResponse });
      return endSse(res);
    }

    if (!USE_REAL_LLM) {
      const mockPayload = buildMockPayload(userMessage);
      const meta = buildMetaPayload({
        traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
        accounting: null,
        payloads: hasPayloadRequest ? payloadMeta : undefined,
      });
      sendSse(res, 'route.resolved', { traceId, requested: requestedContext, resolved: resolvedContext, reason: routingReason });
      await streamTextChunks(res, traceId, mockPayload.reply, { promptTokens: estimateTokens(userMessage) });
      sendSse(res, 'chat.final', { traceId, text: mockPayload.reply, meta, ...sharedResponse });
      return endSse(res);
    }

    let model = activeContext?.model || (chatAgent?.config?.modelId
      ? chatAgent.config.modelId
      : selectModel(intent, userMessage, Boolean(reasoning?.active)));

    let systemPrompt = SYSTEM_PROMPT;

    if (chatAgent) {
      const agentPromptId = chatAgent.config.promptId;
      const agentPrompt = agentPromptId ? await loadAgentSystemPrompt(agentPromptId) : null;
      const basePrompt = agentPrompt ? `${agentPrompt}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;
      const roleLabels = chatAgent.selectedKeys.map((k) => String(k).toUpperCase()).join(', ');
      systemPrompt = `${basePrompt}\n\nYou are currently answering as the following council roles for CoolBits.ai: ${roleLabels}. Speak as a coordinated council ("we") and make it clear when different roles contribute to different parts of the reasoning.`;
    }

    const councilMeta = buildCouncilMeta(council);
    if (councilMeta) {
      systemPrompt = `${systemPrompt}\n\n${councilMeta}`;
    }

    if (preferEnglish) {
      systemPrompt += '\n\nAdditional preference: Prefer answering in English, even if the conversation starts in another language.';
    }
    if (classifiedPrompt) {
      systemPrompt += `\n\n${classifiedPrompt}`;
    }

    let aiContent = null;
    try {
      aiContent = await callLlm(
        model,
        {
          system: systemPrompt,
          user: userMessage,
          history,
          temperature: 0.3,
          maxTokens: DEFAULT_MAX_TOKENS,
        },
        {
          userId: authedUser.id,
          workspaceId: req.body?.workspaceId || 'business',
          chatId: null,
          agentId: activeContext?.agentId || chatAgent?.config?.id || null,
          scenarioId: chatAgent ? 'council-pill' : null,
          planCode: planMeta?.planCode,
          contextId: activeContext?.contextId || null,
          traceId,
          requested: requestedContext,
          resolved: resolvedContext,
          reason: routingReason,
        },
      );
    } catch (error) {
      const fallbackReason = classifyFallbackReason(error);
      if (shouldFallbackToDefault(model)) {
        const fallbackModel = getFallbackModelId(model);
        resolvedContext = buildResolvedContext({
          modelId: fallbackModel,
          provider: activeContext?.provider,
          council,
        });
        routingReason = fallbackReason;
        aiContent = await callLlm(
          fallbackModel,
          {
            system: systemPrompt,
            user: userMessage,
            history,
            temperature: 0.3,
            maxTokens: DEFAULT_MAX_TOKENS,
          },
          {
            userId: authedUser.id,
            workspaceId: req.body?.workspaceId || 'business',
            chatId: null,
            agentId: activeContext?.agentId || chatAgent?.config?.id || null,
            scenarioId: chatAgent ? 'council-pill' : null,
            planCode: planMeta?.planCode,
            contextId: activeContext?.contextId || null,
            traceId,
            requested: requestedContext,
            resolved: resolvedContext,
            reason: routingReason,
          },
        );
      } else {
        throw error;
      }
    }

    if (authedUser && aiContent?.usage?.totalTokens) {
      tokensUsedThisPeriod += aiContent.usage.totalTokens;
    }

    if (aiContent?.usage?.totalTokens) {
      recordTokenUsage(aiContent.usage.totalTokens);
    }

    const rawModelReply = aiContent?.text || aiContent || '';
    const meta = buildMetaPayload({
      traceId,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      accounting: aiContent?.accounting || null,
      payloads: hasPayloadRequest ? payloadMeta : undefined,
    });

    sendSse(res, 'route.resolved', { traceId, requested: requestedContext, resolved: resolvedContext, reason: routingReason });
    await streamTextChunks(res, traceId, rawModelReply, {
      promptTokens: estimateTokens(userMessage),
      modelId: resolvedContext?.model || model,
    });
    sendSse(res, 'chat.final', { traceId, text: rawModelReply, meta, ...sharedResponse });

    console.log('[CHAT_USAGE]', JSON.stringify({
      traceId,
      userId: authedUser.id,
      workspaceId: req.body?.workspaceId || 'business',
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      tokens: meta.usage?.totalTokens || 0,
      costUsd: meta.usage?.costUsd || 0,
      costCbT: meta.usage?.costCbT || 0,
      walletAfter: meta.wallet?.afterCbT ?? null,
    }));

    return endSse(res);
  } catch (error) {
    logError(error);
    sendSse(res, 'error', { traceId, errorCode: error?.code || 'CHAT_ERROR', message: error?.message || 'Internal error' });
    return endSse(res);
  }
}
