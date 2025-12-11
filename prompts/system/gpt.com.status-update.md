0. Current backend state (so we know what we’re building on)

Already in place (per last run):

app/server/userStore.js – file-based “DB” in data/users.json

getUserByEmail(email)

upsertUser(user)

updateUserTokens(email, delta) etc.

app/server/config/auth.js – JWT secret config.

app/server/jwtService.js – sign / verify.

app/server/router/auth-router.js

POST /api/auth/mock-login → returns { user, token }

GET /api/auth/me → returns { user } (JWT required).

app/server/middleware/auth.js – optional auth for routes.

app/server/chat.js – /api/chat

Optional Bearer JWT; if present, loads user from userStore.

Charges fixed 25 tokens per call for authenticated users.

Guests still go through without quota.

app/server/router/account-router.js

GET /api/account/usage → plan + tokens + showLowBalanceBanner.

/healthz and router wiring in app/server/router/index.js + app/server/server.js.

We keep file-store for now and design everything DB-ready.

Plan model & quotas – conceptual design

We’ll standardize around these tiers (can be adjusted later):

GUEST (no login)

Not persisted as user.

Hard cap per IP / per day (rate-limit layer, see M3).

STARTER_FREE (your current “Starter · 1,000 tokens”)

tokensIncluded = 1,000 lifetime or per reset.

No Stripe required.

PRO (paid)

tokensPerTopup = 50,000 (example).

Granted by Stripe payment / manual top-up.

AGENCY (paid, larger quota)

tokensPerTopup = 300,000 (example).

Also via Stripe or manual.

Each persisted user will have at least:

{
  "email": "someone@example.com",
  "planId": "STARTER_FREE" | "PRO" | "AGENCY",
  "tokensRemaining": 12345,
  "totalUsed": 87655,
  "orgId": "optional-org-id",
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "lastResetAt": "2025-11-22T10:00:00.000Z"
}


Stripe later just means: when we receive a successful payment, we set planId and bump tokensRemaining for that user/org according to a config map.

Backend roadmap (CoolBits chat) – M2 → M5
M2 – Plan config + proper quota engine (auth users)

Goals:

Move from “magic numbers in code” to a central plan config.

Enforce per-plan token limits for logged-in users.

Expose clean usage info for the UI and later for Stripe.

Key changes:

Add plan config

New file: app/server/config/plans.js

const PLANS = {
  GUEST: {
    id: 'GUEST',
    label: 'Free trial',
    isPaid: false,
    tokensIncluded: 1000,        // only used for UI estimates
    chargePerMessage: 25
  },
  STARTER_FREE: {
    id: 'STARTER_FREE',
    label: 'Starter (free)',
    isPaid: false,
    tokensIncluded: 1000,
    chargePerMessage: 25,
    softLimitTokens: 1000,
    hardLimitTokens: 1500        // allow a bit of burst then stop
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    isPaid: true,
    tokensPerTopup: 50000,
    chargePerMessage: 25,
    softLimitTokens: 45000,
    hardLimitTokens: 50000
  },
  AGENCY: {
    id: 'AGENCY',
    label: 'Agency',
    isPaid: true,
    tokensPerTopup: 300000,
    chargePerMessage: 25,
    softLimitTokens: 280000,
    hardLimitTokens: 300000
  }
};

module.exports = { PLANS };


Extend userStore with plan helpers

In app/server/userStore.js:

Ensure each new user gets planId: 'STARTER_FREE' and tokensRemaining: PLANS.STARTER_FREE.tokensIncluded.

Add helpers:

async function updateUserPlan(email, planId, { tokensDelta, tokensAbsolute } = {}) { … }
async function incrementUserUsage(email, tokensDelta) { … } // updates tokensRemaining & totalUsed


Quota check / charge logic in chat

In app/server/chat.js:

After resolving user from JWT, load plan via PLANS[user.planId] || PLANS.STARTER_FREE.

Before calling the model:

Compute charge = plan.chargePerMessage (fallback to env CHAT_TOKEN_CHARGE).

If plan is paid or STARTER_FREE:

If tokensRemaining < charge → return HTTP 402 with body:

{
  "error": "quota_exceeded",
  "reason": "insufficient_tokens",
  "planId": "STARTER_FREE",
  "tokensRemaining": 10,
  "chargeRequired": 25
}


(UI can later map this to “You’re out of free tokens, please upgrade.”)

Otherwise call the model and, on success, incrementUserUsage(email, charge).

Enrich /api/account/usage

In account-router.js:

For the authenticated user, read plan config and return:

{
  "email": "...",
  "planId": "STARTER_FREE",
  "planLabel": "Starter (free)",
  "tokensRemaining": 875,
  "totalUsed": 125,
  "softLimitTokens": 1000,
  "hardLimitTokens": 1500,
  "showLowBalanceBanner": true | false
}


