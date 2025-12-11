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
import { normalizeCouncil } from './utils/councilUtils.js';

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

  console.log('[CHAT_ENTRY]', JSON.stringify({
    body: req.body,
    timestamp: Date.now(),
    council,
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

    const userPayload = () =>
      authedUser
        ? {
            user: {
              email: authedUser.email,
              plan: planMeta?.planCode || authedUser.planId,
              tokensRemaining: Math.max((tokensAllowance || 0) - (tokensUsedThisPeriod || 0), 0),
              totalUsed: tokensUsedThisPeriod,
            },
          }
        : {};

    const respond = (payload) => res.json({ ...sharedResponse, ...payload, ...userPayload() });

    if (intent === 'out-of-scope') {
      return respond({ intent, reply: GUARDRAIL_RESPONSE });
    }

    if (intent === 'about-us') {
      const message =
        redirectMessage || 'CoolBits.ai is an independent AI development studio.';
      return respond({
        intent,
        reply: appendClean(message),
        suggestions: getSuggestions(language),
      });
    }

    if (!USE_REAL_LLM) {
      return respond({ intent, ...buildMockPayload(userMessage) });
    }

    let model = chatAgent?.config?.modelId
      ? chatAgent.config.modelId
      : selectModel(intent, userMessage, Boolean(reasoning?.active));

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

    const aiContent = await callLlm(
      model,
      {
        system: systemPrompt,
        user: userMessage,
        history,
        temperature: 0.3,
        maxTokens: DEFAULT_MAX_TOKENS,
      },
      authedUser
        ? {
            userId: authedUser.id,
            workspaceId: req.body?.workspaceId || 'business',
            chatId: null,
            agentId: chatAgent?.config?.id || null,
            scenarioId: chatAgent ? 'council-pill' : null,
            planCode: planMeta?.planCode,
          }
        : null,
    );

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
      model,
      reply: rawModelReply,
      usage: aiContent.usage || null,
    };

    if (intent === 'smalltalk-safe') {
      payload.suggestions = getSuggestions(language);
    }

    return respond(payload);
  } catch (error) {
    logError(error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
