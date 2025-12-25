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
import { getActiveContext } from '../services/activeContextService.js';
import {
  normalizeCouncil,
  isCouncilIntrospection,
  buildCouncilIntrospectionAnswer,
} from '../utils/councilUtils.js';

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
    const { firstMessage, model, temperature, projectId } = req.body || {};
    const council = normalizeCouncil(req.body);
    const councilMeta = buildCouncilMeta(council);

    const workspaceId = typeof req.body?.workspaceId === 'string' && req.body.workspaceId.trim() ? req.body.workspaceId.trim() : 'business';
    const councilMembers = Array.isArray(req.body?.councilMembers) ? req.body.councilMembers : [];
    if (!firstMessage || typeof firstMessage !== 'string') {
      return res.status(400).json({ error: 'firstMessage is required', errorCode: 'INVALID_INPUT' });
    }

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

    const modelFromContext = activeContext?.model || model;
    const { chat, userMessage } = await createChat(req.userEmail, firstMessage, { model: modelFromContext, temperature, projectId, workspaceId, councilMembers });

    const councilSystem = buildCouncilSystem(chat.workspaceId || workspaceId || 'agency', chat.councilMembers || councilMembers);
    const history = [];
    if (councilSystem) history.push(councilSystem);

    const resolvedAgent = council.armed && council.agents.length ? getChatAgentOrNull(council.agents[0]) : null;
    const modelToUse = activeContext?.model || resolvedAgent?.modelId || chat.model;
    const systemPrompt = councilMeta ? `${SYSTEM_PROMPT}\n\n${councilMeta}` : SYSTEM_PROMPT;

    const aiContent = await callLlm(modelToUse, {
      system: systemPrompt,
      user: userMessage.content,
      history,
      temperature: chat.temperature,
      maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 4096,
    }, {
      userId: user.id,
      workspaceId,
      projectId,
      chatId: chat.id,
      planCode,
      agentId: activeContext?.agentId || resolvedAgent?.id || null,
      scenarioId: resolvedAgent ? 'council-pill' : null,
      contextId: activeContext?.contextId || null,
    });

    const assistantMessage = await saveAssistantMessage(chat.id, aiContent.text || aiContent, aiContent?.usage?.inputTokens || null, aiContent?.usage?.outputTokens || null);

    const councilOut = chat.councilMembers || councilMembers;

    return res.status(201).json({
      chat: { ...chat, councilMembers: councilOut },
      messages: [userMessage, assistantMessage],
      councilMembers: councilOut,
      usage: buildUsagePayload(aiContent),
    });
  } catch (err) {
    return handleChatError(req, res, err);
  }
});

// POST /api/chats/:chatId/messages
router.post('/:chatId/messages', requireUser, async (req, res) => {
  try {
    const { message, content } = req.body || {};
    const text = (message ?? content ?? '').trim();
    const council = normalizeCouncil(req.body);
    const councilMeta = buildCouncilMeta(council);
    const councilMembers = Array.isArray(req.body?.councilMembers) ? req.body.councilMembers : [];
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required', errorCode: 'INVALID_INPUT' });
    }

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

    const userMessage = await appendUserMessage(req.userEmail, req.params.chatId, content, councilMembers);

    const combo = await getChatWithMessages(req.userEmail, req.params.chatId);
    if (!combo) return res.status(404).json({ error: 'Chat not found', errorCode: 'NOT_FOUND' });

    if (isCouncilIntrospection({ text, council })) {
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

      return res.status(201).json({
        chat: { ...combo.chat, councilMembers: councilOut },
        newMessages: [userMessage, assistantMessage],
        councilMembers: councilOut,
        usage: null,
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

    const aiContent = await callLlm(modelToUse, {
      system: systemPrompt,
      user: userMessage.content,
      history,
      temperature: combo.chat.temperature,
      maxTokens: Number(process.env.OPENAI_MAX_TOKENS) || 4096,
    }, {
      userId: user.id,
      workspaceId: combo.chat.workspaceId || null,
      projectId: combo.chat.projectId || null,
      chatId: combo.chat.id,
      planCode,
      agentId: activeContext?.agentId || resolvedAgent?.id || null,
      scenarioId: resolvedAgent ? 'council-pill' : null,
      contextId: activeContext?.contextId || null,
    });

    const assistantMessage = await saveAssistantMessage(combo.chat.id, aiContent.text || aiContent, aiContent?.usage?.inputTokens || null, aiContent?.usage?.outputTokens || null);

    const councilOut = userMessage.councilMembers || combo.chat.councilMembers || councilMembers;

    return res.status(201).json({
      chat: { ...combo.chat, councilMembers: councilOut },
      newMessages: [userMessage, assistantMessage],
      councilMembers: councilOut,
      usage: buildUsagePayload(aiContent),
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
