import { getGoogleAdsConfigForWorkspace } from '../repositories/workspaceIntegrationsRepo.js';
import { upsertCampaignDailyStats } from '../repositories/adsStatsRepo.js';

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Core DTO used by agents/tools.
 * {
 *   workspace_id,
 *   customer_id,
 *   period_from,
 *   period_to,
 *   campaigns: [
 *     { id, name, status, channel, cost_micros, conv, conv_value, clicks, impressions }
 *   ]
 * }
 */
export async function fetchCampaignSummary(workspaceId, params = {}) {
  const cfg = await getGoogleAdsConfigForWorkspace(workspaceId);
  if (!cfg) {
    throw new Error(`google_ads.read:no_integration_for_workspace:${workspaceId}`);
  }

  const { customerId } = cfg;
  const period_from = params.period_from || params.dateFrom || getDefaultFromDate();
  const period_to = params.period_to || params.dateTo || getTodayDate();

  // TODO: Replace rawRows with real Google Ads API call.
  const rawRows = [];

  const campaignsMap = new Map();

  for (const row of rawRows) {
    const date = row.date;
    const cid = row.campaignId;
    const key = cid;

    const impressions = Number(row.metricsImpressions || 0);
    const clicks = Number(row.metricsClicks || 0);
    const cost_micros = Number(row.metricsCostMicros || 0);
    const conv = Number(row.metricsConversions || 0);
    const conv_value = Number(row.metricsConversionValue || 0);

    const acc = campaignsMap.get(key) || {
      id: cid,
      name: row.campaignName,
      status: row.campaignStatus,
      channel: row.advertisingChannelType,
      cost_micros: 0,
      conv: 0,
      conv_value: 0,
      clicks: 0,
      impressions: 0,
      _daily: [],
    };

    acc.impressions += impressions;
    acc.clicks += clicks;
    acc.cost_micros += cost_micros;
    acc.conv += conv;
    acc.conv_value += conv_value;

    acc._daily.push({
      date,
      campaign_id: cid,
      campaign_name: row.campaignName,
      campaign_type: row.advertisingChannelType,
      network: row.advertisingChannelType,
      device: null,
      impressions,
      clicks,
      cost_micros,
      conversions: conv,
      conversion_value: conv_value,
    });

    campaignsMap.set(key, acc);
  }

  const campaigns = Array.from(campaignsMap.values()).map((c) => {
    delete c._daily;
    return c;
  });

  console.info('[GOOGLE_ADS] campaign summary fetched', {
    workspaceId,
    customerId,
    period_from,
    period_to,
    campaigns_count: campaigns.length,
  });

  return {
    workspace_id: workspaceId,
    customer_id: customerId,
    period_from,
    period_to,
    campaigns,
    _daily_raw: Array.from(campaignsMap.values()).flatMap((c) => c._daily),
  };
}

/**
 * Optional: ingest daily stats into ads_daily_stats (use in a job or dedicated sync flow).
 */
export async function ingestDailyStatsFromSummary(workspaceId, summary) {
  if (!summary || !Array.isArray(summary._daily_raw)) return 0;
  const { customer_id } = summary;
  const source = 'google_ads';
  const dailyRows = summary._daily_raw;
  const count = await upsertCampaignDailyStats(workspaceId, {
    source,
    customerId: customer_id,
    dailyRows,
  });
  return count;
}

export default { fetchCampaignSummary, ingestDailyStatsFromSummary };
