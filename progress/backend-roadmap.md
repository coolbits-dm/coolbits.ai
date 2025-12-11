# Backend Roadmap (Post-MVP Audit)

## Milestone 1: DB & User Persistence
- Migrate user store to Postgres (coolbits DB, public.users).
- Normalize plan/tokens fields and keep Stripe fields in sync.
- Ensure SSL pg pool (managed Cloud SQL) with fast-fail on missing env.

## Milestone 2: Auth + Account Flows
- Google OAuth login + verification flags (emailVerified, emailVerifiedAt).
- /api/account/usage stable shape (plan, tokens, usage, banners).
- Optional “Prefer English” setting propagated to chat handler.

## Milestone 3: Stripe Live Readiness
- Checkout session via /api/billing/upgrade → Stripe Checkout.
- Webhook: checkout.session.*, customer.subscription.* → update plan/tokens.
- Token top-up for Pro (≥50k), graceful downgrade to Starter on cancel.

## Milestone 4: LLM Chat Wiring
- Vertex-only model path (Gemini 2.5 Flash-Lite, us-central1).
- Centralized system prompt + preferEnglish toggle.
- RAW request/model logging with provider/model.

## Milestone 5: Pricing & cbT (CoolBits Tokens)
- pricingConfig with per-model factors and cbT cost helpers.
- LLM service computes cbtUsed + costEstimate per call and exposes to chat layer.
- Public GET /api/pricing/models endpoint for model sheet.
- Next: connect cbT usage to wallet/ledger and enforce plan quotas.

## Milestone 6: Token Accounting & Quotas (current)
- Schema (not yet applied):
  - migrations/2025-12-01_create_token_usage.sql
  - migrations/2025-12-01_create_user_billing_state.sql
- Services:
  - app/server/services/billingService.js: getPlanForUser, isPaidPlan, getCurrentPeriodForUser, getTokensUsed, incrementTokensUsed.
  - app/server/repositories/tokenUsageRepo.js: insertTokenUsage per model call.
  - app/server/services/tokenUsageHelper.js: extractUsageFromProviderResponse (Vertex usage mapping; returns null if missing).
- Routing changes:
  - app/server/router/chats-router.js:
    - Pre-call quota check via billingService (Starter bypassed; paid plans block when used >= tokensPerMonth).
    - Post-call: extract usage, insert token_usage, increment user_billing_state (best-effort, logs [TOKEN_USAGE_INSERT_ERROR] on failure).
  - app/server/router/billing-router.js:
    - /api/billing/summary now uses billingService for real usage (used/remaining); response shape unchanged.
- Logging: [BILLING_SUMMARY], [CBT_QUOTA_BLOCKED], [TOKEN_USAGE_INSERT_ERROR].
- Stripe prep only (no behaviour change): fields ready for customer/subscription/current_period_* alignment later.

## ⏳ Next Steps
- Add debug logs for all webhook POSTs.
- Add field to users table: last_seen_at TIMESTAMP.
- Finalize /api/chat logging & error masking.
- Move to service layer for model abstraction.
