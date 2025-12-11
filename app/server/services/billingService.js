import { query } from '../db.js';
import { getPlanConfig } from '../config/plans.js';
import { getUserByEmail, getUserById } from '../userStore.js';
import { getUserStripeBillingState } from './stripeBillingService.js';
import { getCouncilTotalsForUser } from '../repos/councilRunsRepo.js';

const DEFAULT_ANCHOR_DAY = 1;

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-fA-F-]{36}$/.test(value.trim());
}

async function resolveUser(userRef) {
  if (!userRef) return null;
  if (typeof userRef === 'object' && userRef.id) return userRef;
  if (isUuid(userRef)) return getUserById(userRef);
  if (typeof userRef === 'string' && userRef.includes('@')) return getUserByEmail(userRef);
  return null;
}

export function isPaidPlan(planCode) {
  const plan = getPlanConfig(planCode || 'starter');
  return Boolean(plan?.isPaid);
}

async function getUserBillingState(userId) {
  try {
    const { rows } = await query(
      `SELECT user_id, plan_code, stripe_customer_id, stripe_subscription_id,
              current_period_start, current_period_end, billing_anchor, tokens_used_this_period,
              updated_at
         FROM user_billing_state
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  } catch (err) {
    console.warn('[BILLING_STATE_FETCH_ERROR]', err?.message);
    return null;
  }
}

function computeLocalPeriod(now = new Date(), anchorDay = DEFAULT_ANCHOR_DAY) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), anchorDay, 0, 0, 0, 0));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, anchorDay, 0, 0, 0, 0));
  return { start, end };
}

export function computeUsageFlags({ used, allowance }) {
  if (!allowance || allowance <= 0) {
    return {
      usagePct: null,
      nearCap: false,
      hardCap: false,
    };
  }

  const usagePct = (used / allowance) * 100;
  return {
    usagePct,
    nearCap: usagePct >= 80 && usagePct < 100,
    hardCap: usagePct >= 100,
  };
}

export async function getPlanForUser(userRef) {
  const user = await resolveUser(userRef);
  const userId = user?.id || userRef;
  const billingRow = userId ? await getUserBillingState(userId) : null;

  const stripeCustomerId = billingRow?.stripe_customer_id || billingRow?.stripeCustomerId || null;

  let planCodeStripe = null;
  if (stripeCustomerId) {
    try {
      const stripeState = await getUserStripeBillingState({ stripeCustomerId });
      planCodeStripe = stripeState.planCode || null;
    } catch (err) {
      console.error('[BILLING_STRIPE_PLAN_ERROR]', err?.message);
    }
  }

  let planCode = planCodeStripe || billingRow?.plan_code || user?.planId || 'starter';
  const plan = getPlanConfig(planCode);
  planCode = plan?.code || plan?.id || planCode || 'starter';
  const limits = {
    ...(plan?.limits || {}),
    tokensPerMonth: plan?.tokensPerMonth ?? plan?.tokensIncluded ?? 0,
  };

  return { planCode, plan, limits, billingRow, userId };
}

async function upsertBillingStatePeriod({ userId, planCode, start, end, resetUsage }) {
  if (!userId) return null;
  try {
    const text = `
      INSERT INTO user_billing_state (
        user_id, plan_code, current_period_start, current_period_end, billing_anchor, tokens_used_this_period, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (user_id) DO UPDATE SET
        plan_code = EXCLUDED.plan_code,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        billing_anchor = EXCLUDED.billing_anchor,
        tokens_used_this_period = CASE
          WHEN user_billing_state.current_period_start = EXCLUDED.current_period_start THEN user_billing_state.tokens_used_this_period
          ELSE EXCLUDED.tokens_used_this_period
        END,
        updated_at = now()
      RETURNING *;
    `;
    const values = [
      userId,
      planCode,
      start,
      end,
      DEFAULT_ANCHOR_DAY,
      resetUsage ? 0 : 0,
    ];
    const { rows } = await query(text, values);
    return rows[0] || null;
  } catch (err) {
    console.warn('[BILLING_PERIOD_UPSERT_ERROR]', err?.message);
    return null;
  }
}

export async function getCurrentPeriodForUser(userRef, planCodeInput) {
  const user = await resolveUser(userRef);
  const userId = user?.id || userRef;
  const billingRow = userId ? await getUserBillingState(userId) : null;
  const planCode = planCodeInput || billingRow?.plan_code || user?.planId || 'starter';
  const stripeCustomerId = billingRow?.stripe_customer_id || billingRow?.stripeCustomerId || null;
  const now = new Date();

  if (stripeCustomerId) {
    try {
      const stripeState = await getUserStripeBillingState({ stripeCustomerId });
      if (stripeState?.periodStart && stripeState?.periodEnd) {
        console.log('[BILLING_PERIOD_RESOLVE]', {
          userId,
          planCode,
          source: 'stripe',
          start: stripeState.periodStart.toISOString(),
          end: stripeState.periodEnd.toISOString(),
        });
        return { start: stripeState.periodStart, end: stripeState.periodEnd };
      }
    } catch (err) {
      console.error('[BILLING_STRIPE_PERIOD_ERROR]', err?.message);
    }
  }

  if (
    isPaidPlan(planCode) &&
    billingRow &&
    billingRow.stripe_subscription_id &&
    billingRow.current_period_start &&
    billingRow.current_period_end
  ) {
    const start = billingRow.current_period_start instanceof Date
      ? billingRow.current_period_start
      : new Date(billingRow.current_period_start);
    const end = billingRow.current_period_end instanceof Date
      ? billingRow.current_period_end
      : new Date(billingRow.current_period_end);
    console.log('[BILLING_PERIOD_RESOLVE]', {
      userId,
      planCode,
      source: 'stripe',
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return { start, end };
  }

  const { start, end } = computeLocalPeriod(now, DEFAULT_ANCHOR_DAY);
  await upsertBillingStatePeriod({
    userId,
    planCode,
    start,
    end,
    resetUsage: false,
  });
  console.log('[BILLING_PERIOD_RESOLVE]', {
    userId,
    planCode,
    source: 'local',
    start: start.toISOString(),
    end: end.toISOString(),
  });
  return { start, end };
}

async function sumUsageForPeriod(userId, period) {
  if (!userId || !period?.start || !period?.end) return null;
  try {
    const { rows } = await query(
      `SELECT COALESCE(SUM(total_tokens), 0) AS used
         FROM token_usage
        WHERE user_id = $1
          AND period_start >= $2
          AND (period_end IS NULL OR period_end <= $3)`,
      [userId, period.start, period.end],
    );
    const used = Number(rows[0]?.used || 0);
    return Number.isFinite(used) ? used : 0;
  } catch (err) {
    console.warn('[BILLING_USAGE_SUM_ERROR]', err?.message);
    return null;
  }
}

export async function getTokensUsed(userRef, period) {
  const user = await resolveUser(userRef);
  if (!user) return 0;
  let billingRow = null;
  try {
    billingRow = await getUserBillingState(user.id);
  } catch (err) {
    console.warn('[BILLING_STATE_FETCH_ERROR]', err?.message);
  }

  const targetPeriod = period || (billingRow?.current_period_start ? {
    start: new Date(billingRow.current_period_start),
    end: billingRow.current_period_end ? new Date(billingRow.current_period_end) : null,
  } : null);
  const resolvedPeriod = targetPeriod || (await getCurrentPeriodForUser(user.id, billingRow?.plan_code));
  const usageSum = await sumUsageForPeriod(user.id, resolvedPeriod);
  if (usageSum != null) return usageSum;

  if (!billingRow?.current_period_start) return 0;
  const rowStart = new Date(billingRow.current_period_start).getTime();
  const targetStart = (resolvedPeriod?.start instanceof Date ? resolvedPeriod.start : new Date(resolvedPeriod?.start || 0)).getTime();
  if (rowStart !== targetStart) return 0;
  return Number(billingRow.tokens_used_this_period || 0);
}

// Aggregate plan, period, and usage for a user/workspace.
export async function getUsageForUser(userRef, workspaceId) {
  const user = await resolveUser(userRef);
  if (!user) {
    throw new Error('User not found for usage lookup');
  }

  const { planCode, plan } = await getPlanForUser(user.id || user);
  const period = await getCurrentPeriodForUser(user.id || user, planCode);
  const usedTokens = await getTokensUsed(user.id || user, period);
  const cbtQuota = plan?.tokensPerMonth ?? plan?.tokensIncluded ?? 0;
  const remainingTokens = Math.max(cbtQuota - usedTokens, 0);
  let councilTokensThisPeriod = 0;
  try {
    const councilTotals = await getCouncilTotalsForUser({
      userId: user.id,
      workspaceId: workspaceId || null,
      from: period?.start || null,
      to: period?.end || null,
    });
    councilTokensThisPeriod = councilTotals?.totalTokens || 0;
  } catch (err) {
    console.error('[BILLING_COUNCIL_USAGE_ERROR]', err?.message);
  }
  const councilSharePct = cbtQuota > 0 ? Math.min(100, (councilTokensThisPeriod / cbtQuota) * 100) : 0;
  const flags = computeUsageFlags({ used: usedTokens, allowance: cbtQuota });

  return {
    planCode,
    planLabel: plan?.label || planCode,
    cbtQuota,
    usedTokens,
    remainingTokens,
    councilTokensThisPeriod,
    councilSharePct,
    periodStart: period?.start || null,
    periodEnd: period?.end || null,
    periodSource: period?.source || 'local',
    usagePct: flags.usagePct,
    nearCap: flags.nearCap,
    hardCap: flags.hardCap,
  };
}

export async function getUsageStateForUser(userRef) {
  const usage = await getUsageForUser(userRef);
  return {
    planCode: usage.planCode,
    used: usage.usedTokens,
    allowance: usage.cbtQuota,
    usagePct: usage.usagePct,
    nearCap: usage.nearCap,
    hardCap: usage.hardCap,
    remaining: usage.remainingTokens,
    councilTokensThisPeriod: usage.councilTokensThisPeriod,
    councilSharePct: usage.councilSharePct,
  };
}

export async function incrementTokensUsed(userRef, period, deltaTokens, planCodeInput) {
  const user = await resolveUser(userRef);
  if (!user) return null;
  let billingRow = null;
  try {
    billingRow = await getUserBillingState(user.id);
  } catch (err) {
    console.warn('[BILLING_STATE_FETCH_ERROR]', err?.message);
  }
  const targetStart = period?.start instanceof Date ? period.start : new Date(period?.start || 0);
  const targetEnd = period?.end instanceof Date ? period.end : new Date(period?.end || 0);
  const planCode = planCodeInput || billingRow?.plan_code || user?.planId || 'starter';

  const text = `
    INSERT INTO user_billing_state (
      user_id, plan_code, current_period_start, current_period_end, billing_anchor, tokens_used_this_period, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan_code = EXCLUDED.plan_code,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      billing_anchor = EXCLUDED.billing_anchor,
      tokens_used_this_period = CASE
        WHEN user_billing_state.current_period_start = EXCLUDED.current_period_start THEN user_billing_state.tokens_used_this_period + EXCLUDED.tokens_used_this_period
        ELSE EXCLUDED.tokens_used_this_period
      END,
      updated_at = now()
    RETURNING *;
  `;
  const values = [
    user.id,
    planCode,
    targetStart,
    targetEnd,
    DEFAULT_ANCHOR_DAY,
    Math.abs(deltaTokens || 0),
  ];
  try {
    const { rows } = await query(text, values);
    return rows[0] || null;
  } catch (err) {
    console.warn('[BILLING_PERIOD_INCREMENT_ERROR]', err?.message);
    return null;
  }
}

export default {
  getPlanForUser,
  isPaidPlan,
  getCurrentPeriodForUser,
  getTokensUsed,
  incrementTokensUsed,
  computeUsageFlags,
  getUsageStateForUser,
};
