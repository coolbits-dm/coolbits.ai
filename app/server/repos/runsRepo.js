import crypto from 'node:crypto';
import { query } from '../db.js';

export async function createRun({ workspaceId, clientId = null, title = null }) {
  if (!workspaceId) {
    throw new Error('workspaceId_required');
  }
  const runId = crypto.randomUUID();
  await query(
    `
    INSERT INTO runs (id, workspace_id, client_id, title, status)
    VALUES ($1, $2, $3, $4, 'running')
    `,
    [runId, workspaceId, clientId, title],
  );
  return runId;
}

export async function getRun(runId) {
  if (!runId) return null;
  const { rows } = await query(
    `
    SELECT *
    FROM runs
    WHERE id = $1
    LIMIT 1
    `,
    [runId],
  );
  return rows[0] || null;
}

export async function updateRunStatus(runId, status) {
  if (!runId || !status) return;
  await query(
    `
    UPDATE runs
    SET status = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [runId, status],
  );
}

export default {
  createRun,
  getRun,
  updateRunStatus,
};
