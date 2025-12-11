import express from 'express';
import { verifyToken } from '../jwtService.js';
import { PLANS, getPlanConfig } from '../config/plans.js';
import { getUserByEmail, updateUser } from '../userStore.js';
import { createCheckoutSession, createBillingPortalSession, getOrCreateCustomer } from '../services/stripeService.js';
import {
  getPlanForUser,
  getCurrentPeriodForUser,
  getTokensUsed,
  computeUsageFlags,
  getUsageForUser,
} from '../services/billingService.js';
import { buildCanonicalCouncilAxisState } from '../services/councilFib.js';
import { getUserStripeBillingState } from '../services/stripeBillingService.js';

console.log('[BILLING_ROUTER_LOADED]');

const router = express.Router();

function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (!key) return;
    const value = decodeURIComponent(parts.join('='));
    list[key] = value;
  });
  return list;
}

function authFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const cookies = parseCookies(req.headers.cookie || '');
  const token = tokenFromHeader || cookies.cb_token || '';
  const source = tokenFromHeader ? 'bearer' : (cookies.cb_token ? 'cookie' : 'none');
  return { token, source };
}

async function ensureAuth(req, res) {
  const { token, source } = authFromRequest(req);
  const cookieHeader = req.headers.cookie || '';
  const cbCookie = (cookieHeader.match(/cb_token=([^;]+)/) || [])[1] || null;
  console.log('[BILLING_AUTH]', req.method, req.originalUrl, { source, auth: token ? `${token.slice(0, 10)}...` : null, cookie: cbCookie ? `${cbCookie.slice(0, 10)}...` : null });
  if (!token) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return null;
  }
  const decoded = verifyToken(token);
  if (!decoded?.email) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return null;
  }
  return decoded;
}

// GET /api/billing/summary (via /billing/summary mount)
router.get('/summary', async (req, res) => {
  const decoded = await ensureAuth(req, res);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  console.log('[BILLING_SUMMARY] entered', { path: req.originalUrl, userEmail: decoded.email });
  try {
    const user = await getUserByEmail(decoded.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { planCode, plan, limits } = await getPlanForUser(user.id || user.email);
    const period = await getCurrentPeriodForUser(user.id, planCode);
    const used = await getTokensUsed(user.id, period);
    const allowance = limits.tokensPerMonth || 0;
    const remaining = Math.max(allowance - used, 0);
    const usageState = await getUsageForUser(user.id, null);
    const councilTokens = usageState?.councilTokensThisPeriod ?? 0;
    const councilSharePct = usageState?.councilSharePct ?? 0;
    const flags = computeUsageFlags({ used, allowance });
    let stripeState = null;
    const stripeCustomerId = user.stripeCustomerId || null;
    if (stripeCustomerId) {
      try {
        stripeState = await getUserStripeBillingState({ stripeCustomerId });
      } catch (err) {
        console.error('[BILLING_STRIPE_SUMMARY_ERROR]', err?.message);
      }
    }
    const STRIPE_MODE = (process.env.STRIPE_MODE || process.env.STRIPE_ENV || 'live').toLowerCase();

    const workspaceMode = 'cbA';
    const council = buildCanonicalCouncilAxisState(workspaceMode);
    const fib = council.fib;

    const payload = {
      plan: {
        code: plan.code || plan.id || planCode,
        label: plan.label || plan.stripeProductName || plan.code || planCode,
        price: {
          currency: plan.currency || 'EUR',
          amount: typeof plan.monthlyPriceCents === 'number' ? plan.monthlyPriceCents / 100 : null,
          interval: 'month',
        },
        trialDays: plan.trialDays,
      },
      limits: {
        workspaces: limits?.workspaces ?? null,
        projects: limits?.projects ?? null,
        agents: limits?.agents ?? null,
        tokensPerMonth: limits?.tokensPerMonth ?? null,
      },
      usage: {
        tokensRemaining: remaining,
        tokensUsedThisPeriod: used,
        councilTokensThisPeriod: councilTokens,
        councilSharePct,
        usagePct: flags.usagePct,
        nearCap: flags.nearCap,
        hardCap: flags.hardCap,
      },
      stripe: {
        mode: STRIPE_MODE,
        customerId: stripeCustomerId,
        fromStripe: Boolean(stripeState?.planCode),
        subscriptionId: stripeState?.subscription?.id || user.stripeSubscriptionId || null,
        status: stripeState?.subscription?.status || user.subscriptionStatus || user.stripeStatus || null,
        priceId: stripeState?.subscription?.priceId || null,
        currentPeriodStart: stripeState?.periodStart || user.stripeCurrentPeriodStart || null,
        currentPeriodEnd: stripeState?.periodEnd || user.stripeCurrentPeriodEnd || null,
        cancelAtPeriodEnd: user.stripeCancelAtPeriodEnd ?? null,
      },
      trial: {
        active: (stripeState?.isTrial === true) || (user.subscriptionStatus || user.stripeStatus) === 'trialing',
        endsAt: user.stripeTrialEnd || user.trialEndsAt || null,
      },
      workspace_mode: workspaceMode, // canonical council mode placeholder; override when real data is available
      council: {
        ...council,
        fib,
      },
    };

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    console.log(
      '[BILLING_SUMMARY]',
      {
        userId: user.id || null,
        email: user.email,
        planCode: payload.plan.code,
        stripeStatus: payload.stripe.status,
        used,
        allowance,
        remaining,
      },
    );
    return res.json(payload);
  } catch (err) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    console.error('[BILLING_SUMMARY] error', err?.message);
    return res.status(500).json({ error: 'billing_summary_failed' });
  }
});

