import { getChatCapabilities } from './chat-levels.js';
import { getReasoningRecord } from '../billing/reasoning-db.js';

const MOCK_UNLOCKS = {
  'level-0': ['Visit chat to start a guided conversation.', 'Share more intent to unlock Level 1.'],
  'level-1': ['Describe your systems for deeper prompts.', 'Drop a business email to start onboarding.'],
  'level-2': ['Complete onboarding to unlock the portal.', 'Invite collaborators once Level 3 is ready.'],
  'level-3': ['Add billing to unlock full reasoning.', 'Enable cbTokens top-ups for automation flows.'],
  'level-4': ['Reasoning is live. Monitor usage in the portal.'],
};

function normalizeBoolean(value) {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['false', '0', 'no', 'n', ''].includes(normalized)) {
      return false;
    }
    return true;
  }
  return Boolean(value);
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class LevelEngine {
  constructor({ storageAdapter } = {}) {
    this.storage = storageAdapter;
    this.defaultReasoningDurationMs = Number(process.env.REASONING_DURATION_MS) || 60 * 60 * 1000;
  }

  normalizeContext(context = {}) {
    return {
      visits: Math.max(0, numeric(context.visits)),
      intentScore: Math.max(0, numeric(context.intentScore)),
      sharedEmail: normalizeBoolean(context.sharedEmail),
      hasSession: normalizeBoolean(context.hasSession),
      completedOnboarding: normalizeBoolean(context.completedOnboarding),
      completedPayment: normalizeBoolean(context.completedPayment),
      tier: String(context.tier || 'guest'),
      historySize: Math.max(0, numeric(context.historySize)),
      lastIntent: context.lastIntent || null,
      visitorId: context.visitorId || 'local-dev',
    };
  }

  evaluate(normalized) {
    if (normalized.completedPayment) {
      return { level: 'level-4', trigger: 'payment-confirmed' };
    }
    if (normalized.completedOnboarding && normalized.hasSession) {
      return { level: 'level-3', trigger: 'onboarding-complete' };
    }
    if (normalized.sharedEmail || normalized.intentScore >= 70) {
      return { level: 'level-2', trigger: 'contact-shared' };
    }
    if (normalized.visits >= 2 || normalized.intentScore >= 40 || normalized.historySize >= 3) {
      return { level: 'level-1', trigger: 'engagement-signal' };
    }
    return { level: 'level-0', trigger: 'default' };
  }

  detect(context = {}) {
    const normalized = this.normalizeContext(context);
    const outcome = this.evaluate(normalized);
    const decision = {
      level: outcome.level,
      trigger: outcome.trigger,
      context: normalized,
      timestamp: new Date().toISOString(),
    };
    this.storage?.recordDecision(decision);
    return decision;
  }

  getMockUnlocks(level) {
    const normalized = String(level || 'level-0').toLowerCase();
    return MOCK_UNLOCKS[normalized] || MOCK_UNLOCKS['level-0'];
  }

  shouldTriggerOnboarding(profile = {}) {
    const level = String(profile.level || 'level-0').toLowerCase();
    const sharedEmail = normalizeBoolean(profile.sharedEmail);
    return level === 'level-1' && !sharedEmail;
  }

  getChatInterface(level) {
    return getChatCapabilities(level);
  }

  getReasoningStatus(visitorId) {
    const record = getReasoningRecord(visitorId);
    if (record) {
      const payload = {
        active: record.status === 'active',
        pending: record.status === 'pending',
        expiresAt: record.expiresAt || record.expectedActivation || null,
        source: record.source,
      };
      return payload;
    }
    if (!this.storage) {
      return { active: false, pending: false, expiresAt: null };
    }
    return this.storage.getReasoning(visitorId);
  }

  activateReasoning(visitorId, options = {}) {
    if (!this.storage || !visitorId) {
      return { active: false, expiresAt: null };
    }
    const durationMs = Number(options.durationMs) || this.defaultReasoningDurationMs;
    return this.storage.setReasoning(visitorId, { durationMs });
  }

  clearReasoning(visitorId) {
    this.storage?.clearReasoning(visitorId);
  }

  buildProfile(context = {}) {
    const decision = this.detect(context);
    const capabilities = this.getChatInterface(decision.level);
    const reasoning = this.getReasoningStatus(context.visitorId || 'local-dev');
    return {
      visitorId: context.visitorId || 'local-dev',
      level: decision.level,
      trigger: decision.trigger,
      capabilities,
      unlocks: this.getMockUnlocks(decision.level),
      onboarding: {
        shouldPrompt: this.shouldTriggerOnboarding({
          level: decision.level,
          sharedEmail: context.sharedEmail,
        }),
      },
      reasoning,
      decision,
    };
  }
}
