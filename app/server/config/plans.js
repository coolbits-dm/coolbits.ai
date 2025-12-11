const ALL_WORKSPACES = ['business', 'agency', 'developer'];

/**
 * Canonical CoolBits plan matrix
 * codes: starter | agency | dev | enterprise
 */
const CANONICAL_PLANS = {
  starter: {
    code: 'starter',
    stripeProductName: 'CoolBits Starter',
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
    monthlyPriceCents: 14900,
    currency: 'ron',
    trialDays: 15,
    limits: {
      workspaces: 1,
      projects: 3,
      agents: 5,
    },
    tokensPerMonth: 100000,
    defaultWorkspaces: ['business'],
    isPaid: false, // keep non-paid to avoid blocking flows until Stripe is fully enforced
  },
  agency: {
    code: 'agency',
    stripeProductName: 'CoolBits Agency',
    stripePriceEnv: 'STRIPE_PRICE_AGENCY',
    monthlyPriceCents: 39900,
    currency: 'ron',
    trialDays: 15,
    limits: {
      workspaces: 2,
      projects: 5,
      agents: 15,
    },
    tokensPerMonth: 400000,
    defaultWorkspaces: ['business', 'agency'],
    isPaid: true,
  },
  dev: {
    code: 'dev',
    stripeProductName: 'CoolBits Dev',
    stripePriceEnv: 'STRIPE_PRICE_DEV',
    monthlyPriceCents: 24900,
    currency: 'ron',
    trialDays: 15,
    limits: {
      workspaces: 2,
      projects: 5,
      agents: 15,
    },
    tokensPerMonth: 400000,
    defaultWorkspaces: ['business', 'developer'],
    isPaid: true,
  },
  enterprise: {
    code: 'enterprise',
    stripeProductName: 'CoolBits Enterprise',
    stripePriceEnv: 'STRIPE_PRICE_ENTERPRISE',
    monthlyPriceCents: 99900,
    currency: 'ron',
    trialDays: 15,
    limits: {
      workspaces: 'all',
      projects: 10,
      agents: 'all',
    },
    tokensPerMonth: 2000000,
    defaultWorkspaces: ALL_WORKSPACES,
    isPaid: true,
  },
};

function decorate(plan, idOverride) {
  if (!plan) return null;
  const id = idOverride || plan.code;
  const limits = plan.limits || {};
  const maxProjects = typeof limits.projects === 'number' ? limits.projects : 999999;
  const maxWorkspaces = limits.workspaces === 'all' ? ALL_WORKSPACES.length : limits.workspaces || 1;
  return {
    ...plan,
    id,
    label: plan.stripeProductName,
    // Compatibility fields used elsewhere in the app
    tokensIncluded: plan.tokensPerMonth,
    tokensPerTopup: plan.tokensPerMonth,
    includedCbtPerMonth: plan.tokensPerMonth,
    overagePricePerCbt: plan.overagePricePerCbt || null,
    chargePerMessage: plan.chargePerMessage || 25,
    maxProjectsPerWorkspace: maxProjects,
    maxWorkspaces,
    defaultWorkspaces: plan.defaultWorkspaces || ALL_WORKSPACES,
    maxCouncilMembers: plan.maxCouncilMembers || 5,
    connectorsEnabled: plan.connectorsEnabled || [],
    reasoningEnabled: Boolean(plan.reasoningEnabled ?? true),
    stripePriceId: process.env[plan.stripePriceEnv] || null,
  };
}

// Build PLANS with canonical keys plus legacy aliases for backward compatibility
const PLANS = {
  starter: decorate(CANONICAL_PLANS.starter),
  agency: decorate(CANONICAL_PLANS.agency),
  dev: decorate(CANONICAL_PLANS.dev),
  enterprise: decorate(CANONICAL_PLANS.enterprise),
  // Legacy aliases
  STARTER_FREE: decorate(CANONICAL_PLANS.starter, 'STARTER_FREE'),
  STARTER: decorate(CANONICAL_PLANS.starter, 'STARTER'),
  PRO: decorate(CANONICAL_PLANS.agency, 'PRO'),
  AGENCY: decorate(CANONICAL_PLANS.agency, 'AGENCY'),
  DEV: decorate(CANONICAL_PLANS.dev, 'DEV'),
  ENTERPRISE: decorate(CANONICAL_PLANS.enterprise, 'ENTERPRISE'),
  GUEST: {
    id: 'GUEST',
    code: 'guest',
    label: 'Guest',
    isPaid: false,
    tokensIncluded: 0,
    tokensPerTopup: 0,
    chargePerMessage: 0,
    maxProjectsPerWorkspace: 0,
    maxWorkspaces: 0,
    defaultWorkspaces: [],
    includedCbtPerMonth: 0,
    maxCouncilMembers: 0,
    connectorsEnabled: [],
    reasoningEnabled: false,
  },
};

function normalizeKey(planId) {
  if (!planId) return null;
  const key = String(planId).trim();
  const lower = key.toLowerCase();
  if (CANONICAL_PLANS[lower]) return lower;
  switch (key) {
    case 'STARTER_FREE':
    case 'STARTER':
      return 'starter';
    case 'PRO':
    case 'AGENCY':
      return 'agency';
    case 'DEV':
      return 'dev';
    case 'ENTERPRISE':
      return 'enterprise';
    default:
      return lower;
  }
}

export function getPlanConfig(planId) {
  const normalized = normalizeKey(planId) || 'starter';
  const plan = PLANS[normalized] || PLANS.starter;
  if (!plan) {
    console.debug('[PLAN] unknown planId, falling back to starter', { planId });
  }
  return plan || PLANS.starter;
}

export function getCapabilities(planId) {
  const plan = getPlanConfig(planId);
  const workspacesAllowed = Array.isArray(plan.defaultWorkspaces) && plan.defaultWorkspaces.length
    ? plan.defaultWorkspaces
    : ALL_WORKSPACES;
  return {
    planId: plan.id,
    workspacesAllowed,
    maxWorkspaces: plan.maxWorkspaces,
    maxProjectsPerWorkspace: plan.maxProjectsPerWorkspace,
    includedCbtPerMonth: plan.includedCbtPerMonth,
    maxCouncilMembers: plan.maxCouncilMembers,
    connectorsEnabled: plan.connectorsEnabled || [],
    reasoningEnabled: Boolean(plan.reasoningEnabled),
  };
}

export function getMaxProjectsForUser(user) {
  if (!user) return 0;
  const plan = getPlanConfig(user.planId || user.plan_id);
  const max = plan.maxProjectsPerWorkspace;
  if (typeof max === 'number' && max >= 0) return max;
  return getPlanConfig('starter').maxProjectsPerWorkspace || 1;
}

export function getPlanByPriceId(priceId) {
  if (!priceId) return null;
  const entries = Object.values(CANONICAL_PLANS);
  for (const plan of entries) {
    const envPrice = process.env[plan.stripePriceEnv];
    if (envPrice && envPrice === priceId) {
      return getPlanConfig(plan.code);
    }
  }
  return null;
}

export { PLANS };

export default { PLANS, getPlanConfig, getCapabilities, getMaxProjectsForUser, getPlanByPriceId };
