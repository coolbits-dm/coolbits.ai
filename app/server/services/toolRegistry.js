// Central tool registry mapping logical tool names to implementation functions.

import * as briefsRepo from '../repositories/briefsRepo.js';
import * as ppcRepo from '../repositories/ppcRepo.js';
import * as analyticsRepo from '../repositories/analyticsRepo.js';
import * as googleAdsConnector from './googleAdsConnector.js';
import { fetchCampaignSummary } from './googleAdsService.js';
import { IS_TOOL_MOCK_MODE } from '../config/env.js';

const notImplemented = async (ctx, payload, name) => {
  console.warn('[TOOL_NOT_IMPLEMENTED]', { tool: name, workspaceId: ctx?.workspaceId });
  throw new Error(`tool_not_implemented:${name}`);
};

// Real implementations (DB + connectors)
const REAL_IMPL = {
  // CEO / briefs
  'briefs.read': async (ctx, params) => briefsRepo.findByWorkspace(ctx.workspaceId, params),
  'briefs.write': async (ctx, payload) => briefsRepo.upsert(ctx.workspaceId, payload),

  // Tech plans / policies (TODO)
  'tech_plan.read': async (ctx, params) => notImplemented(ctx, params, 'tech_plan.read'),
  'tech_plan.write': async (ctx, payload) => notImplemented(ctx, payload, 'tech_plan.write'),
  'agent_policies.write': async (ctx, payload) => notImplemented(ctx, payload, 'agent_policies.write'),

  // Ads / GA4 / BQ / Stripe – READ
  'google_ads.read': async (ctx, query) => fetchCampaignSummary(ctx.workspaceId, query),
  'ga4.read': async (ctx, query) => notImplemented(ctx, query, 'ga4.read'),
  'bq.read': async (ctx, query) => notImplemented(ctx, query, 'bq.read'),
  'stripe.read': async (ctx, query) => notImplemented(ctx, query, 'stripe.read'),

  // PPC plan + change proposals (DB only)
  'ppc_plan.write': async (ctx, plan) => ppcRepo.savePlan(ctx.workspaceId, plan),
  'ppc_changes.write': async (ctx, proposal) => ppcRepo.saveChangeProposal(ctx.workspaceId, proposal),

  // Google Ads WRITE – proposal vs apply
  'google_ads.write.proposal': async (ctx, proposal) => ppcRepo.saveChangeProposal(ctx.workspaceId, proposal),
  'google_ads.write.apply': async (ctx, applyPayload) => googleAdsConnector.applyMutations(ctx.workspaceId, applyPayload),

  // Analytics outputs
  'analytics.snapshots.write': async (ctx, snapshot) => analyticsRepo.saveSnapshot(ctx.workspaceId, snapshot),
  'insights.write': async (ctx, insight) => analyticsRepo.saveInsight(ctx.workspaceId, insight),
  'analytics.summary.read': async (ctx) => analyticsRepo.getLatestSummary(ctx.workspaceId),

  // Creative (TODO)
  'copy.generate': async (ctx, payload) => notImplemented(ctx, payload, 'copy.generate'),
  'image.generate': async (ctx, payload) => notImplemented(ctx, payload, 'image.generate'),
  'video.generate': async (ctx, payload) => notImplemented(ctx, payload, 'video.generate'),
  'asset_library.write': async (ctx, payload) => notImplemented(ctx, payload, 'asset_library.write'),
  'brand_rules.read': async (ctx, payload) => notImplemented(ctx, payload, 'brand_rules.read'),
  'creative_packages.write': async (ctx, payload) => notImplemented(ctx, payload, 'creative_packages.write'),

  // Infra / DevOps (TODO)
  'infra.status.read': async (ctx, payload) => notImplemented(ctx, payload, 'infra.status.read'),
  'infra.change.propose': async (ctx, proposal) => notImplemented(ctx, proposal, 'infra.change.propose'),
  'cost.read': async (ctx, payload) => notImplemented(ctx, payload, 'cost.read'),
  'llm_usage.read': async (ctx, payload) => notImplemented(ctx, payload, 'llm_usage.read'),
  'incidents.write': async (ctx, incident) => notImplemented(ctx, incident, 'incidents.write'),
  'devops.status.read': async (ctx, payload) => notImplemented(ctx, payload, 'devops.status.read'),
};

// Mock implementations for safe, side-effect-free testing
const MOCK_IMPL = {
  'briefs.read': REAL_IMPL['briefs.read'],
  'briefs.write': REAL_IMPL['briefs.write'],
  'analytics.snapshots.write': REAL_IMPL['analytics.snapshots.write'],
  'insights.write': REAL_IMPL['insights.write'],
  'analytics.summary.read': REAL_IMPL['analytics.summary.read'],
  'ppc_plan.write': REAL_IMPL['ppc_plan.write'],
  'ppc_changes.write': REAL_IMPL['ppc_changes.write'],

  'google_ads.read': async (ctx, params) => ({
    workspace_id: ctx.workspaceId,
    customer_id: 'MOCK-0000000000',
    period_from: '2025-11-01',
    period_to: '2025-11-30',
    campaigns: [
      {
        id: '111',
        name: 'Mock Brand Search',
        status: 'ENABLED',
        channel: 'SEARCH',
        cost_micros: 123000000,
        conv: 30,
        conv_value: 4500,
        clicks: 800,
        impressions: 20000,
      },
    ],
    params,
  }),

  'copy.generate': async (ctx, payload) => ({
    headlines: ['Fast flower delivery in Bucharest', 'Same-day bouquets, 7 days a week'],
    descriptions: ['Order online in minutes.', 'Premium bouquets delivered quickly.'],
    payload,
  }),
  'infra.status.read': async (ctx) => ({
    workspace_id: ctx.workspaceId,
    status: 'healthy',
    warnings: [],
    llm_cost_month_to_date: 12.34,
  }),
  'devops.status.read': async (ctx) => ({
    workspace_id: ctx.workspaceId,
    status: 'healthy',
    incidents_open: 0,
  }),
};

const ACTIVE_IMPL = IS_TOOL_MOCK_MODE ? { ...REAL_IMPL, ...MOCK_IMPL } : REAL_IMPL;

export const TOOL_IMPL = ACTIVE_IMPL;

export default { TOOL_IMPL };
