import { handleUltimateCampaignPlan } from '../../app/server/vertex/vertex-controller.js';

async function main() {
  const mockReq = {
    body: {
      visitorId: 'tool-vertex',
      businessProfile: {
        name: 'Test Bakery',
        industry: 'food_services',
        website: 'https://bakery.example',
        geo: 'RO',
        notes: 'Breads and pastries',
      },
      objectives: { primary: 'lead_generation' },
      budget: { amount: 2000, currency: 'EUR', period: 'monthly' },
      platforms: ['google-ads', 'meta-ads'],
      timeframe: { start: '2025-01-01', end: '2025-02-01' },
      reasoningBoost: true,
    },
    headers: {},
    query: {},
    ip: '127.0.0.1',
  };

  const result = await handleUltimateCampaignPlan(mockReq);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
