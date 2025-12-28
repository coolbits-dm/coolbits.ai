import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import {
  createPayload,
  listPayloads,
  getPayload,
  deletePayload,
  renamePayload,
  decodeCursor,
  encodeCursor,
} from '../services/payloadService.js';
import { assertWorkspaceAccess } from '../services/workspaceService.js';

const router = express.Router();
const MAX_PAGE_SIZE = 50;

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

function getWorkspaceId(req) {
  const candidate = req.body?.workspaceId || req.query?.workspaceId || req.workspaceId || 'business';
  return String(candidate || 'business').trim() || 'business';
}

function respondError(res, err) {
  const status = err?.status || 400;
  const code = err?.code || 'payload_error';
  const message = err?.message || 'Payload request failed.';
  return res.status(status).json({ error: code, message });
}

router.post('/', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
    const { name, kind, cbpl } = req.body || {};

    const result = await createPayload({
      workspaceId,
      userId: user.id || user.email,
      name,
      kind,
      cbpl,
    });

    return res.status(201).json({
      payloadId: result.id,
      hash: result.hash,
      deduped: result.deduped,
    });
  } catch (err) {
    return respondError(res, err);
  }
});

router.get('/', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
    const kind = typeof req.query.kind === 'string' && req.query.kind.trim() ? req.query.kind.trim() : null;
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
    const limitRaw = parseInt(req.query.limit || '20', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_PAGE_SIZE) : 20;
    const cursor = decodeCursor(req.query.cursor);

    const { items, nextCursor } = await listPayloads({ workspaceId, kind, q, limit, cursor });

    return res.json({
      items,
      nextCursor: encodeCursor(nextCursor),
    });
  } catch (err) {
    return respondError(res, err);
  }
});

router.get('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
    const id = req.params.id;
    const payload = await getPayload({ workspaceId, id });
    if (!payload) {
      return res.status(404).json({ error: 'payload_not_found' });
    }
    return res.json({ payload });
  } catch (err) {
    return respondError(res, err);
  }
});

router.delete('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
    const id = req.params.id;
    const deleted = await deletePayload({ workspaceId, id });
    if (!deleted) {
      return res.status(404).json({ error: 'payload_not_found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return respondError(res, err);
  }
});

router.patch('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const requestedWorkspaceId = getWorkspaceId(req);
    const planId = user.planId || user.plan_id || null;
    const capabilities = Array.isArray(user.workspacesAllowed)
      ? { workspacesAllowed: user.workspacesAllowed }
      : null;
    const workspace = await assertWorkspaceAccess({
      ownerId: user.id || user.email,
      workspaceId: requestedWorkspaceId,
      planId,
      capabilities,
    });
    const workspaceId = workspace.id;
    const id = req.params.id;
    const name = req.body?.name ?? '';
    const payload = await renamePayload({ workspaceId, id, name });
    if (!payload) {
      return res.status(404).json({ error: 'payload_not_found' });
    }
    return res.json({ payload });
  } catch (err) {
    return respondError(res, err);
  }
});

export default router;
