import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { logError } from '../logger.js';

const router = express.Router();

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validatePayload(body = {}) {
  const errors = {};
  const payload = {
    name: normalizeString(body.name),
    email: normalizeString(body.email),
    company: normalizeString(body.company),
    website: normalizeString(body.website),
    monthlySpend: normalizeString(body.monthlySpend),
    interests: Array.isArray(body.interests)
      ? body.interests.map(normalizeString).filter(Boolean)
      : [],
    message: normalizeString(body.message),
    planCode: normalizeString(body.planCode),
    origin: normalizeString(body.origin),
  };

  if (!payload.name) errors.name = 'required';
  if (!payload.email) errors.email = 'required';
  if (!payload.monthlySpend) errors.monthlySpend = 'required';
  if (!payload.message) errors.message = 'required';
  if (!payload.interests.length) errors.interests = 'at_least_one_required';

  return { payload, errors };
}

router.post('/enterprise', requireUser, async (req, res) => {
  const { payload, errors } = validatePayload(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Invalid payload', details: errors });
  }

  try {
    const user = await getUserByEmail(req.userEmail);
    const logEntry = {
      tag: '[ENTERPRISE_CONTACT_REQUEST]',
      userId: user?.id || 'unknown',
      userEmail: req.userEmail || payload.email || 'unknown',
      planCode: payload.planCode || user?.planId || 'unknown',
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      ts: new Date().toISOString(),
      payload,
    };
    console.log(
      `${logEntry.tag} userId=${logEntry.userId} email=${logEntry.userEmail} planCode=${logEntry.planCode} ip=${logEntry.ip} ts=${logEntry.ts} payload=${JSON.stringify(payload)}`,
    );

    return res.json({ ok: true });
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
