import express from 'express';
import { requireUser } from '../middleware/auth.js';
import { getUserByEmail } from '../userStore.js';
import {
  listWorkspaces,
  createCustomWorkspace,
  renameWorkspace,
  deleteWorkspaceById,
} from '../services/workspaceService.js';

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  next();
});

function respondError(res, err) {
  const status = err?.status || 400;
  const code = err?.code || 'workspace_error';
  const message = err?.message || 'Workspace request failed.';
  return res.status(status).json({ error: code, message });
}

router.get('/', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const items = await listWorkspaces({ ownerId: user.id || user.email });
    return res.json({ items });
  } catch (err) {
    return respondError(res, err);
  }
});

router.post('/', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const name = req.body?.name || '';
    const created = await createCustomWorkspace({
      ownerId: user.id || user.email,
      createdBy: user,
      name,
    });

    return res.status(201).json({ workspace: created });
  } catch (err) {
    return respondError(res, err);
  }
});

router.patch('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const name = req.body?.name || '';
    const updated = await renameWorkspace({ ownerId: user.id || user.email, id, name });
    return res.json({ workspace: updated });
  } catch (err) {
    return respondError(res, err);
  }
});

router.delete('/:id', requireUser, async (req, res) => {
  try {
    const user = await getUserByEmail(req.userEmail || req.user?.email);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const id = req.params.id;
    const result = await deleteWorkspaceById({ ownerId: user.id || user.email, id });
    return res.json(result);
  } catch (err) {
    return respondError(res, err);
  }
});

export default router;
