import crypto from 'node:crypto';
import { callVertexModel } from './vertex-client.js';

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value) && value.length) {
    return value;
  }
  return fallback;
}

function normalizePlatforms(platforms = []) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return ['google-ads'];
  }
  return platforms;
}

function buildBudgetMap(total, currency, platforms) {
  const base = total > 0 ? total : 0;
  const perPlatform = base / platforms.length;
  return platforms.map((name, index) => ({
    platform: name,
    allocation: Number((perPlatform * (1 + index * 0.05)).toFixed(2)),
    currency,
  }));
}

function buildCampaignStructure(platformName, input) {
  const seed = crypto.createHash('md5').update(`${platformName}-${input.objectives.primary}`).digest('hex');
  const adGroups = ['Awareness', 'Consideration', 'Conversion'].map((stage, idx) => ({
    name: `${stage} ${platformName}`,
    ads: [
      {
        headline: `${input.businessProfile.name} ${stage}`,
        copy: `Campaign for ${input.objectives.primary.replace(/_/g, ' ')} focusing on ${stage.toLowerCase()} stage`,
        cta: idx === 2 ? 'Shop now' : 'Learn more',
      },
    ],
  }));
  return {
    platform: platformName,
    campaignName: `${input.businessProfile.name} ${platformName} ${seed.slice(0, 5)}`,
    objective: input.objectives.primary,
    adGroups,
  };
}

function buildMockPlan(input) {
  const platforms = normalizePlatforms(input.platforms);
  const allocations = buildBudgetMap(input.budget.amount, input.budget.currency, platforms);
  return {
    strategy: {
      headline: `Full-funnel plan for ${input.businessProfile.name}`,
      positioning: `${input.businessProfile.industry} brand focused on ${input.objectives.primary.replace(/_/g, ' ')}`,
      timeframe: input.timeframe,
      notes: input.businessProfile.notes || 'Leverage mix of acquisition and retention plays.',
    },
    budget: {
      total: input.budget.amount,
      currency: input.budget.currency,
      allocations,
    },
    kpis: {
      cpc: {
        google: { min: 0.5, max: 1.4 },
        meta: { min: 0.3, max: 1.1 },
      },
      cpa: { range: [8, 25] },
      roas: { target: 3.5 },
    },
    platforms: platforms.map((platform) => ({
      name: platform,
      summary: `Scale ${platform} with ${input.objectives.primary.replace(/_/g, ' ')} messaging`,
      budget: allocations.find((item) => item.platform === platform),
      campaigns: [buildCampaignStructure(platform, input)],
    })),
    milestones: [
      {
        label: 'Week 1',
        focus: 'Launch evergreen + seasonal teaser',
      },
      {
        label: 'Week 2-4',
        focus: 'Scale best performing ad groups and retarget engaged traffic',
      },
      {
        label: 'Week 5+',
        focus: 'Optimize creative, refresh copy, prepare lookalike audiences',
      },
    ],
  };
}

export async function planUltimateCampaign(input, options = {}) {
  const { mock = true, model, logger, config = {} } = options;
  if (!mock) {
    try {
      const vertexResult = await callVertexModel(input, { ...config, model: model || config.model });
      if (vertexResult && vertexResult.plan) {
        return {
          engine: { source: 'vertex', model: model || config.model || 'vertex-model' },
          plan: vertexResult.plan,
        };
      }
    } catch (error) {
      logger?.warn?.('Vertex call failed, falling back to mock plan.', error);
    }
  }
  const plan = buildMockPlan(input);
  const engine = {
    source: mock ? 'mock' : 'vertex-fallback',
    model: model || (mock ? 'mock-ultimate-v2' : 'vertex-todo'),
  };
  return { engine, plan };
}
