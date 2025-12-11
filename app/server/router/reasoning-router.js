import express from 'express';
import { getLevelEngine, buildLevelContext } from '../levels/index.js';

const router = express.Router();
const engine = getLevelEngine();

const CHECKOUT_FALLBACK_URL = process.env.REASONING_CHECKOUT_URL || 'https://buy.stripe.com/test_4gw4jl5lH80Ocnu8ww';
const DEFAULT_DURATION_MS = Number(process.env.REASONING_DURATION_MS) || 60 * 60 * 1000;

function resolveVisitorId(req, extra = {}) {
  const context = buildLevelContext(req, extra);
  return context.visitorId || extra.visitorId || 'local-dev';
}

router.post('/session', (req, res) => {
  const visitorId = String(req.body?.visitorId || resolveVisitorId(req)).trim();
  if (!visitorId) {
    return res.status(400).json({ error: 'visitorId required' });
  }

  const sessionId = `mock_${Date.now()}`;
  const checkoutUrl = `${CHECKOUT_FALLBACK_URL}?session_id=${encodeURIComponent(sessionId)}`;
  const reasoning = engine.activateReasoning(visitorId, { durationMs: DEFAULT_DURATION_MS });

  res.json({
    sessionId,
    checkoutUrl,
    reasoning,
    visitorId,
  });
});

router.get('/status', (req, res) => {
  const visitorId = resolveVisitorId(req);
  const reasoning = engine.getReasoningStatus(visitorId);
  res.json({ visitorId, reasoning });
});

export default router;
