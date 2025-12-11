import { resolvePlanFromPrice } from '../config/stripePlans.js';
import { stripe } from './stripeService.js';

const STRIPE_MODE = (process.env.STRIPE_MODE || process.env.STRIPE_ENV || 'live').toLowerCase();

export async function getUserStripeBillingState({ stripeCustomerId }) {
  if (!stripe || !stripeCustomerId) {
    return {
      subscription: null,
      planCode: null,
      periodStart: null,
      periodEnd: null,
      isTrial: false,
    };
  }

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    expand: ['data.items.data.price'],
    limit: 1,
  });

  const sub = subs.data[0];
  if (!sub) {
    return {
      subscription: null,
      planCode: null,
      periodStart: null,
      periodEnd: null,
      isTrial: false,
    };
  }

  const item = sub.items?.data?.[0];
  const price = item?.price;
  const priceId = price?.id || null;
  const planCode = priceId ? resolvePlanFromPrice(priceId) : null;

  const periodStart = sub.current_period_start
    ? new Date(sub.current_period_start * 1000)
    : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  const isTrial = Boolean(sub.trial_start && sub.trial_end && sub.status === 'trialing');

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      priceId,
      mode: STRIPE_MODE,
    },
    planCode,
    periodStart,
    periodEnd,
    isTrial,
  };
}

export default { getUserStripeBillingState };
