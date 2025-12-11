import crypto from 'node:crypto';
import { queueReasoningToken } from './reasoning-db.js';

const MOCK_CHECKOUT_BASE = 'https://billing.coolbits.ai/mock-checkout';

export async function createReasoningCheckoutSession(payload = {}) {
  const visitorId = payload.visitorId || `anon-${crypto.randomUUID()}`;
  const durationMs = Number(process.env.REASONING_DURATION_MS || 15 * 60 * 1000);
  const useRealStripe = String(process.env.USE_REAL_STRIPE_REASONING || '').toLowerCase() === 'true';

  if (!useRealStripe) {
    const sessionId = `mock_session_${Date.now()}`;
    queueReasoningToken({ visitorId, sessionId, durationMs, status: 'pending', source: 'mock' });
    return {
      mode: 'mock',
      visitorId,
      checkoutSessionId: sessionId,
      checkoutUrl: `${MOCK_CHECKOUT_BASE}?session_id=${sessionId}`,
      expiresAt: new Date(Date.now() + durationMs).toISOString(),
    };
  }

  // Placeholder: Stripe integration to be implemented when USE_REAL_STRIPE_REASONING=true
  throw new Error('Real Stripe reasoning integration not implemented.');
}
