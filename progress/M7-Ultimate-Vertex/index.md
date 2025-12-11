# M7 – Ultimate Vertex Skeleton

## Overview
M7 introduces the Ultimate tier for CoolBits clients. The initial delivery is a mock-only skeleton: the backend exposes `/api/ultimate/campaign-plan`, validates Ultimate requests, enforces Level + reasoning gating, and generates high-quality mock marketing plans. The frontend gets a dedicated wizard under `/ultimate/`, while documentation and tooling describe how Vertex will plug in later.

## Architecture (text diagram)
```
Browser /ultimate/ page
  ↓
Cloudflare Pages (coolbits)
  ↓
Cloudflare Worker proxy
  ↓
https://cloud.cblm.ai/api/ultimate/campaign-plan
  ↓
Express router → Level Engine → Vertex module (planner + renderer)
  ↓
Mock planner today (future Vertex HTTP client)
```

## API Contract
### Request (POST `/api/ultimate/campaign-plan`)
```json
{
  "visitorId": "abc-123",
  "businessProfile": {
    "name": "Maison Dadoo",
    "industry": "florist",
    "website": "https://maisondadoo.ro",
    "geo": "RO",
    "notes": "Premium bouquets"
  },
  "objectives": { "primary": "black_friday_sales", "secondary": ["increase_traffic"] },
  "budget": { "amount": 5000, "currency": "EUR", "period": "seasonal" },
  "platforms": ["google-ads", "meta-ads"],
  "timeframe": { "start": "2025-11-01", "end": "2025-12-01" },
  "reasoningBoost": true
}
```

### Response
```json
{
  "visitorId": "abc-123",
  "level": { "label": "level-2", "value": 2 },
  "reasoning": { "active": true, "expiresAt": "2025-11-18T12:00:00Z" },
  "engine": { "source": "mock", "model": "mock-ultimate-v1" },
  "plan": {
    "generatedAt": "2025-11-18T10:00:00Z",
    "strategy": { "headline": "Full-funnel plan..." },
    "budget": { "total": 5000, "currency": "EUR", "allocations": [] },
    "kpis": { "cpc": { "google": {"min": 0.5, "max": 1.4 } } },
    "platforms": [{ "name": "google-ads", "campaigns": [...] }],
    "milestones": [{ "label": "Week 1", "focus": "Launch" }]
  }
}
```

Errors:
- `403 { "error": "level_too_low", "requiredLevel": 1 }`
- `403 { "error": "reasoning_required", "reason": "Ultimate planning requires..." }`
- `422 { "error": "validation_failed", "details": ["budget.amount must be..."] }`

## Gating Rules
1. Visitors below Level 1 cannot access `/api/ultimate/*`.
2. Reasoning token must be active unless `DEV_ALLOW_ULTIMATE_WITHOUT_REASONING=true`.
3. Payload must include business profile, objectives, budget, platforms, and timeframe.

## Environment Variables
- `USE_REAL_VERTEX` – when true, planner logs TODO but still falls back to mock generator.
- `VERTEX_MODEL_ID` – optional future model id recorded in the response.
- `DEV_ALLOW_ULTIMATE_WITHOUT_REASONING` – bypasses reasoning requirement for internal testing.
- `REASONING_DURATION_MS`, `REASONING_CHECKOUT_URL`, `OPENAI_MODEL_ADVANCED` – reused from M1.5 reasoning boost.

## Testing Steps
1. **Planner script**: `cd C:\awb\coolbits-ai-live && node server/tools/ultimate-plan-test.js` – prints a mock plan JSON.
2. **API manual**: run the Express server locally and `curl -X POST http://localhost:8788/api/ultimate/campaign-plan -H "Content-Type: application/json" -d @payload.json`.
3. **Frontend wizard**: open `C:\awb\coolbits\ultimate\index.html` (or `/ultimate/` on Cloudflare preview) and submit the wizard. Verify badges + error banners.
4. **Reasoning gating**: hit `/api/reasoning/session` first, then call `/api/ultimate/...` to confirm reasoning metadata is echoed.
```
