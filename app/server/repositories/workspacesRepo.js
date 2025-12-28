import { query } from '../db.js';

function normalizeRow(row) {
  if (!row) return null;
  return {
    ownerId: row.owner_id,
    id: row.id,
    workspaceType: row.workspace_type,
    systemKind: row.system_kind,
    slug: row.slug,
    name: row.name,
    isDeletable: row.is_deletable,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkspacesByOwner(ownerId) {
  const result = await query(
    `SELECT owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by, created_at, updated_at
     FROM workspaces
     WHERE owner_id = $1
     ORDER BY created_at ASC`,
    [ownerId],
  );
  return result.rows.map(normalizeRow);
}

export async function getWorkspaceById(ownerId, id) {
  const result = await query(
    `SELECT owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by, created_at, updated_at
     FROM workspaces
     WHERE owner_id = $1 AND id = $2
     LIMIT 1`,
    [ownerId, id],
  );
  return normalizeRow(result.rows[0]);
}

export async function listSystemWorkspaces(ownerId) {
  const result = await query(
    `SELECT owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by, created_at, updated_at
     FROM workspaces
     WHERE owner_id = $1 AND workspace_type = 'system'
     ORDER BY created_at ASC`,
    [ownerId],
  );
  return result.rows.map(normalizeRow);
}

export async function insertWorkspace({
  ownerId,
  id,
  workspaceType,
  systemKind = null,
  slug,
  name,
  isDeletable = true,
  createdBy = null,
}) {
  const result = await query(
    `INSERT INTO workspaces (owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (owner_id, id) DO NOTHING
     RETURNING owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by, created_at, updated_at`,
    [ownerId, id, workspaceType, systemKind, slug, name, isDeletable, createdBy],
  );
  return normalizeRow(result.rows[0]);
}

export async function countCustomWorkspaces(ownerId) {
  const result = await query(
    `SELECT COUNT(*)::int AS c
     FROM workspaces
     WHERE owner_id = $1 AND workspace_type = 'custom'`,
    [ownerId],
  );
  return result.rows[0]?.c || 0;
}

export async function updateWorkspaceName(ownerId, id, name) {
  const result = await query(
    `UPDATE workspaces
     SET name = $3,
         updated_at = now()
     WHERE owner_id = $1 AND id = $2
     RETURNING owner_id, id, workspace_type, system_kind, slug, name, is_deletable, created_by, created_at, updated_at`,
    [ownerId, id, name],
  );
  return normalizeRow(result.rows[0]);
}

export async function deleteWorkspace(ownerId, id) {
  const result = await query(
    `DELETE FROM workspaces
     WHERE owner_id = $1 AND id = $2
     RETURNING owner_id`,
    [ownerId, id],
  );
  return result.rowCount > 0;
}

export default {
  listWorkspacesByOwner,
  getWorkspaceById,
  listSystemWorkspaces,
  insertWorkspace,
  countCustomWorkspaces,
  updateWorkspaceName,
  deleteWorkspace,
};
