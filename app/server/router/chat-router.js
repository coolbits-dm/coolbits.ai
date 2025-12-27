import express from 'express';
import { handleChat, handleChatStream } from '../chat.js';
import {
  normalizeCouncil,
  isCouncilIntrospection,
  buildCouncilIntrospectionAnswer,
} from '../utils/councilUtils.js';
import { requireUserOptional } from '../middleware/auth.js';
import { rateLimitChatUserWorkspace } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/', requireUserOptional, rateLimitChatUserWorkspace, (req, res) => {
  const { message, content, text } = req.body || {};
  const normalized = String(message ?? text ?? content ?? '').trim();
  if (!normalized) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (!req.body) req.body = {};
  if (!req.body.message) req.body.message = normalized;

  // Normalize optional agent key from the frontend pill
  const agentKey =
    (typeof req.body?.agentKey === 'string' && req.body.agentKey) ||
    (typeof req.body?.agent === 'string' && req.body.agent) ||
    null;
  if (agentKey) {
    req.chatAgentKey = agentKey;
  }

  const council = normalizeCouncil(req.body);

  if (isCouncilIntrospection({ text, council })) {
    const answer = buildCouncilIntrospectionAnswer(council);
    console.log('[COUNCIL_INTROSPECTION]', {
      route: req.originalUrl,
      council,
    });
    return res.status(200).json({
      ok: true,
      type: 'council-introspection',
      message: {
        role: 'assistant',
        content: answer,
      },
      usage: null,
    });
  }

  req.council = council;
  return handleChat({ req, res, council });
});

router.post('/stream', requireUserOptional, rateLimitChatUserWorkspace, (req, res) => {
  const { message, content, text } = req.body || {};
  const normalized = String(message ?? text ?? content ?? '').trim();
  if (!normalized) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (!req.body) req.body = {};
  if (!req.body.message) req.body.message = normalized;

  const agentKey =
    (typeof req.body?.agentKey === 'string' && req.body.agentKey) ||
    (typeof req.body?.agent === 'string' && req.body.agent) ||
    null;
  if (agentKey) {
    req.chatAgentKey = agentKey;
  }

  const council = normalizeCouncil(req.body);
  req.council = council;
  return handleChatStream({ req, res, council });
});

export default router;
