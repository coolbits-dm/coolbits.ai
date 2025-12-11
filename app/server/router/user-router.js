import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail, updateUser } from '../userStore.js';
import { getPlanConfig, getCapabilities } from '../config/plans.js';

const router = express.Router();

router.post('/user/workspaces', requireUser, async (req, res) => {
  try {
    const email = req.userEmail || req.user?.email;
    const { selectedWorkspaces } = req.body || {};

    if (!email) {
      return res.status(401).json({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' });
    }
    if (!Array.isArray(selectedWorkspaces)) {
      return res.status(400).json({ error: 'Invalid payload', errorCode: 'INVALID_INPUT' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', errorCode: 'UNAUTHENTICATED' });
    }

    const planConfig = getPlanConfig(user.planId);
    const capabilities = getCapabilities(user.planId);
    const allowed = (user.workspacesAllowed && user.workspacesAllowed.length)
      ? user.workspacesAllowed
      : (capabilities.workspacesAllowed || planConfig.defaultWorkspaces || []);
    const max = capabilities.maxWorkspaces || planConfig.maxWorkspaces || 1;

    const uniqueSelection = Array.from(new Set(selectedWorkspaces.map((ws) => String(ws || '').trim()).filter(Boolean)));

    if (!uniqueSelection.length) {
      return res.status(400).json({ error: 'Select at least one workspace.', errorCode: 'NO_WORKSPACE_SELECTED' });
    }
    if (uniqueSelection.length > max) {
      console.warn('[WORKSPACES] limit', { email, max, requested: uniqueSelection.length, plan: user.planId });
      return res.status(400).json({
        error: `Your plan allows up to ${max} workspaces.`,
        errorCode: 'TOO_MANY_WORKSPACES',
      });
    }
    const invalid = uniqueSelection.filter((ws) => !allowed.includes(ws));
    if (invalid.length) {
      console.warn('[WORKSPACES] not allowed', { email, invalid, allowed, plan: user.planId });
      return res.status(400).json({
        error: 'One or more workspaces are not allowed by your plan.',
        errorCode: 'WORKSPACE_NOT_ALLOWED',
      });
    }

    await updateUser({ email: user.email, workspacesSelected: uniqueSelection });

    return res.json({ ok: true, workspacesSelected: uniqueSelection });
  } catch (err) {
    console.error('[USER_WORKSPACES_ERROR]', { error: err?.message, stack: err?.stack });
    return res.status(500).json({ error: 'Internal error', errorCode: 'USER_WORKSPACES_INTERNAL' });
  }
});

export default router;