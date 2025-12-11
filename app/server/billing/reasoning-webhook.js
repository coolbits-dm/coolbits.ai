import { activateReasoningToken } from './reasoning-db.js';

export async function handleReasoningWebhook(req) {
  const useRealStripe = String(process.env.USE_REAL_STRIPE_REASONING || '').toLowerCase() === 'true';
  if (!useRealStripe) {
    return { ok: true, mode: 'mock' };
  }
  throw new Error('Stripe webhook handling not implemented yet.');
}

export function simulateWebhookActivation(sessionId, options = {}) {
  return activateReasoningToken(sessionId, options);
}
