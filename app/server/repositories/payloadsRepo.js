import { query } from '../db.js';

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    kind: row.kind,
    schemaVersion: row.schema_version,
    hash: row.hash,
    contentJson: row.content_json,
    contentBytes: row.content_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    inserted: row.inserted === true,
  };
}

export async function findPayloadByHash(workspaceId, hash) {
  const result = await query(
    `SELECT * FROM payloads WHERE workspace_id = $1 AND hash = $2 LIMIT 1`,
    [workspaceId, hash],
  );
  return normalizeRow(result.rows[0]);
}

export async function insertPayload({
  id,
  workspaceId,
  name,
  kind,
  schemaVersion,
  hash,
  contentJson,
  contentBytes,
  createdBy,
}) {
  const result = await query(
    `INSERT INTO payloads
      (id, workspace_id, name, kind, schema_version, hash, content_json, content_bytes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (workspace_id, hash)
     DO UPDATE SET name = payloads.name
     RETURNING *, (xmax = 0) AS inserted`,
    [
      id,
      workspaceId,
      name || null,
      kind,
      schemaVersion,
      hash,
      contentJson,
      contentBytes || null,
      createdBy,
    ],
  );
  return normalizeRow(result.rows[0]);
}

export async function getPayloadById(workspaceId, id) {
  const result = await query(
    `SELECT * FROM payloads WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, id],
  );
  return normalizeRow(result.rows[0]);
}

export async function getPayloadsByIds(workspaceId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const result = await query(
    `SELECT * FROM payloads WHERE workspace_id = $1 AND id = ANY($2::text[])`,
    [workspaceId, ids],
  );
  return result.rows.map(normalizeRow).filter(Boolean);
}

export async function deletePayloadById(workspaceId, id) {
  const result = await query(
    `DELETE FROM payloads WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  return result.rowCount > 0;
}

export async function updatePayloadName(workspaceId, id, name) {
  const result = await query(
    `UPDATE payloads
     SET name = $3
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, name, kind, schema_version, hash, created_by, created_at`,
    [workspaceId, id, name || null],
  );
  return normalizeRow(result.rows[0]);
}

export async function listPayloads(workspaceId, { kind, q, limit, cursor } = {}) {
  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  let idx = 2;

  if (kind) {
    where.push(`kind = $${idx}`);
    params.push(kind);
    idx += 1;
  }

  if (q) {
    where.push(`(name ILIKE $${idx} OR id ILIKE $${idx} OR hash ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx += 1;
  }

  if (cursor && cursor.createdAt && cursor.id) {
    where.push(`(created_at, id) < ($${idx}::timestamptz, $${idx + 1})`);
    params.push(cursor.createdAt, cursor.id);
    idx += 2;
  }

  const sql = `
    SELECT id, workspace_id, name, kind, schema_version, hash, created_by, created_at
    FROM payloads
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT $${idx}
  `;

  params.push(limit + 1);

  const result = await query(sql, params);
  const rows = result.rows.map(normalizeRow).filter(Boolean);

  let nextCursor = null;
  let items = rows;
  if (rows.length > limit) {
    items = rows.slice(0, limit);
    const last = items[items.length - 1];
    nextCursor = { createdAt: last.createdAt, id: last.id };
  }

  return { items, nextCursor };
}
