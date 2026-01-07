import { getClient } from '../db.js';
import { insertTokenUsage, insertTokenUsageLegacy, getTokenUsageByTraceId } from '../repositories/tokenUsageRepo.js';
import { getPlanForUser, getCurrentPeriodForUser } from './billingService.js';
import { getModelConfig } from '../config/modelRegistry.js';
import { normalizeUsage } from './tokenUsageHelper.js';
import { PRICING_VERSION, FX_VERSION } from '../config/pricingConfig.js';
import { normalizeProviderKey } from '../utils/providerUtils.js';

function canonicalizeProvider(value) {
  if (!value) return null;
  const normalized = normalizeProviderKey(value);
  if (normalized === 'auto') {
    const raw = String(value).trim().toLowerCase();
    if (!raw || raw === 'auto') return raw || null;
    console.warn('[PROVIDER_CANONICALIZE_UNKNOWN]', { raw });
    return null;
  }
  return normalized;
}

function canonicalizeExistingUsage(row) {
  if (!row) return row;
  return {
    ...row,
    provider: canonicalizeProvider(row.provider),
    requested_provider: canonicalizeProvider(row.requested_provider),
    resolved_provider: canonicalizeProvider(row.resolved_provider),
  };
}

export async function recordUsage({
  userId,
  workspaceId = null,
  projectId = null,
  chatId = null,
  agentId = null,
  scenarioId = null,
  contextId = null,
  provider,
  modelId,
  rawUsage,
  planCode,
  period,
  traceId = null,
  requested = null,
  resolved = null,
  reason = null,
  pricingVersion = PRICING_VERSION,
  fxVersion = FX_VERSION,
}) {
  if (!userId) return null;
  const modelConfig = getModelConfig(modelId);
  const normalized = normalizeUsage(provider, rawUsage, modelConfig);
  const shouldPersist = normalized.totalTokens > 0 || normalized.totalCost > 0;
  const planMeta = await getPlanForUser(userId);
  const activePlan = planCode || planMeta.planCode;
  const resolvedPeriod = period || (await getCurrentPeriodForUser(userId, activePlan));
  const usageSnapshot = {
    promptTokens: normalized.inputTokens,
    completionTokens: normalized.outputTokens,
    totalTokens: normalized.totalTokens,
    toolTokens: 0,
    costUsd: normalized.totalCost || 0,
    costCbT: normalized.cbtDelta || 0,
    pricingVersion,
    fxVersion,
  };

  const payload = {
    traceId,
    userId,
    workspaceId,
    projectId,
    chatId,
    agentId,
    scenarioId,
    contextId,
    provider: canonicalizeProvider(provider || modelConfig.provider),
    model: modelId || modelConfig.id,
    providerModelId: normalized.providerModelId,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    totalTokens: normalized.totalTokens,
    cbtDelta: normalized.cbtDelta,
    totalCost: normalized.totalCost,
    requestedProvider: canonicalizeProvider(requested?.provider || null),
    requestedModel: requested?.model || null,
    resolvedProvider: canonicalizeProvider(resolved?.provider || null),
    resolvedModel: resolved?.model || null,
    routingReason: reason || null,
    pricingVersion,
    fxVersion,
    planCode: activePlan,
    periodStart: resolvedPeriod?.start || new Date(),
    periodEnd: resolvedPeriod?.end || null,
  };

  if (!shouldPersist) {
    return {
      traceId,
      usage: usageSnapshot,
      wallet: null,
      ledger: payload,
    };
  }

  let client;
  let walletBeforeCbt = null;
  let walletAfterCbt = null;
  let allowanceBeforeCbt = null;
  let allowanceAfterCbt = null;
  try {
    client = await getClient();
    await client.query('BEGIN');

    let existing = null;
    if (traceId) {
      try {
        existing = await getTokenUsageByTraceId(traceId, client);
      } catch (err) {
        console.warn('[TOKEN_USAGE_TRACE_LOOKUP_ERROR]', err?.message);
      }
    }
    if (existing) {
      await client.query('COMMIT');
      return {
        traceId,
        usage: {
          promptTokens: existing.input_tokens || 0,
          completionTokens: existing.output_tokens || 0,
          totalTokens: existing.total_tokens || 0,
          toolTokens: 0,
          costUsd: Number(existing.total_cost || 0),
          costCbT: Number(existing.cbt_delta || 0),
          pricingVersion: existing.pricing_version || pricingVersion,
          fxVersion: existing.fx_version || fxVersion,
        },
        wallet: {
          beforeCbT: Number(existing.wallet_before_cbt || 0),
          afterCbT: Number(existing.wallet_after_cbt || 0),
          allowanceBeforeCbT: Number(existing.allowance_before_cbt || 0),
          allowanceAfterCbT: Number(existing.allowance_after_cbt || 0),
        },
        ledger: canonicalizeExistingUsage(existing),
      };
    }

    const userRow = await client.query(
      `SELECT included_cbt_per_month, included_cbt_remaining FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const row = userRow.rows[0] || {};
    allowanceBeforeCbt = Number.isFinite(row.included_cbt_per_month)
      ? Number(row.included_cbt_per_month)
      : Number(planMeta?.limits?.tokensPerMonth || 0);
    walletBeforeCbt = Number.isFinite(row.included_cbt_remaining)
      ? Number(row.included_cbt_remaining)
      : allowanceBeforeCbt;
    walletAfterCbt = Math.max(walletBeforeCbt - (normalized.cbtDelta || 0), 0);
    allowanceAfterCbt = allowanceBeforeCbt;

    payload.walletBeforeCbt = walletBeforeCbt;
    payload.walletAfterCbt = walletAfterCbt;
    payload.allowanceBeforeCbt = allowanceBeforeCbt;
    payload.allowanceAfterCbt = allowanceAfterCbt;

    let inserted = null;
    try {
      inserted = await insertTokenUsage(payload, client);
    } catch (err) {
      if (err?.code === '42703' || err?.code === '42P01') {
        console.warn('[TOKEN_USAGE_SCHEMA_MISSING] falling back to legacy insert', err?.message);
        await insertTokenUsageLegacy(payload, client);
      } else {
        throw err;
      }
    }

    if (normalized.cbtDelta > 0 && walletBeforeCbt !== null) {
      await client.query(
        `UPDATE users
         SET included_cbt_remaining = $2,
             updated_at = now()
         WHERE id = $1`,
        [userId, walletAfterCbt],
      );
    }

    if (normalized.totalTokens > 0) {
      await client.query(
        `INSERT INTO user_billing_state (
          user_id, plan_code, current_period_start, current_period_end, billing_anchor, tokens_used_this_period, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (user_id) DO UPDATE SET
          plan_code = EXCLUDED.plan_code,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          billing_anchor = EXCLUDED.billing_anchor,
          tokens_used_this_period = CASE
            WHEN user_billing_state.current_period_start = EXCLUDED.current_period_start THEN user_billing_state.tokens_used_this_period + EXCLUDED.tokens_used_this_period
            ELSE EXCLUDED.tokens_used_this_period
          END,
          updated_at = now()`,
        [
          userId,
          activePlan,
          resolvedPeriod?.start || new Date(),
          resolvedPeriod?.end || null,
          1,
          Math.abs(normalized.totalTokens || 0),
        ],
      );
    }

    await client.query('COMMIT');

    return {
      traceId,
      usage: usageSnapshot,
      wallet: {
        beforeCbT: walletBeforeCbt,
        afterCbT: walletAfterCbt,
        allowanceBeforeCbT: allowanceBeforeCbt,
        allowanceAfterCbT: allowanceAfterCbt,
      },
      ledger: inserted || payload,
    };
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.warn('[TOKEN_USAGE_ROLLBACK_ERROR]', rollbackErr?.message);
      }
    }
    console.warn('[TOKEN_USAGE_INSERT_ERROR]', err?.message);
  } finally {
    if (client) client.release();
  }

  return {
    traceId,
    usage: usageSnapshot,
    wallet: walletBeforeCbt !== null
      ? {
        beforeCbT: walletBeforeCbt,
        afterCbT: walletAfterCbt,
        allowanceBeforeCbT: allowanceBeforeCbt,
        allowanceAfterCbT: allowanceAfterCbt,
      }
      : null,
    ledger: payload,
  };
}

export default { recordUsage };
