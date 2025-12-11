import Stripe from 'stripe';
import { PLANS, getPlanConfig, getPlanByPriceId as mapPlanByPriceId } from '../config/plans.js';

const secret = process.env.STRIPE_SECRET_KEY;
const publishable = process.env.STRIPE_PUBLISHABLE_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (secret) {
  console.log('[STRIPE] configured', { mode: secret.startsWith('sk_live') ? 'live' : 'test' });
} else {
  console.warn('[STRIPE] STRIPE_SECRET_KEY not set; Stripe features disabled');
}

export const stripe = secret ? new Stripe(secret) : null;
export { webhookSecret, publishable };

export function getPlanByPriceId(priceId) {
  return mapPlanByPriceId(priceId);
}

export function mapStripePriceToPlanCode(priceId) {
  const plan = mapPlanByPriceId(priceId);
  if (!plan) {
    console.warn('[STRIPE_PLAN_MAP_MISS]', { priceId });
    return null;
  }
  return plan.code || plan.id || null;
}

export async function getOrCreateCustomer(user) {
  if (!stripe) throw new Error('stripe_not_configured');
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!existing?.deleted) return existing;
    } catch (err) {
      console.warn('[STRIPE] customer retrieve failed, creating new', err.message);
    }
  }
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { coolbitsUserId: user.id },
  });
  return customer;
}

export async function createCheckoutSession({ user, planId, successUrl, cancelUrl }) {
  if (!stripe) throw new Error('stripe_not_configured');
  const plan = getPlanConfig(planId);
  const priceId = plan?.stripePriceId;
  if (!plan || !priceId) throw new Error('invalid_plan');
  const customer = await getOrCreateCustomer(user);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: plan.trialDays ? { trial_period_days: plan.trialDays } : undefined,
    metadata: {
      coolbitsUserId: user.id,
      planId: plan.code || plan.id,
    },
  });
  return session;
}

export async function createBillingPortalSession({ user, returnUrl }) {
  if (!stripe) throw new Error('stripe_not_configured');
  const customer = await getOrCreateCustomer(user);
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: returnUrl,
  });
  return session;
}
