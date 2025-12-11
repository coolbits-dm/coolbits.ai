const DEFAULT_LIMIT = 50;

export class MemoryLevelStore {
  constructor(limit = DEFAULT_LIMIT) {
    this.limit = limit;
    this.decisions = [];
    this.unlocks = [];
    this.reasoningTokens = new Map();
  }

  async recordDecision(decision) {
    if (!decision) {
      return;
    }
    this.decisions.push(decision);
    if (this.decisions.length > this.limit) {
      this.decisions.shift();
    }
  }

  async recordUnlock(unlock) {
    if (!unlock) {
      return;
    }
    this.unlocks.push(unlock);
    if (this.unlocks.length > this.limit) {
      this.unlocks.shift();
    }
  }

  async recentDecisions(count = 10) {
    return this.decisions.slice(-count);
  }

  async recentUnlocks(count = 10) {
    return this.unlocks.slice(-count);
  }

  setReasoning(visitorId, options = {}) {
    if (!visitorId) {
      return null;
    }
    const durationMs = Number(options.durationMs) || 60 * 60 * 1000;
    const expiresAt = options.expiresAt || new Date(Date.now() + durationMs).toISOString();
    this.reasoningTokens.set(visitorId, { expiresAt, status: 'active' });
    return this.getReasoning(visitorId);
  }

  getReasoning(visitorId) {
    if (!visitorId) {
      return { active: false, pending: false, expiresAt: null };
    }
    const payload = this.reasoningTokens.get(visitorId);
    if (!payload) {
      return { active: false, pending: false, expiresAt: null };
    }
    if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
      this.reasoningTokens.delete(visitorId);
      return { active: false, pending: false, expiresAt: null };
    }
    return { active: true, pending: false, expiresAt: payload.expiresAt };
  }

  clearReasoning(visitorId) {
    if (!visitorId) {
      return;
    }
    this.reasoningTokens.delete(visitorId);
  }
}

export function createStorageAdapter(options = {}) {
  return new MemoryLevelStore(options.limit);
}
