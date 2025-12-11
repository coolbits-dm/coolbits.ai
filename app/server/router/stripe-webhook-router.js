import express from 'express';
import { webhookSecret, stripe, mapStripePriceToPlanCode } from '../services/stripeService.js';
import { getPlanConfig } from '../config/plans.js';
import { getUserByStripeCustomerId } from '../userStore.js';
import { query } from '../db.js';

const router = express.Router();

function badConfig() {
  return !stripe || !webhookSecret;
}

async function resolveUserIdFromStripeCustomer(customerId, sourceObj) {
  const meta = (sourceObj && sourceObj.metadata) || {};
  if (meta.coolbitsUserId) return meta.coolbitsUserId;
  if (meta.userId) return meta.userId;
  const user = await getUserByStripeCustomerId(customerId);
  if (user?.id) return user.id;
  console.warn('[STRIPE_USER_RESOLVE_MISS]', { customer: customerId });
  return null;
}

async function upsertBillingState({
  userId,
  planCode,
  stripeCustomerId,
  stripeSubscriptionId,
  periodStart,
  periodEnd,
  status,
}) {
  if (!userId) return;
  const text = `
    INSERT INTO user_billing_state (
      user_id,
      plan_code,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_start,
      current_period_end,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6, now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan_code = EXCLUDED.plan_code,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now();
  `;
  const values = [
    userId,
    planCode,
    stripeCustomerId,
    stripeSubscriptionId,
    periodStart,
    periodEnd,
  ];
  await query(text, values);
  console.log('[STRIPE_BILLING_STATE_UPSERT]', {
    userId,
    planCode,
    stripeCustomerId,
    stripeSubscriptionId,
    start: periodStart?.toISOString?.() || periodStart || null,
    end: periodEnd?.toISOString?.() || periodEnd || null,
    status,
  });
}

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (badConfig()) return res.status(503).json({ error: 'stripe_not_configured' });
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[STRIPE_WEBHOOK] signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const userId = await resolveUserIdFromStripeCustomer(customerId, session);
        if (userId && customerId) {
          // Ensure we store the customer id for later subscription events.
          await upsertBillingState({
            userId,
            planCode: null,
            stripeCustomerId: customerId,
            stripeSubscriptionId: null,
            periodStart: null,
            periodEnd: null,
            status: session.status || session.payment_status || null,
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;
        const stripeSubscriptionId = subscription.id;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const planCode = mapStripePriceToPlanCode(priceId);
        const status = subscription.status;
        if (!planCode) break;
        const userId = await resolveUserIdFromStripeCustomer(stripeCustomerId, subscription);
        if (!userId) break;
        if (status !== 'active' && status !== 'trialing') {
          console.log('[STRIPE_SUB_SKIPPED_STATUS]', { userId, status, stripeSubscriptionId });
          break;
        }
        const periodStart = subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null;
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null;
        await upsertBillingState({
          userId,
          planCode,
          stripeCustomerId,
          stripeSubscriptionId,
          periodStart,
          periodEnd,
          status,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;
        const userId = await resolveUserIdFromStripeCustomer(stripeCustomerId, subscription);
        const starter = getPlanConfig('starter');
        if (userId) {
          await upsertBillingState({
            userId,
            planCode: starter.code || 'starter',
            stripeCustomerId,
            stripeSubscriptionId: null,
            periodStart: null,
            periodEnd: null,
            status: subscription.status || 'canceled',
          });
        }
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE_WEBHOOK] handler error', err);
    res.status(400).json({ error: 'processing_error' });
  }
});

export default router;
