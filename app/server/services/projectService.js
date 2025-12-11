import { query } from '../db.js';
import { getPlanConfig } from '../config/plans.js';
import { getUserById, getUserByEmail } from '../userStore.js';

function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    workspaceId: row.workspace_id || 'business',
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    archived: Boolean(row.archived_at),
  };
}

async function resolveUser(userIdOrEmail) {
  if (!userIdOrEmail) return null;
  if (String(userIdOrEmail).includes('@')) {
    return getUserByEmail(userIdOrEmail);
  }
  return (await getUserById(userIdOrEmail)) || getUserByEmail(userIdOrEmail);
}

export async function listProjectsForUser(userIdOrEmail, workspaceId = 'business') {
  const user = await resolveUser(userIdOrEmail);
  if (!user) return [];
  const res = await query(
    `SELECT id, user_id, name, workspace_id, created_at, archived_at
     FROM projects
     WHERE user_id = $1 AND archived_at IS NULL AND COALESCE(workspace_id, 'business') = $2
     ORDER BY created_at DESC`,
    [user.id, workspaceId || 'business'],
  );
  return res.rows.map(mapProject);
}

async function countActiveProjects(userId, workspaceId) {
  const res = await query(
    "SELECT COUNT(*)::int AS c FROM projects WHERE user_id = $1 AND archived_at IS NULL AND COALESCE(workspace_id, 'business') = $2",
    [userId, workspaceId || 'business'],
  );
  return res.rows?.[0]?.c || 0;
}

export async function createProjectForUser(userIdOrEmail, name, workspaceId = 'business') {
  const user = await resolveUser(userIdOrEmail);
  if (!user) throw new Error('user_not_found');
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    const err = new Error('invalid_name');
    err.status = 400;
    throw err;
  }
  const plan = getPlanConfig(user.planId);
  const max = plan.maxProjectsPerWorkspace || getPlanConfig('starter').maxProjectsPerWorkspace;
  const count = await countActiveProjects(user.id, workspaceId);
  if (count >= max) {
    const err = new Error('MAX_PROJECTS_REACHED');
    err.status = 402;
    err.code = 'MAX_PROJECTS_REACHED';
    err.message = 'You have reached the project limit for your plan.';
    console.warn('[PROJECTS] limit reached', { user: user.id, plan: user.planId, count, max, workspaceId });
    throw err;
  }

  const res = await query(
    `INSERT INTO projects (user_id, name, workspace_id)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, name, workspace_id, created_at, archived_at`,
    [user.id, trimmed.slice(0, 200), workspaceId || 'business'],
  );
  const project = mapProject(res.rows[0]);
  console.log('[PROJECTS] create', { user: user.id, project: project.id, name: project.name, workspaceId: project.workspaceId });
  return project;
}

export async function updateProjectForUser(userIdOrEmail, projectId, patch = {}) {
  const user = await resolveUser(userIdOrEmail);
  if (!user) throw new Error('user_not_found');
  const res = await query(
    `SELECT id, user_id, name, workspace_id, created_at, archived_at FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [projectId, user.id],
  );
  if (!res.rows.length) {
    const err = new Error('project_not_found');
    err.status = 404;
    throw err;
  }
  const current = res.rows[0];
  const nextName = typeof patch.name === 'string' ? patch.name.trim().slice(0, 200) : current.name;
  const archivedAt = patch.archived === true ? new Date().toISOString() : current.archived_at;

  const upd = await query(
    `UPDATE projects
       SET name = $3,
           archived_at = $4
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, name, workspace_id, created_at, archived_at`,
    [projectId, user.id, nextName || current.name, archivedAt],
  );
  return mapProject(upd.rows[0]);
}

export async function getProjectForUser(userIdOrEmail, projectId) {
  const user = await resolveUser(userIdOrEmail);
  if (!user) return null;
  const res = await query(
    `SELECT id, user_id, name, workspace_id, created_at, archived_at FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [projectId, user.id],
  );
  return mapProject(res.rows[0]);
}