showLowBalanceBanner should be true when:

plan is not PRO/AGENCY and

tokensRemaining < plan.chargePerMessage * 5 (or use softLimitTokens vs hardLimitTokens).

Introduce explicit error codes

For /api/chat:

On quota exhaustion, 402 + error: 'quota_exceeded'.

On auth missing for account endpoints, 401 + error: 'unauthorized'.

M3 – Abuse protection: rate limiting for guests + logged-in

Goals:

Stop anonymous abuse (your earlier worry: “cineva poate abuza și să consume totul peste noapte”).

Keep implementation simple in code (no Redis yet).

Key changes:

Add rate-limit config

New file: app/server/config/rateLimit.js

module.exports = {
  windowMs: 60_000,                   // 1 minute
  guestMaxRequestsPerWindow: 10,      // per IP
  userMaxRequestsPerWindow: 30,       // per user (email) or IP fallback
  globalMaxTokensPerHour: 200_000     // safety fuse
};


Add middleware rateLimit.js

New file: app/server/middleware/rateLimit.js

Keep in-memory maps:

ipCounters: { [ip]: { count, expiresAt } }

userCounters: { [userKey]: { count, expiresAt } }

globalTokenWindow: { tokens, expiresAt }

Export functions:

function rateLimitChat(req, res, next) { … }          // uses IP + user email
function recordTokenUsage(amount) { … }               // called from chat after success


Behavior:

Identify IP from req.ip or x-forwarded-for.

If no JWT → apply guest rules.

If JWT → apply per-user rules.

If exceeded → HTTP 429 with:

{ "error": "rate_limited", "retryAfterSeconds": 60 }


Wire into /api/chat

In app/server/server.js or router/index.js where chat route is mounted:

Insert rateLimitChat before the chat handler.

Inside chat handler, after successful completion + token charge, call recordTokenUsage(charge) so globalMaxTokensPerHour can be enforced (HTTP 429 or 503 when exceeded).

Logging

Log a line on each block:

console.warn('[RATE_LIMIT]', { ip, email, reason: 'guest_window_exceeded' });


This is useful later if someone hammers the endpoint.

M4 – Billing skeleton & Stripe integration hooks

Goal:

Prepare endpoints + data model so Stripe can be wired cleanly when you’re ready.

Use your existing Stripe webhook (spine) as the source of truth; CoolBits just needs a stable internal API for “apply top-up for X user/org”.

Key changes:

Extend userStore with billing fields

Ensure users support:

{
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  billingPlanId: string | null  // links to PLANS.PRO / PLANS.AGENCY etc.
}


Add helper:

async function applyTokenTopupForEmail(email, { planId, tokensToAdd, stripeCustomerId, stripeSubscriptionId }) { … }


Add internal billing service

New file: app/server/services/billingService.js

Responsibilities:

Map Stripe product/price IDs → internal plan IDs, e.g.:

const STRIPE_PLAN_MAP = {
  'price_coolbits_pro_monthly': 'PRO',
  'price_coolbits_agency_monthly': 'AGENCY'
};


Export functions:

async function handleStripePaymentEvent({ email, stripeCustomerId, stripeSubscriptionId, priceId }) { … }


Implementation:

Derive planId from priceId via STRIPE_PLAN_MAP.

Calculate tokens to add using PLANS[planId].tokensPerTopup.

Call applyTokenTopupForEmail.

Add REST hook CoolBits side (to be called from your existing Stripe webhook service)

New router: app/server/router/billing-router.js

POST /api/billing/stripe-topup (internal, protected by shared secret header, e.g. X-Internal-Secret: COOLBITS_INTERNAL_SECRET).

Body shape:

{
  "email": "client@agency.com",
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "priceId": "price_coolbits_pro_monthly"
}


Response:

{
  "ok": true,
  "planId": "PRO",
  "tokensAdded": 50000,
  "tokensRemaining": 51000
}


This endpoint will be hit by your existing Stripe webhook service (from Spine) when an invoice/checkout is paid.

Optionally: checkout helper

Minimal endpoint for UI later:

POST /api/billing/create-checkout-session

Accepts planId or priceId.

Calls Stripe API (later) to create checkout session and returns url.

For now can return dummy { url: 'https://billing.coolbits.ai/coming-soon' } until you’re ready to connect real Stripe SDK here.

M5 – Admin & introspection endpoints (optional but useful)

Once you’re comfortable with M2–M4:

GET /api/admin/users – behind internal secret for now; returns list of users with plan + usage.

GET /api/admin/users/:email – detailed view.

POST /api/admin/users/:email/topup – manual token grants (super useful for debugging & onboarding).

