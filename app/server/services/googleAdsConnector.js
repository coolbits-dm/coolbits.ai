// Stub Google Ads connector for sandbox testing.
// Replace with real API calls when ready.

export async function fetchStats(workspaceId, query = {}) {
  console.log('[GOOGLE_ADS_FETCH_STATS]', { workspaceId, query });
  return {
    workspaceId,
    query,
    campaigns: [
      { name: 'Search | Brand', cost: 2450, conv: 72, roas: 8.1 },
      { name: 'Search | Generic', cost: 7800, conv: 28, roas: 1.9 },
    ],
    period: query.dateRange || 'last_30_days',
  };
}

export async function applyMutations(workspaceId, payload = {}) {
  console.log('[GOOGLE_ADS_APPLY_MUTATIONS_STUB]', { workspaceId, payload });
  throw new Error('google_ads.write.apply not implemented');
}

export default { fetchStats, applyMutations };
