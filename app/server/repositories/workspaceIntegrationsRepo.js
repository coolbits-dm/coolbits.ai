import { query } from '../db.js';

export async function getGoogleAdsConfigForWorkspace(workspaceId) {
  const { rows } = await query(
    `
    SELECT
      external_customer_id,
      mcc_id,
      status,
      metadata
    FROM workspace_integrations
    WHERE workspace_id = $1
      AND provider = 'google_ads'
    LIMIT 1
    `,
    [workspaceId],
  );

  const row = rows[0];
  if (!row) return null;
  if (row.status !== 'active') return null;

  return {
    customerId: row.external_customer_id,
    mccId: row.mcc_id,
    metadata: row.metadata || {},
  };
}

export default { getGoogleAdsConfigForWorkspace };
