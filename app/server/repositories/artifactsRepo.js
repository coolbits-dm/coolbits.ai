import { query } from '../db.js';

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    contentType: row.content_type,
    bytes: Number(row.bytes || 0),
    sha256: row.sha256,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    retentionPolicy: row.retention_policy || null,
    derived: row.derived || null,
  };
}

export async function insertArtifact({
  id,
  workspaceId,
  name,
  contentType,
  bytes,
  sha256,
  storageProvider,
  storageKey,
  status,
  createdBy,
  retentionPolicy,
  derived,
}) {
  const result = await query(
    `INSERT INTO artifacts
      (id, workspace_id, name, content_type, bytes, sha256, storage_provider, storage_key, status, created_by, retention_policy, derived)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      workspaceId,
      name || null,
      contentType,
      bytes,
      sha256,
      storageProvider,
      storageKey,
      status,
      createdBy,
      retentionPolicy || null,
      derived || null,
    ],
  );
  return normalizeRow(result.rows[0]);
}

export async function getArtifactById(workspaceId, id) {
  const result = await query(
    `SELECT * FROM artifacts WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, id],
  );
  return normalizeRow(result.rows[0]);
}

export async function updateArtifactStatus({ workspaceId, id, status, derived }) {
  const result = await query(
    `UPDATE artifacts
     SET status = $3,
         derived = COALESCE($4, derived)
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [workspaceId, id, status, derived || null],
  );
  return normalizeRow(result.rows[0]);
}

export async function insertArtifactAttachment({
  workspaceId,
  artifactId,
  attachedToType,
  attachedToId,
  createdBy,
}) {
  const result = await query(
    `INSERT INTO artifact_attachments
      (workspace_id, artifact_id, attached_to_type, attached_to_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (artifact_id, attached_to_type, attached_to_id) DO NOTHING
     RETURNING *`,
    [workspaceId, artifactId, attachedToType, attachedToId, createdBy],
  );
  return result.rowCount > 0;
}
