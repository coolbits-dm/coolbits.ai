import { query } from './db.js';
import { PLANS, getPlanConfig, getCapabilities } from './config/plans.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    planId: row.plan_id || 'STARTER_FREE',
    planLabel: row.plan_label || getPlanConfig(row.plan_id || 'STARTER_FREE').label,
    tokensRemaining: row.tokens_remaining,
    totalUsed: row.total_used,
    emailVerified: row.email_verified,
    emailVerifiedAt: row.email_verified_at,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeStatus: row.stripe_status,
    subscriptionStatus: row.subscription_status,
    includedCbtPerMonth: row.included_cbt_per_month,
    includedCbtRemaining: row.included_cbt_remaining,
    workspacesAllowed: row.workspaces_allowed || null,
    workspacesSelected: row.workspaces_selected || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserByEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const result = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [key]);
  return rowToUser(result.rows[0]);
}

export async function getUserById(id) {
  if (!id) return null;
  const result = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return rowToUser(result.rows[0]);
}

export async function getUserByStripeCustomerId(customerId) {
  if (!customerId) return null;
  const result = await query('SELECT * FROM users WHERE stripe_customer_id = $1 LIMIT 1', [customerId]);
  return rowToUser(result.rows[0]);
}

export async function upsertUser(userPartial) {
  const key = normalizeEmail(userPartial?.email);
  if (!key) throw new Error('Invalid email');
  const now = new Date().toISOString();
  const existing = await getUserByEmail(key);
  const isNew = !existing;
  const planConfig = getPlanConfig(userPartial?.planId || existing?.planId || 'STARTER_FREE');

  const planId = planConfig.id || 'STARTER_FREE';
  const planLabel = userPartial?.planLabel || planConfig.label || 'Starter (free)';
  const tokensRemaining = Number.isFinite(userPartial?.tokensRemaining)
    ? userPartial.tokensRemaining
    : null;
  const totalUsed = Number.isFinite(userPartial?.totalUsed)
    ? userPartial.totalUsed
    : null;

  const seedPerMonth = planConfig.includedCbtPerMonth || 0;
  const includedCbtPerMonth = isNew
    ? seedPerMonth
    : (existing?.includedCbtPerMonth == null ? seedPerMonth : null);
  const includedCbtRemaining = isNew
    ? seedPerMonth
    : (existing?.includedCbtRemaining == null ? seedPerMonth : null);

  const res = await query(
    `INSERT INTO users (email, plan_id, plan_label, tokens_remaining, total_used, email_verified, email_verified_at, stripe_customer_id, stripe_subscription_id, stripe_status, subscription_status, included_cbt_per_month, included_cbt_remaining, workspaces_allowed, workspaces_selected, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 1000), COALESCE($5, 0), COALESCE($6, FALSE), $7, $8, $9, $10, COALESCE($11, 'inactive'), COALESCE($12, 0), COALESCE($13, 0), $14, $15, $16, $16)
     ON CONFLICT (email) DO UPDATE SET
       plan_id = COALESCE(EXCLUDED.plan_id, users.plan_id),
       plan_label = COALESCE(EXCLUDED.plan_label, users.plan_label),
       tokens_remaining = COALESCE(EXCLUDED.tokens_remaining, users.tokens_remaining),
       total_used = COALESCE(EXCLUDED.total_used, users.total_used),
       email_verified = COALESCE(EXCLUDED.email_verified, users.email_verified),
       email_verified_at = COALESCE(EXCLUDED.email_verified_at, users.email_verified_at),
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, users.stripe_subscription_id),
       stripe_status = COALESCE(EXCLUDED.stripe_status, users.stripe_status),
       subscription_status = COALESCE(EXCLUDED.subscription_status, users.subscription_status),
       included_cbt_per_month = COALESCE(EXCLUDED.included_cbt_per_month, users.included_cbt_per_month),
       included_cbt_remaining = COALESCE(EXCLUDED.included_cbt_remaining, users.included_cbt_remaining),
       workspaces_allowed = COALESCE(EXCLUDED.workspaces_allowed, users.workspaces_allowed),
       workspaces_selected = COALESCE(EXCLUDED.workspaces_selected, users.workspaces_selected),
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      key,
      planId,
      planLabel,
      tokensRemaining,
      totalUsed,
      userPartial?.emailVerified,
      userPartial?.emailVerifiedAt,
      userPartial?.stripeCustomerId,
      userPartial?.stripeSubscriptionId,
      userPartial?.stripeStatus,
      userPartial?.subscriptionStatus,
      includedCbtPerMonth,
      includedCbtRemaining,
      userPartial?.workspacesAllowed || null,
      userPartial?.workspacesSelected || null,
      now,
    ],
  );

  return rowToUser(res.rows[0]);
}

export async function updateUserTokens(email, delta) {
  const key = normalizeEmail(email);
  if (!key) throw new Error('Invalid email');
  const res = await query(
    `UPDATE users
     SET tokens_remaining = tokens_remaining + $2,
         total_used = total_used + CASE WHEN $2 < 0 THEN ABS($2) ELSE 0 END,
         updated_at = now()
     WHERE email = $1
     RETURNING *`,
    [key, delta],
  );
  return rowToUser(res.rows[0]);
}

export async function incrementUserUsage(email, tokensDelta) {
  const delta = Math.abs(tokensDelta || 0);
  return updateUserTokens(email, -delta);
}

export async function updateUserPlan(email, planId, options = {}) {
  const key = normalizeEmail(email);
  if (!key) throw new Error('Invalid email');
  const plan = PLANS[planId] || PLANS.STARTER_FREE;

  const current = await getUserByEmail(key) || {};
  let tokensRemaining = current.tokensRemaining;
  if (options.resetTokens === true) {
    tokensRemaining =
      plan.upgrade?.tokensOnUpgrade ??
      plan.tokensPerTopup ??
      plan.tokensIncluded ??
      tokensRemaining;
  } else if (typeof options.tokensAbsolute === 'number') {
    tokensRemaining = options.tokensAbsolute;
  } else if (typeof options.tokensDelta === 'number') {
    tokensRemaining = (tokensRemaining || 0) + options.tokensDelta;
  } else if (!Number.isFinite(tokensRemaining)) {
    tokensRemaining = plan.tokensIncluded || 0;
  }

  const res = await query(
    `UPDATE users
     SET plan_id = $2,
         plan_label = $3,
         tokens_remaining = $4,
         updated_at = now()
     WHERE email = $1
     RETURNING *`,
    [key, plan.id, plan.label || 'Starter', tokensRemaining],
  );
  return rowToUser(res.rows[0]);
}

export async function updateUser(user) {
  const key = normalizeEmail(user?.email || user?.id);
  if (!key) throw new Error('Invalid user');
  const current = await getUserByEmail(key) || {};
  const merged = {
    ...current,
    ...user,
  };
  if (!merged.subscriptionStatus) merged.subscriptionStatus = current.subscriptionStatus || 'inactive';

  const res = await query(
    `UPDATE users
     SET plan_id = $2,
         plan_label = $3,
         tokens_remaining = $4,
         total_used = $5,
         email_verified = $6,
         email_verified_at = $7,
         stripe_customer_id = $8,
         stripe_subscription_id = $9,
         stripe_status = $10,
         subscription_status = $11,
         included_cbt_per_month = $12,
         included_cbt_remaining = $13,
         workspaces_allowed = $14,
         workspaces_selected = $15,
         updated_at = now()
     WHERE email = $1
     RETURNING *`,
    [
      key,
      merged.planId,
      merged.planLabel,
      merged.tokensRemaining,
      merged.totalUsed,
      merged.emailVerified,
      merged.emailVerifiedAt,
      merged.stripeCustomerId,
      merged.stripeSubscriptionId,
      merged.stripeStatus,
      merged.subscriptionStatus,
      merged.includedCbtPerMonth,
      merged.includedCbtRemaining,
      merged.workspacesAllowed,
      merged.workspacesSelected,
    ],
  );
  return rowToUser(res.rows[0]);
}

export function toUsageSnapshot(user, charge) {
  if (!user) return null;
  return {
    email: user.email,
    planId: user.planId,
    planLabel: user.planLabel,
    tokensRemaining: user.tokensRemaining,
    totalUsed: user.totalUsed || 0,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
    canRequestVerification: !user.emailVerified,
    stripeStatus: user.stripeStatus || null,
    showLowBalanceBanner: !charge ? false : (!PLANS[user.planId]?.isPaid && (user.tokensRemaining || 0) < charge * 5),
  };
}


let _cbtRepairRan = false;
export async function repairStarterFreeCbt() {
  if (_cbtRepairRan) return;
  _cbtRepairRan = true;
  const plan = getPlanConfig('STARTER_FREE');
  const target = plan.includedCbtPerMonth || 0;
  if (!target) return;
  const res = await query(
    `UPDATE users
       SET included_cbt_per_month = $1,
           included_cbt_remaining = $1,
           updated_at = now()
     WHERE plan_id = 'STARTER_FREE'
       AND COALESCE(included_cbt_per_month, 0) = 0
       AND COALESCE(included_cbt_remaining, 0) = 0`,
    [target],
  );
  if (res.rowCount) {
    console.log('[CBT_REPAIR] applied', { updated: res.rowCount, target });
  }
}
