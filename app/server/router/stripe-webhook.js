import Stripe from 'stripe';
import { getUserById, getUserByStripeCustomerId, updateUser } from '../userStore.js';

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

export async function stripeWebhookHandler(req, res) {
  if (!stripe || !webhookSecret) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }

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
        const userId = session.metadata && session.metadata.coolbitsUserId;
        if (!userId) break;

        const user = await getUserById(userId);
        if (!user) break;

        let subscriptionId = null;
        if (session.subscription) {
          subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;
        }

        const updated = {
          ...user,
          planId: 'pro',
          planLabel: 'Pro',
          stripeCustomerId: session.customer || user.stripeCustomerId || null,
          stripeSubscriptionId: subscriptionId || user.stripeSubscriptionId || null,
          stripeStatus: 'active',
        };

        if (typeof updated.tokensRemaining !== 'number' || updated.tokensRemaining < 50000) {
          updated.tokensRemaining = 50000;
        }

        await updateUser(updated);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = await getUserByStripeCustomerId(customerId);
        if (!user) break;

        const updated = {
          ...user,
          stripeSubscriptionId: subscription.id,
          stripeStatus: subscription.status || null,
        };

        if (subscription.status === 'active') {
          updated.planId = 'pro';
          updated.planLabel = 'Pro';
          if (typeof updated.tokensRemaining !== 'number' || updated.tokensRemaining < 50000) {
            updated.tokensRemaining = 50000;
          }
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          updated.planId = 'starter';
          updated.planLabel = 'Starter';
        }

        await updateUser(updated);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = await getUserByStripeCustomerId(customerId);
        if (!user) break;

        const updated = {
          ...user,
          stripeStatus: subscription.status || 'canceled',
          planId: 'starter',
          planLabel: 'Starter',
        };
        await updateUser(updated);
        break;
      }

      default:
        console.log('[STRIPE_WEBHOOK] unhandled event', event.type);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[STRIPE_WEBHOOK] handler error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
