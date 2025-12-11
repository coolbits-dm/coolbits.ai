import { planUltimateCampaign } from '../../app/server/vertex/planner.js';
import { renderUltimatePlan } from '../../app/server/vertex/renderer.js';

async function main() {
  const sample = {
    visitorId: 'local-test',
    businessProfile: {
      name: 'Maison Dadoo',
      industry: 'florist',
      website: 'https://maisondadoo.ro',
      geo: 'RO',
      notes: 'Premium bouquets, repeat buyers.'
    },
    objectives: {
      primary: 'black_friday_sales',
      secondary: ['increase_traffic']
    },
    budget: {
      amount: 5000,
      currency: 'EUR',
      period: 'seasonal'
    },
    platforms: ['google-ads', 'meta-ads'],
    timeframe: {
      start: '2025-11-01',
      end: '2025-12-01'
    },
    reasoningBoost: true
  };

  const result = await planUltimateCampaign(sample, { mock: true });
  const rendered = renderUltimatePlan({ input: sample, plan: result.plan, engine: result.engine });
  console.log(JSON.stringify({ engine: result.engine, plan: rendered }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
