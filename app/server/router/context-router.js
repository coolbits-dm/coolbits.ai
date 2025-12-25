import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import { getActiveContext, activateContext } from '../services/activeContextService.js';

const router = express.Router();

router.use(requireUser);

router.get('/active', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = await getUserByEmail(req.userEmail || req.user?.email);
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }
  const context = getActiveContext(user.id) || null;
  return res.json({ ok: true, context });
});

router.post('/activate', async (req, res) => {
  const user = await getUserByEmail(req.userEmail || req.user?.email);
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
  }
  try {
    const requested = req.body && typeof req.body === 'object' ? req.body : {};
    const context = await activateContext(user.id, requested);
    return res.json({ ok: true, context });
  } catch (err) {
    const code = err?.code || 'CONTEXT_ACTIVATE_FAILED';
    const message = err?.message || 'Unable to activate context.';
    return res.status(400).json({ ok: false, error: { code, message } });
  }
});

export default router;
