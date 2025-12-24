import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { logError } from '../logger.js';
import { handlePublicContact } from '../services/publicContactService.js';

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
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `enterprise-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const userId = user?.id || 'unknown';
    const planCode = payload.planCode || user?.planId || 'unknown';
    console.log(`[ENTERPRISE_CONTACT] reqId=${requestId} userId=${userId} planCode=${planCode}`);

    return res.json({ ok: true });
  } catch (err) {
    logError(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/', handlePublicContact);

export default router;