// Debug-only usage snapshot for the authenticated user
router.get('/debug/usage', async (req, res) => {
  const decoded = await ensureAuth(req, res);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await getUserByEmail(decoded.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { planCode, plan, limits } = await getPlanForUser(user.id || user.email);
    const period = await getCurrentPeriodForUser(user.id, planCode);
    const used = await getTokensUsed(user.id, period);
    const allowance = limits.tokensPerMonth;
    const remaining = Math.max(allowance - used, 0);

    console.log('[BILLING_DEBUG_USAGE] user=%s plan=%s used=%d remaining=%d', user.id, planCode, used, remaining);

    return res.json({
      userId: user.id,
      planCode,
      periodStart: period.start,
      periodEnd: period.end,
      tokensUsedThisPeriod: used,
      tokensRemaining: remaining,
      tokensPerMonth: allowance,
    });
  } catch (err) {
    console.error('[BILLING_DEBUG_USAGE_ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/billing/upgrade
router.post('/upgrade', async (req, res) => {
  const decoded = await ensureAuth(req, res);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  console.log('[BILLING_UPGRADE] entered', { path: req.originalUrl, userEmail: decoded.email, body: req.body });
  try {
    const user = await getUserByEmail(decoded.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const desired = req.body?.plan || req.body?.planId || 'starter';
    const planConfig = getPlanConfig(desired);
    const planKey = planConfig.code || planConfig.id;
    const priceId = planConfig.stripePriceId;

    if (!priceId) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      console.warn('[BILLING_UPGRADE]', { user: user.id || user.email, plan: planKey, checkoutUrl: null, status: 500, note: 'missing_price_env' });
      return res.status(500).json({ error: 'stripe_price_missing' });
    }

    const customer = await getOrCreateCustomer(user);
    if (customer?.id && customer.id !== user.stripeCustomerId) {
      await updateUser({ ...user, stripeCustomerId: customer.id });
    }
    const successUrl = `${process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai'}/chat?billing=success`;
    const cancelUrl = `${process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai'}/chat?billing=cancel`;
    const session = await createCheckoutSession({ user, planId: planKey, successUrl, cancelUrl });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    console.log('[BILLING_UPGRADE]', {
      user: user.id || user.email,
      plan: planKey,
      checkoutUrl: session.url,
      status: 200,
    });
    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    console.error('[BILLING_UPGRADE]', { error: err?.message });
    return res.status(500).json({ error: 'billing_upgrade_failed' });
  }
});

router.post('/checkout-session', async (req, res, next) => {
  const decoded = await ensureAuth(req, res);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { planId } = req.body || {};
    const plan = PLANS[planId];
    if (!plan || !plan.stripePriceId) {
      return res.status(400).json({ error: 'invalid_plan' });
    }
    const user = await getUserByEmail(decoded.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // ensure customer id persisted
    const customer = await getOrCreateCustomer(user);
    if (customer?.id && customer.id !== user.stripeCustomerId) {
      await updateUser({ ...user, stripeCustomerId: customer.id });
    }

    const successUrl = `${process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai'}/chat?billing=success`;
    const cancelUrl = `${process.env.COOLBITS_PUBLIC_BASE_URL || 'https://coolbits.ai'}/chat?billing=cancel`;

    const session = await createCheckoutSession({ user, planId, successUrl, cancelUrl });
    return res.json({ url: session.url });
  } catch (err) {
    if (err.message === 'stripe_not_configured') return res.status(503).json({ error: 'stripe_not_configured' });
    next(err);
  }
});

export default router;