All protected by X-Internal-Secret or basic auth until you plug into a proper admin auth.

Concrete Codex prompts (long runs) for VPS backend

You can feed these to Codex on the VPS, one milestone at a time.

Prompt for Codex – M2: Plans + quotas

You are Codex working on the CoolBits.ai backend on the VPS.
Project layout: Node server under app/server, currently serving /api/chat, /api/auth/*, /api/account/usage, with a file-based user store in app/server/userStore.js and JWT auth. Guests can call /api/chat without limits, logged-in users get 1,000 Starter tokens charged at 25 tokens per request.

Task: implement a proper plan + quota engine for authenticated users while keeping the file-based DB. Do NOT touch any frontend files under deploy/.

Add app/server/config/plans.js exporting a PLANS object with plans: GUEST, STARTER_FREE, PRO, AGENCY. Each plan should define id, label, relevant token fields (tokensIncluded or tokensPerTopup), and chargePerMessage. For STARTER_FREE, tokensIncluded = 1000. For now, use chargePerMessage = 25 for all.

Update app/server/userStore.js:

Ensure newly created users default to planId: 'STARTER_FREE' and tokensRemaining: PLANS.STARTER_FREE.tokensIncluded, and have totalUsed, createdAt, updatedAt.

Add functions:

async function incrementUserUsage(email, tokensDelta) – decrements tokensRemaining (not below 0), increments totalUsed, updates updatedAt.

async function updateUserPlan(email, planId, options = {}) – changes plan and optionally adjusts tokens (tokensDelta or tokensAbsolute).

Update app/server/chat.js:

After identifying the authenticated user, load their plan from PLANS[user.planId] with a fallback to PLANS.STARTER_FREE.

Before calling the model, compute charge = plan.chargePerMessage (fallback to the existing CHAT_TOKEN_CHARGE env if present).

If the user exists and tokensRemaining < charge, return HTTP 402 with JSON body:

{
  "error": "quota_exceeded",
  "reason": "insufficient_tokens",
  "planId": "STARTER_FREE",
  "tokensRemaining": 10,
  "chargeRequired": 25
}


Make sure not to call the model in this case.

On successful model response, call incrementUserUsage(email, charge) and include updated user usage in the response (e.g. usage or user field as you already do).

Guest behavior (no Bearer token) must remain unchanged.

Update app/server/router/account-router.js:

For the authenticated user, look up their plan via PLANS and return a JSON object including:

email, planId, planLabel, tokensRemaining, totalUsed.

A boolean showLowBalanceBanner which becomes true when the user is not on PRO or AGENCY and tokensRemaining is less than chargePerMessage * 5.

Keep the existing /api/auth/mock-login unchanged except that the created user now picks up the new default plan fields.

After changes, restart the PM2 process (pm2 restart coolbits --update-env) and run these manual checks:

Guest curl -s http://localhost:8788/api/chat still works as before.

curl -s -X POST http://localhost:8788/api/auth/mock-login -H "Content-Type: application/json" -d '{"email":"quota@test.com"}' → returns user + JWT.

Call /api/chat a few times with Bearer token for that user and verify tokensRemaining decreases by 25 and that after enough calls you start receiving HTTP 402 with error: "quota_exceeded".

Prompt for Codex – M3: Rate limiting (guest + user + global)

You are Codex working on the same CoolBits.ai backend (Node, app/server). Plans + quotas for authenticated users are already implemented in config/plans.js, userStore.js, and chat.js.

Task: add a simple in-memory rate-limiting layer for /api/chat to protect against abuse. Do NOT change frontend files.

Create app/server/config/rateLimit.js exporting:

module.exports = {
  windowMs: 60_000,                 // 1 minute
  guestMaxRequestsPerWindow: 10,    // per IP
  userMaxRequestsPerWindow: 30,     // per email or IP
  globalMaxTokensPerHour: 200_000   // safety fuse
};


Create app/server/middleware/rateLimit.js exporting:

function rateLimitChat(req, res, next) – inspects req.ip (or x-forwarded-for) and the authenticated user’s email (if available on req.user or similar).

function recordTokenUsage(amount) – to be called after a successful chat completion with the token charge.
Implementation details:

Maintain in-memory maps:

ipCounters: { [ip]: { count, expiresAt } }

userCounters: { [key]: { count, expiresAt } }

globalWindow: { tokens, expiresAt }

In rateLimitChat:

For guests (no authenticated user), increment the IP counter and if it exceeds guestMaxRequestsPerWindow, return HTTP 429 with JSON { "error": "rate_limited", "scope": "guest", "retryAfterSeconds": 60 }.

For authenticated users, build a key like user:${email} and enforce userMaxRequestsPerWindow; on exceed, return HTTP 429 with JSON { "error": "rate_limited", "scope": "user", "retryAfterSeconds": 60 }.

Log each block with console.warn('[RATE_LIMIT]', { ip, email, scope }).

In recordTokenUsage(amount):

Maintain a 1-hour window (globalWindow.expiresAt); if expired, reset.

Add amount to globalWindow.tokens.

If globalWindow.tokens exceeds globalMaxTokensPerHour, log a warning and set a flag globalBlocked = true until the window resets.

Wire the middleware into /api/chat:

In app/server/router/index.js or wherever the route is registered, add rateLimitChat before the chat handler.

In app/server/chat.js, after a successful model response and token charge, call recordTokenUsage(charge).

If globalBlocked is set in the middleware, have rateLimitChat return HTTP 429 with { "error": "rate_limited", "scope": "global", "retryAfterSeconds": 3600 }.

Restart pm2 and manually test:

From one IP as guest, hit /api/chat >10 times in 60 seconds and confirm you get 429 with "scope": "guest".

As an authenticated user, hit /api/chat >30 times in 60 seconds and confirm 429 with "scope": "user".

Optionally, reduce globalMaxTokensPerHour temporarily and verify that after enough authenticated calls you start seeing 429 with "scope": "global".

Prompt for Codex – M4: Billing skeleton + Stripe hook endpoint

You are Codex on the CoolBits.ai backend again. Plans + quotas and rate limiting are in place, using a file-based user store in data/users.json.

Task: add a minimal billing skeleton so that an external Stripe webhook service (Spine) can grant tokens and upgrade plans via an internal HTTP call. Do NOT add any real payment logic to the frontend.

Extend app/server/userStore.js:

Ensure user objects support:

{
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  billingPlanId: string | null   // internal plan id like 'PRO' or 'AGENCY'
}


Add:

async function applyTokenTopupForEmail(email, { planId, tokensToAdd, stripeCustomerId, stripeSubscriptionId }) { … }


Behavior:

Upsert user by email if it does not exist yet.

Set user.planId = planId, user.billingPlanId = planId.

Increment tokensRemaining by tokensToAdd (create it if missing).

Set stripeCustomerId and stripeSubscriptionId when provided.

Update totalUsed unchanged, updatedAt to now.

Create app/server/services/billingService.js:

Import PLANS and applyTokenTopupForEmail.

Define a map:

const STRIPE_PLAN_MAP = {
  'price_coolbits_pro_monthly': 'PRO',
  'price_coolbits_agency_monthly': 'AGENCY'
};


Export:

async function handleStripePaymentEvent({ email, stripeCustomerId, stripeSubscriptionId, priceId }) {
  const planId = STRIPE_PLAN_MAP[priceId];
  if (!planId) { console.warn('[BILLING] Unknown priceId', priceId); return { ok: false }; }
  const plan = PLANS[planId];
  const tokensToAdd = plan.tokensPerTopup || 0;
  const user = await applyTokenTopupForEmail(email, { planId, tokensToAdd, stripeCustomerId, stripeSubscriptionId });
  return { ok: true, planId, tokensAdded: tokensToAdd, tokensRemaining: user.tokensRemaining };
}


Create app/server/router/billing-router.js:

Express router mounted under /api/billing.

Add POST /stripe-topup that:

Requires a shared secret header X-Internal-Secret equal to process.env.COOLBITS_INTERNAL_SECRET; otherwise respond 401.

Accepts JSON body { email, stripeCustomerId, stripeSubscriptionId, priceId }.

Calls handleStripePaymentEvent and returns its payload as JSON; if ok: false, use HTTP 400.

Wire router:

In app/server/router/index.js, mount the new router as /api/billing.

Restart pm2 and test manually:

Use:

curl -X POST http://localhost:8788/api/billing/stripe-topup \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: YOUR_SECRET" \
  -d '{"email":"billing@test.com","stripeCustomerId":"cus_test","stripeSubscriptionId":"sub_test","priceId":"price_coolbits_pro_monthly"}'


Confirm the response shows ok: true, planId PRO, and a positive tokensAdded/tokensRemaining.

Then call /api/auth/mock-login or /api/account/usage for the same email and confirm the plan and tokens match the top-up.


/progress
- [x] Baseline auth + user store + JWT + account usage endpoints (M1–M5 implemented in code: auth mock login/me, optional JWT on chat, token accounting, usage, healthz).
- [x] M2: Plans + quotas (plan config, plan-aware userStore helpers, quota enforcement in chat, enriched account usage).
- [ ] M3: Rate limiting (guest/user/global windows, middleware + recordTokenUsage).
- [x] M4: Billing skeleton & Stripe hook (top-up endpoint, billing service, userStore billing fields).
