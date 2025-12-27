import express from 'express';
import { requireUser } from '../middleware/auth.js';
import {
  listChatsForUser,
  getChatWithMessages,
  createChat,
  appendUserMessage,
  saveAssistantMessage,
  buildHistory,
  SYSTEM_PROMPT,
  updateChatTitle,
  archiveChat,
  buildCouncilSystem,
} from '../services/chatService.js';
import { call as callLlm } from '../services/llmService.js';
import { getUserByEmail } from '../userStore.js';
import { getPlanForUser, isPaidPlan, getCurrentPeriodForUser, getTokensUsed } from '../services/billingService.js';
import { buildCouncilMeta } from '../chat.js';
import { getChatAgentOrNull } from '../config/chatAgents.js';
import { getModelConfig } from '../config/modelRegistry.js';
import { getActiveContext } from '../services/activeContextService.js';
import {
  normalizeCouncil,
  isCouncilIntrospection,
  buildCouncilIntrospectionAnswer,
} from '../utils/councilUtils.js';
import { resolveTraceId } from '../utils/trace.js';
import { initSse, sendSse, endSse } from '../utils/sse.js';
import {
  buildRequestedContext,
  buildResolvedContext,
  deriveRoutingReason,
  classifyFallbackReason,
  getFallbackModelId,
  shouldFallbackToDefault,
} from '../services/chatRoutingService.js';
import { normalizeUsage } from '../services/tokenUsageHelper.js';
import { PRICING_VERSION, FX_VERSION } from '../config/pricingConfig.js';
import { resolvePayloadAttachments } from '../services/payloadService.js';

const router = express.Router();

function buildUsagePayload(aiContent) {
  if (!aiContent?.usage) return null;
  return {
    modelId: aiContent.modelId || aiContent.usage.modelId || null,
    providerModelId: aiContent.usage.providerModelId || null,
    inputTokens: aiContent.usage.inputTokens || aiContent.usage.promptTokens || null,
    outputTokens: aiContent.usage.outputTokens || aiContent.usage.completionTokens || null,
    totalTokens: aiContent.usage.totalTokens || null,
    totalCost: aiContent.usage.totalCost || null,
  };
}

const STREAM_CHUNK_SIZE = 48;

const isSseRequest = (req) => {
  const accept = req.headers.accept || '';
  return accept.includes('text/event-stream') || String(req.query.stream || '') === '1';
};

const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
};

async function streamTextChunks(res, traceId, text, { promptTokens = 0, modelId = null } = {}) {
  let cursor = 0;
  let completionTokens = 0;
  const modelConfig = modelId ? getModelConfig(modelId) : null;
  while (cursor < text.length) {
    const chunk = text.slice(cursor, cursor + STREAM_CHUNK_SIZE);
    cursor += STREAM_CHUNK_SIZE;
    completionTokens = estimateTokens(text.slice(0, cursor));
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

async function callLlmWithFallback({
  modelId,
  systemPrompt,
  userMessage,
  history,
  usageContext,
  activeContext,
  council,
  requestedContext,
}) {
  let resolvedContext = buildResolvedContext({
    modelId,
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
      modelId,
      {
        system: systemPrompt,
        user: userMessage,
        history,
        temperature: usageContext?.temperature ?? 0.35,
        maxTokens: usageContext?.maxTokens || Number(process.env.OPENAI_MAX_TOKENS) || 4096,
      },
      {
        ...usageContext,
        traceId: usageContext?.traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
      },
    );
  } catch (error) {
    const fallbackReason = classifyFallbackReason(error);
    if (shouldFallbackToDefault(modelId)) {
      const fallbackModel = getFallbackModelId(modelId);
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
          temperature: usageContext?.temperature ?? 0.35,
          maxTokens: usageContext?.maxTokens || Number(process.env.OPENAI_MAX_TOKENS) || 4096,
        },
        {
          ...usageContext,
          traceId: usageContext?.traceId,
          requested: requestedContext,
          resolved: resolvedContext,
          reason: routingReason,
        },
      );
    } else {
      throw error;
    }
  }

  return { aiContent, resolvedContext, routingReason };
}

