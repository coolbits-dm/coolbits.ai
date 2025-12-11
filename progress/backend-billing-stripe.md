# Backend Billing & Stripe Plan

## Overview
- Goal: Real Stripe-backed Pro subscriptions for CoolBits.ai chat, with token balances and plan state stored on the backend.
- Scope: Stripe integration, user model fields, webhook processing, /api/billing/* and /api/account/usage.

## Milestones
1. Test-mode Stripe flow working end-to-end.
2. Live-mode Stripe flow working for real payments.
3. Token accounting connected to model usage.
4. Low-balance banner thresholds and protections.

## Tasks

### M1 – Test-mode Stripe Checkout & Webhook (MVP)
- [ ] Confirm env vars for TEST mode:
  - STRIPE_SECRET_KEY (sk_test_…)
  - STRIPE_PRICE_PRO_MONTHLY (test price id)
  - STRIPE_WEBHOOK_SECRET (test endpoint secret)
- [ ] Verify /api/billing/upgrade returns a Checkout Session `{ url, sessionId }`.
- [ ] Verify /api/billing/stripe-webhook handles:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] After a successful test payment:
  - user.planId = "pro"
  - user.planLabel = "Pro"
  - user.stripeCustomerId, stripeSubscriptionId, stripeStatus = "active"
  - user.tokensRemaining >= 50000
- [ ] After a canceled / deleted subscription:
  - user.planId = "starter"
  - user.planLabel = "Starter"
  - user.stripeStatus = "canceled"

### M2 – Live-mode Stripe Checkout
- [ ] Create LIVE product + price in Stripe for Pro.
- [ ] Configure LIVE webhook for `https://coolbits.ai/api/billing/stripe-webhook` with the same events as TEST.
- [ ] Add live env vars:
  - STRIPE_SECRET_KEY (sk_live_…)
  - STRIPE_PRICE_PRO_MONTHLY (live price id)
  - STRIPE_WEBHOOK_SECRET (live endpoint secret)
- [ ] Document the switch procedure TEST → LIVE (including pm2 restart) in this file.
- [ ] Run a real payment with the owner account and confirm plan/tokens update correctly.

### M3 – Token accounting from model usage
- [ ] In the chat pipeline, read token usage from the Vertex/OpenAI response.
- [ ] Implement a helper to decrement `tokensRemaining` and increment `totalUsed` per request.
- [ ] Ensure usage writes are atomic and cannot push tokensRemaining below 0.
- [ ] Update /api/account/usage to expose `totalUsed` and keep `tokensRemaining` canonical.

### M4 – Low-balance handling
- [ ] Implement a threshold config (e.g. show banner under 5000 tokens).
- [ ] Set `showLowBalanceBanner` based on thresholds and plan type.
- [ ] Block /api/chat when tokensRemaining <= 0 with a clean 402/429 response.

### M5 – Billing summary + live webhook finalization (current)
- [ ] Remove the TEMP `/api/billing/summary` direct handler from `server.js`; summary must be served only by `billing-router.js` with canonical payload (plan/limits/tokens/trial/stripe).
- [ ] Align summary auth with `/api/auth/me` (Bearer + `cb_token`), set `Cache-Control: no-store`, and add concise `[BILLING_SUMMARY]` logs.
- [ ] Ensure `billing-router.js` uses plan data from `config/plans.js` (starter/agency/dev/enterprise) and falls back to starter when missing.
- [ ] Configure live Stripe webhook at `https://coolbits.ai/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`; set `STRIPE_WEBHOOK_SECRET` in `.env`.
- [ ] Implement webhook mapping price→plan, update user billing fields (plan code/label, stripe customer/subscription/status/period end, trial info), and top-up tokens per plan. Downgrade to starter on delete.
- [ ] After webhook updates, `/api/billing/summary` must reflect the real subscription state (plan code/status, trial dates, tokens remaining).

## Notes / Decisions
- Record any decisions about token amounts, pricing, and renewal behavior here.
