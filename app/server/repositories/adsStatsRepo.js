import { query } from '../db.js';

/**
 * Bulk upsert daily campaign stats.
 * dailyRows: array of { date, campaign_id, campaign_name, campaign_type, network, device, impressions, clicks, cost_micros, conversions, conversion_value }
 */
export async function upsertCampaignDailyStats(workspaceId, { source, customerId, dailyRows }) {
  if (!workspaceId) throw new Error('adsStats.upsertCampaignDailyStats: workspaceId required');
  if (!source) throw new Error('adsStats.upsertCampaignDailyStats: source required');
  if (!customerId) throw new Error('adsStats.upsertCampaignDailyStats: customerId required');
  if (!Array.isArray(dailyRows) || dailyRows.length === 0) return 0;

  const values = [];
  const params = [];
  let idx = 1;

  for (const row of dailyRows) {
    const {
      date,
      campaign_id,
      campaign_name = null,
      campaign_type = null,
      network = null,
      device = null,
      impressions = 0,
      clicks = 0,
      cost_micros = 0,
      conversions = 0,
      conversion_value = 0,
    } = row;
    if (!date || !campaign_id) continue;

    values.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
    );
    params.push(
      workspaceId,
      source,
      customerId,
      date,
      campaign_id,
      campaign_name,
      campaign_type,
      network,
      device,
      impressions,
      clicks,
      cost_micros,
      conversions,
      conversion_value,
    );
  }

  if (!values.length) return 0;

  const sql = `
    INSERT INTO ads_daily_stats (
      workspace_id,
      source,
      customer_id,
      date,
      campaign_id,
      campaign_name,
      campaign_type,
      network,
      device,
      impressions,
      clicks,
      cost_micros,
      conversions,
      conversion_value
    )
    VALUES ${values.join(', ')}
    ON CONFLICT (workspace_id, source, customer_id, date, campaign_id)
    DO UPDATE SET
      campaign_name = EXCLUDED.campaign_name,
      campaign_type = EXCLUDED.campaign_type,
      network = EXCLUDED.network,
      device = EXCLUDED.device,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      cost_micros = EXCLUDED.cost_micros,
      conversions = EXCLUDED.conversions,
      conversion_value = EXCLUDED.conversion_value
  `;

  const { rowCount } = await query(sql, params);
  return rowCount;
}

export async function aggregateForPeriod(workspaceId, { dateFrom, dateTo }) {
  const { rows } = await query(
    `
    SELECT
      MIN(date) AS period_from,
      MAX(date) AS period_to,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(cost_micros) AS cost_micros,
      SUM(conversions) AS conversions,
      SUM(conversion_value) AS conversion_value
    FROM ads_daily_stats
    WHERE workspace_id = $1
      AND date >= $2
      AND date <= $3
    `,
    [workspaceId, dateFrom, dateTo],
  );
  return rows[0] || null;
}

export default { upsertCampaignDailyStats, aggregateForPeriod };