function buildEmptyUsageMeta() {
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

function buildMeta({ traceId, requested, resolved, reason, accounting, payloads }) {
  const usage = accounting?.usage && typeof accounting.usage === 'object'
    ? { ...accounting.usage }
    : buildEmptyUsageMeta();
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

function handleChatError(req, res, err) {
  console.error('[CHAT_ERROR]', {
    route: `${req.method} ${req.originalUrl}`,
    email: req.userEmail || req.user?.email,
    body: req.body,
    error: err?.message,
    code: err?.code,
    stack: err?.stack,
    councilMembers: Array.isArray(req.body?.councilMembers) ? req.body.councilMembers : [],
  });

  if (isSseRequest(req)) {
    initSse(res);
    sendSse(res, 'error', {
      traceId: req.traceId || null,
      errorCode: err?.code || 'CHAT_ERROR',
      message: err?.message || 'Chat error.',
    });
    return endSse(res);
  }

  const code = err?.code || err?.message;
  switch (code) {
    case 'PLAN_INACTIVE':
      return res.status(402).json({
        error: 'Your plan is inactive. Please upgrade or reactivate your subscription.',
        errorCode: 'PLAN_INACTIVE',
      });
    case 'CBT_EXHAUSTED':
      return res.status(402).json({
        error: "You've used all included cbT for this month.",
        errorCode: 'CBT_EXHAUSTED',
      });
    case 'not_found':
    case 'NOT_FOUND':
    case 'Chat not found':
      return res.status(404).json({
        error: 'Chat not found.',
        errorCode: 'NOT_FOUND',
      });
    default:
      return res.status(500).json({ error: 'Internal error', errorCode: 'CHAT_INTERNAL_ERROR' });
  }
}

// GET /api/chats
router.get('/', requireUser, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId.trim() ? req.query.workspaceId.trim() : 'business';
    console.debug('[WORKSPACE]', { route: '/api/chats', email: req.userEmail, workspaceId });
    const chats = await listChatsForUser(req.userEmail, { limit, offset, workspaceId });
    res.json({ chats });
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/:chatId
router.get('/:chatId', requireUser, async (req, res, next) => {
  try {
    const data = await getChatWithMessages(req.userEmail, req.params.chatId);
    if (!data) return res.status(404).json({ error: 'Chat not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/chats
router.post('/', requireUser, async (req, res) => {
  try {
    const { firstMessage, message, content, text, model, temperature, projectId } = req.body || {};
    const council = normalizeCouncil(req.body);
    const councilMeta = buildCouncilMeta(council);
    const traceId = resolveTraceId(req);
    req.traceId = traceId;

    const workspaceId = typeof req.body?.workspaceId === 'string' && req.body.workspaceId.trim() ? req.body.workspaceId.trim() : 'business';
    const councilMembers = Array.isArray(req.body?.councilMembers) ? req.body.councilMembers : [];
    const normalizedFirst = String(firstMessage ?? message ?? text ?? content ?? '').trim();
    if (!normalizedFirst) {
      return res.status(400).json({ error: 'firstMessage is required', errorCode: 'INVALID_INPUT' });
    }
    if (!req.body) req.body = {};
    if (!req.body.firstMessage) req.body.firstMessage = normalizedFirst;

    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' });

    const { planCode, limits } = await getPlanForUser(user.id || user.email);
    const period = await getCurrentPeriodForUser(user.id, planCode);
    const used = await getTokensUsed(user.id, period);
    const allowance = limits.tokensPerMonth || 0;
    const paid = isPaidPlan(planCode);
    if (paid && allowance && used >= allowance) {
      console.warn('[CBT_QUOTA_BLOCKED] user=%s plan=%s used=%d allowance=%d', user.id, planCode, used, allowance);
      return res.status(402).json({
        error: 'CBT_EXHAUSTED',
        message: "You've used all included cbT for this month.",
        planCode,
        tokensUsedThisPeriod: used,
        tokensPerMonth: allowance,
      });
    }

    const activeContext = getActiveContext(user.id);
    if (!activeContext || activeContext.status !== 'active') {
      return res.status(409).json({
        error: 'ACTIVE_CONTEXT_REQUIRED',
        message: 'Select an agent/model and wait for active status before sending.',
        errorCode: 'ACTIVE_CONTEXT_REQUIRED',
      });
    }

    const payloadIds = Array.isArray(req.body?.payloadIds) ? req.body.payloadIds : null;
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
    const wantsStream = isSseRequest(req);

    const modelFromContext = activeContext?.model || model;
    const { chat, userMessage } = await createChat(req.userEmail, normalizedFirst, { model: modelFromContext, temperature, projectId, workspaceId, councilMembers });

    const councilSystem = buildCouncilSystem(chat.workspaceId || workspaceId || 'agency', chat.councilMembers || councilMembers);
    const history = [];
    if (councilSystem) history.push(councilSystem);

    const resolvedAgent = council.armed && council.agents.length ? getChatAgentOrNull(council.agents[0]) : null;
    const modelToUse = activeContext?.model || resolvedAgent?.modelId || chat.model;
    const systemPrompt = councilMeta ? `${SYSTEM_PROMPT}\n\n${councilMeta}` : SYSTEM_PROMPT;

    const usageContext = {
      userId: user.id,
      workspaceId,
      projectId,
      chatId: chat.id,
      planCode,
      agentId: activeContext?.agentId || resolvedAgent?.id || null,
      scenarioId: resolvedAgent ? 'council-pill' : null,
      contextId: activeContext?.contextId || null,
      temperature: chat.temperature,
      maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 4096,
      traceId,
    };

    const { aiContent, resolvedContext, routingReason } = await callLlmWithFallback({
      modelId: modelToUse,
      systemPrompt,
      userMessage: userMessage.content,
      history,
      usageContext,
      activeContext,
      council,
      requestedContext,
    });

    const assistantMessage = await saveAssistantMessage(
      chat.id,
      aiContent.text || aiContent,
      aiContent?.usage?.inputTokens || null,
      aiContent?.usage?.outputTokens || null,
    );

    const councilOut = chat.councilMembers || councilMembers;
    const replyText = aiContent.text || aiContent || '';
    const meta = buildMeta({
      traceId,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      accounting: aiContent?.accounting || null,
      payloads: hasPayloadRequest ? payloadMeta : undefined,
    });

    console.log('[CHAT_USAGE]', JSON.stringify({
      traceId,
      userId: user.id,
      workspaceId,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      tokens: meta.usage?.totalTokens || 0,
      costUsd: meta.usage?.costUsd || 0,
      costCbT: meta.usage?.costCbT || 0,
      walletAfter: meta.wallet?.afterCbT ?? null,
    }));

    if (wantsStream) {
      initSse(res);
      sendSse(res, 'route.resolved', {
        traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
      });
      const promptTokens = estimateTokens(userMessage.content);
      await streamTextChunks(res, traceId, replyText, {
        promptTokens,
        modelId: resolvedContext?.model || modelToUse,
      });
      sendSse(res, 'chat.final', {
        traceId,
        text: replyText,
        meta,
        chat: { ...chat, councilMembers: councilOut },
        messages: [userMessage, assistantMessage],
        councilMembers: councilOut,
      });
      return endSse(res);
    }

    return res.status(201).json({
      chat: { ...chat, councilMembers: councilOut },
      messages: [userMessage, assistantMessage],
      councilMembers: councilOut,
      usage: buildUsagePayload(aiContent),
      text: replyText,
      meta,
    });
  } catch (err) {
    return handleChatError(req, res, err);
  }
});

// POST /api/chats/:chatId/messages
router.post('/:chatId/messages', requireUser, async (req, res) => {
  try {
    const { message, content, text } = req.body || {};
    const normalizedText = String(message ?? text ?? content ?? '').trim();
    const council = normalizeCouncil(req.body);
    const councilMeta = buildCouncilMeta(council);
    const traceId = resolveTraceId(req);
    req.traceId = traceId;
    const councilMembers = Array.isArray(req.body?.councilMembers) ? req.body.councilMembers : [];
    if (!normalizedText) {
      return res.status(400).json({ error: 'content is required', errorCode: 'INVALID_INPUT' });
    }
    if (!req.body) req.body = {};
    if (!req.body.content) req.body.content = normalizedText;

    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' });

    const { planCode, limits } = await getPlanForUser(user.id || user.email);
    const period = await getCurrentPeriodForUser(user.id, planCode);
    const used = await getTokensUsed(user.id, period);
    const allowance = limits.tokensPerMonth || 0;
    const paid = isPaidPlan(planCode);
    if (paid && allowance && used >= allowance) {
      console.warn('[CBT_QUOTA_BLOCKED] user=%s plan=%s used=%d allowance=%d', user.id, planCode, used, allowance);
      return res.status(402).json({
        error: 'CBT_EXHAUSTED',
        message: "You've used all included cbT for this month.",
        planCode,
        tokensUsedThisPeriod: used,
        tokensPerMonth: allowance,
      });
    }

    const activeContext = getActiveContext(user.id);
    if (!activeContext || activeContext.status !== 'active') {
      return res.status(409).json({
        error: 'ACTIVE_CONTEXT_REQUIRED',
        message: 'Select an agent/model and wait for active status before sending.',
        errorCode: 'ACTIVE_CONTEXT_REQUIRED',
      });
    }

    const requestedContext = buildRequestedContext({ body: req.body, council, activeContext });
    const wantsStream = isSseRequest(req);

    const userMessage = await appendUserMessage(req.userEmail, req.params.chatId, normalizedText, councilMembers);

    const combo = await getChatWithMessages(req.userEmail, req.params.chatId);
    if (!combo) return res.status(404).json({ error: 'Chat not found', errorCode: 'NOT_FOUND' });

    const workspaceId = typeof req.body?.workspaceId === 'string' && req.body.workspaceId.trim()
      ? req.body.workspaceId.trim()
      : combo?.chat?.workspaceId || 'business';
    const payloadIds = Array.isArray(req.body?.payloadIds) ? req.body.payloadIds : null;
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

    if (isCouncilIntrospection({ text: normalizedText, council })) {
      const answer = buildCouncilIntrospectionAnswer(council);
      console.log('[COUNCIL_INTROSPECTION]', {
        route: req.originalUrl,
        council,
      });
      const assistantMessage = await saveAssistantMessage(
        combo.chat.id,
        answer,
        null,
        null,
      );

      const councilOut = userMessage.councilMembers || combo.chat.councilMembers || councilMembers;
      const meta = buildMeta({
        traceId,
        requested: requestedContext,
        resolved: buildResolvedContext({
          modelId: activeContext?.model,
          provider: activeContext?.provider,
          council,
        }),
        reason: deriveRoutingReason({ activeContext, requested: requestedContext }),
        accounting: null,
        payloads: hasPayloadRequest ? payloadMeta : undefined,
      });

      if (wantsStream) {
        initSse(res);
        sendSse(res, 'route.resolved', {
          traceId,
          requested: meta.requested,
          resolved: meta.resolved,
          reason: meta.reason,
        });
        await streamTextChunks(res, traceId, answer, { promptTokens: estimateTokens(normalizedText) });
        sendSse(res, 'chat.final', {
          traceId,
          text: answer,
          meta,
          chat: { ...combo.chat, councilMembers: councilOut },
          newMessages: [userMessage, assistantMessage],
          councilMembers: councilOut,
        });
        return endSse(res);
      }

      return res.status(201).json({
        chat: { ...combo.chat, councilMembers: councilOut },
        newMessages: [userMessage, assistantMessage],
        councilMembers: councilOut,
        usage: null,
        text: answer,
        meta,
      });
    }

    const historyMessages = combo.messages.slice(0, -1); // all except the latest user message
    const councilSystem = buildCouncilSystem(combo.chat.workspaceId || 'agency', userMessage.councilMembers || combo.chat.councilMembers || councilMembers);
    const history = [];
    if (councilSystem) history.push(councilSystem);
    history.push(...buildHistory(null, historyMessages));

    const resolvedAgent = council.armed && council.agents.length ? getChatAgentOrNull(council.agents[0]) : null;
    const modelToUse = activeContext?.model || resolvedAgent?.modelId || combo.chat.model;
    const systemPrompt = councilMeta ? `${SYSTEM_PROMPT}\n\n${councilMeta}` : SYSTEM_PROMPT;

    const usageContext = {
      userId: user.id,
      workspaceId: combo.chat.workspaceId || null,
      projectId: combo.chat.projectId || null,
      chatId: combo.chat.id,
      planCode,
      agentId: activeContext?.agentId || resolvedAgent?.id || null,
      scenarioId: resolvedAgent ? 'council-pill' : null,
      contextId: activeContext?.contextId || null,
      temperature: combo.chat.temperature,
      maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 4096,
      traceId,
    };

    const { aiContent, resolvedContext, routingReason } = await callLlmWithFallback({
      modelId: modelToUse,
      systemPrompt,
      userMessage: userMessage.content,
      history,
      usageContext,
      activeContext,
      council,
      requestedContext,
    });

    const assistantMessage = await saveAssistantMessage(
      combo.chat.id,
      aiContent.text || aiContent,
      aiContent?.usage?.inputTokens || null,
      aiContent?.usage?.outputTokens || null,
    );

    const councilOut = userMessage.councilMembers || combo.chat.councilMembers || councilMembers;
    const replyText = aiContent.text || aiContent || '';
    const meta = buildMeta({
      traceId,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      accounting: aiContent?.accounting || null,
      payloads: hasPayloadRequest ? payloadMeta : undefined,
    });

    console.log('[CHAT_USAGE]', JSON.stringify({
      traceId,
      userId: user.id,
      workspaceId: combo.chat.workspaceId || null,
      requested: requestedContext,
      resolved: resolvedContext,
      reason: routingReason,
      tokens: meta.usage?.totalTokens || 0,
      costUsd: meta.usage?.costUsd || 0,
      costCbT: meta.usage?.costCbT || 0,
      walletAfter: meta.wallet?.afterCbT ?? null,
    }));

    if (wantsStream) {
      initSse(res);
      sendSse(res, 'route.resolved', {
        traceId,
        requested: requestedContext,
        resolved: resolvedContext,
        reason: routingReason,
      });
      const promptTokens = estimateTokens(userMessage.content);
      await streamTextChunks(res, traceId, replyText, {
        promptTokens,
        modelId: resolvedContext?.model || modelToUse,
      });
      sendSse(res, 'chat.final', {
        traceId,
        text: replyText,
        meta,
        chat: { ...combo.chat, councilMembers: councilOut },
        newMessages: [userMessage, assistantMessage],
        councilMembers: councilOut,
      });
      return endSse(res);
    }

    return res.status(201).json({
      chat: { ...combo.chat, councilMembers: councilOut },
      newMessages: [userMessage, assistantMessage],
      councilMembers: councilOut,
      usage: buildUsagePayload(aiContent),
      text: replyText,
      meta,
    });
  } catch (err) {
    return handleChatError(req, res, err);
  }
});

// PATCH /api/chats/:chatId  (rename chat)
router.patch('/:chatId', requireUser, async (req, res, next) => {
  try {
    const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!rawTitle) {
      return res.status(400).json({ error: 'Title is required.' });
    }
    const updated = await updateChatTitle({ userEmail: req.userEmail, chatId: req.params.chatId, title: rawTitle });
    if (!updated) return res.status(404).json({ error: 'Chat not found.' });
    return res.json({ id: updated.id, title: updated.title });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chats/:chatId (soft delete)
router.delete('/:chatId', requireUser, async (req, res, next) => {
  try {
    await archiveChat({ chatId: req.params.chatId, userEmail: req.userEmail });
    return res.status(204).send();
  } catch (err) {
    if (err.status === 404 || err.message === 'not_found') {
      return res.status(404).json({ error: 'Chat not found' });
    }
    console.error('[CHATS] delete failed', err);
    return res.status(500).json({ error: 'Unable to delete chat.' });
  }
});

export default router;
