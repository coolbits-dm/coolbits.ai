// Pricing and cbT (CoolBits Tokens) configuration
// 1 cbT = 1,000 baseline tokens (input + output) on gemini-2.5-flash-lite.

export const BASE_MODEL_ID = 'gemini-2.5-flash-lite';
export const PRICING_VERSION = process.env.PRICING_VERSION || 'model-registry-2025-12-26';
export const FX_VERSION = process.env.FX_VERSION || 'cbt-1';

// Billing config: how much we charge per cbT (not provider cost).
export const BILLING = {
  currency: process.env.CBT_CURRENCY || 'EUR',
  // Example: 0.001 EUR / cbT => 1,000 cbT = 1 EUR.
  cbtPrice: parseFloat(process.env.CBT_PRICE_EUR || '0.001'),
};

// Relative cost factors per model (vs baseline flash-lite = 1x).
export const MODEL_PRICING = {
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    label: 'Fast chat',
    family: 'chat',
    factor: 1,
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    label: 'Enhanced chat',
    family: 'chat',
    factor: 3,
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    label: 'Reasoning',
    family: 'chat',
    factor: 10,
  },
  'gemini-3.0-pro': {
    id: 'gemini-3.0-pro',
    label: 'Advanced reasoning',
    family: 'chat',
    factor: 20,
  },
  // Media models – placeholder factors, to be tuned when activated.
  'imagen-4': {
    id: 'imagen-4',
    label: 'Image generation',
    family: 'image',
    factor: 50,
  },
};

export function getModelConfig(modelId) {
  return MODEL_PRICING[modelId] || MODEL_PRICING[BASE_MODEL_ID];
}

/**
 * Compute cbT usage for a real call.
 * @param {string} modelId
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @returns {{ cbtUsed: number, totalTokens: number, factor: number }}
 */
export function computeCbTUsage(modelId, promptTokens = 0, completionTokens = 0) {
  const model = getModelConfig(modelId);
  const factor = model.factor || 1;
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  if (!totalTokens || totalTokens <= 0) {
    return { cbtUsed: 0, totalTokens: 0, factor };
  }

  const cbtUsed = Math.max(1, Math.ceil((totalTokens / 1000) * factor));
  return { cbtUsed, totalTokens, factor };
}

/**
 * Monetary cost estimate for a given cbT amount.
 * Returns a numeric value rounded to 6 decimals.
 */
export function computeMonetaryCost(cbt) {
  if (!cbt || cbt <= 0) return 0;
  const v = cbt * BILLING.cbtPrice;
  return Number(v.toFixed(6));
}

/**
 * Public pricing sheet for the frontend.
 */
export function getPublicPricingSheet() {
  const models = {};
  for (const [id, cfg] of Object.entries(MODEL_PRICING)) {
    models[id] = {
      id: cfg.id,
      label: cfg.label,
      family: cfg.family,
      factor: cfg.factor,
    };
  }

  return {
    currency: BILLING.currency,
    cbtPrice: BILLING.cbtPrice,
    baseModelId: BASE_MODEL_ID,
    models,
  };
}

export default {
  BASE_MODEL_ID,
  PRICING_VERSION,
  FX_VERSION,
  BILLING,
  MODEL_PRICING,
  getModelConfig,
  computeCbTUsage,
  computeMonetaryCost,
  getPublicPricingSheet,
};
