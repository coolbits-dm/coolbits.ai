import { LevelEngine } from './level-engine.js';
import { createStorageAdapter } from './storage-adapter.js';

const levelEngine = new LevelEngine({ storageAdapter: createStorageAdapter() });

export function getLevelEngine() {
  return levelEngine;
}

export function buildLevelContext(req, extra = {}) {
  const headers = req?.headers || {};
  const query = req?.query || {};
  const body = req?.body || {};
  const cookieHeader = headers.cookie || '';
  const visitor =
    headers['x-visitor-id'] ||
    query.visitorId ||
    query.visitor ||
    body.visitorId ||
    extra.visitorId ||
    req?.ip ||
    'local-dev';
  return {
    visits: firstNumber(headers['x-level-visits'], query.visits, extra.visits),
    intentScore: firstNumber(headers['x-intent-score'], body.intentScore, extra.intentScore),
    sharedEmail: Boolean(coalesce(headers['x-level-email'], body.email, extra.sharedEmail)),
    hasSession: cookieHeader.includes('cb_session') || Boolean(extra.hasSession),
    completedOnboarding: coalesce(headers['x-level-onboarding'], extra.completedOnboarding),
    completedPayment: coalesce(headers['x-level-paid'], extra.completedPayment),
    tier: body.tier || headers['x-tier'] || extra.tier || 'guest',
    historySize: Array.isArray(body.history) ? body.history.length : firstNumber(extra.historySize),
    lastIntent: extra.lastIntent || null,
    visitorId: visitor,
  };
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}
