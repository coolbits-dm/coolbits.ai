import { getPlanByPriceId } from './plans.js';

// Resolve a Stripe price ID to a canonical plan code.
export function resolvePlanFromPrice(priceId) {
  if (!priceId) return null;
  const plan = getPlanByPriceId(priceId);
  if (!plan) return null;
  return plan.code || plan.planCode || plan.id || null;
}

export default { resolvePlanFromPrice };
