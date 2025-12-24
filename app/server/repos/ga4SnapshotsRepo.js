import { query } from '../db.js';

export async function createSnapshot({
  workspaceId,
  userId,
  propertyId,
  rangeFrom,
  rangeTo,
  blocks = [],
  compareMode = null,
  compareFrom = null,
  compareTo = null,
  label = null,
  payload,
}) {
  if (!workspaceId || !userId || !propertyId) {
    throw new Error('invalid_snapshot_identity');
  }
  if (!rangeFrom || !rangeTo) {
    throw new Error('invalid_snapshot_range');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid_snapshot_payload');
  }

  const blocksList = Array.isArray(blocks)
    ? blocks
      .map((b) => (b == null ? '' : String(b)).trim())
      .filter(Boolean)
    : [];
  const blocksJson = JSON.stringify(blocksList);
  const payloadJson = JSON.stringify(payload);
  const result = await query(
    `
    INSERT INTO ga4_snapshots (
      workspace_id,
      user_id,
      property_id,
      range_from,
      range_to,
      blocks,
      compare_mode,
      compare_from,
      compare_to,
      label,
      payload
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb)
    RETURNING id, created_at
    `,
    [
      workspaceId,
      userId,
      propertyId,
      rangeFrom,
      rangeTo,
      blocksJson,
      compareMode,
      compareFrom,
      compareTo,
      label,
      payloadJson,
    ],
  );

  const row = result.rows?.[0] || null;
  return row
    ? { id: row.id, createdAt: row.created_at }
    : null;
}

export async function listSnapshots({ workspaceId, userId, propertyId, limit = 20 }) {
  const limitNumber = Math.max(1, Math.min(50, Number(limit) || 20));
  const result = await query(
    `
    SELECT
      id,
      created_at,
      label,
      range_from::text AS range_from,
      range_to::text AS range_to,
      blocks,
      compare_mode,
      compare_from::text AS compare_from,
      compare_to::text AS compare_to
    FROM ga4_snapshots
    WHERE workspace_id = $1
      AND user_id = $2
      AND property_id = $3
    ORDER BY created_at DESC
    LIMIT $4
    `,
    [workspaceId, userId, propertyId, limitNumber],
  );
  return Array.isArray(result.rows) ? result.rows : [];
}

export async function getSnapshotById({ workspaceId, userId, id }) {
  if (!id) return null;
  const result = await query(
    `
    SELECT
      id,
      created_at,
      label,
      workspace_id,
      user_id,
      property_id,
      range_from::text AS range_from,
      range_to::text AS range_to,
      blocks,
      compare_mode,
      compare_from::text AS compare_from,
      compare_to::text AS compare_to,
      payload
    FROM ga4_snapshots
    WHERE id = $1
      AND workspace_id = $2
      AND user_id = $3
    LIMIT 1
    `,
    [id, workspaceId, userId],
  );
  return result.rows?.[0] || null;
}

export default {
  createSnapshot,
  listSnapshots,
  getSnapshotById,
};
