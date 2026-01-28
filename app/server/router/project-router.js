import express from 'express';
import { requireUser } from '../middleware/auth.js';
import {
  listProjectsForUser,
  createProjectForUser,
  updateProjectForUser,
  getProjectForUser,
} from '../services/projectService.js';

const router = express.Router();

function getWorkspaceId(req) {
  const candidate = req.workspaceId || null;
  return candidate ? String(candidate).trim() : null;
}

function handleProjectError(req, res, err, route = 'unknown') {
  console.error('[PROJECT_ERROR]', {
    route,
    email: req.userEmail,
    body: req.body,
    error: err?.message,
    code: err?.code,
    stack: err?.stack,
  });
  if (err?.code === 'MAX_PROJECTS_REACHED' || err?.message === 'MAX_PROJECTS_REACHED') {
    return res.status(402).json({
      error: "You've reached the project limit for this workspace.",
      errorCode: 'MAX_PROJECTS_REACHED',
    });
  }
  return res.status(500).json({ error: 'Internal error', errorCode: 'PROJECT_INTERNAL_ERROR' });
}



// GET /api/projects
router.get('/', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    console.debug('[WORKSPACE]', { route: '/api/projects', email: req.userEmail, workspaceId });
    const projects = await listProjectsForUser(req.userEmail, workspaceId);
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects
router.post('/', requireUser, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    if (!name) {
      return res.status(400).json({ error: 'invalid_name', message: 'Project name is required.' });
    }
    const project = await createProjectForUser(req.userEmail, name, workspaceId);
    res.status(201).json(project);
  } catch (err) {
    return handleProjectError(req, res, err, 'POST /api/projects');
  }
});

// PATCH /api/projects/:id
router.patch('/:id', requireUser, async (req, res, next) => {
  try {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return res.status(403).json({ error: 'workspace_not_bound' });
    }
    const project = await getProjectForUser(req.userEmail, req.params.id);
    if (!project || project.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'not_found' });
    }
    const patch = {};
    if (typeof req.body?.name === 'string') {
      patch.name = req.body.name.trim();
    }
    if (typeof req.body?.archived === 'boolean') {
      patch.archived = req.body.archived;
    }
    const updated = await updateProjectForUser(req.userEmail, req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  } catch (err) {
    if (err.status === 404 || err.message === 'project_not_found') {
      return res.status(404).json({ error: 'not_found' });
    }
    next(err);
  }
});

export default router;
