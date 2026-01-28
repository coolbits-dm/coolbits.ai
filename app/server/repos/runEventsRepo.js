import { query } from '../db.js';

export async function appendRunEventTx(client, { runId, kind, actor = {}, payload = {}, hashes = {} }) {
  if (!client) {
    throw new Error('client_required');
  }
  if (!runId || !kind) {
    throw new Error('invalid_run_event');
  }

  const lockRes = await client.query(
    `
    SELECT id
    FROM runs
    WHERE id = $1
    FOR UPDATE
    `,
    [runId],
  );
  if (!lockRes.rows?.length) {
    throw new Error('run_not_found');
  }

  const { rows } = await client.query(
    `
    SELECT COALESCE(MAX(seq), 0) AS max_seq
    FROM run_events
    WHERE run_id = $1
    `,
    [runId],
  );
  const seq = Number(rows?.[0]?.max_seq || 0) + 1;

  await client.query(
    `
    INSERT INTO run_events (run_id, seq, kind, actor, payload, hashes)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
    `,
    [
      runId,
      seq,
      kind,
      JSON.stringify(actor),
      JSON.stringify(payload),
      JSON.stringify(hashes),
    ],
  );

  return seq;
}

export async function listRunEvents(runId, { limit = 500 } = {}) {
  if (!runId) return [];
  const limitNumber = Math.max(1, Math.min(5000, Number(limit) || 500));
  const { rows } = await query(
    `
    SELECT *
    FROM run_events
    WHERE run_id = $1
    ORDER BY seq ASC
    LIMIT $2
    `,
    [runId, limitNumber],
  );
  return rows;
}

export default {
  appendRunEventTx,
  listRunEvents,
};
