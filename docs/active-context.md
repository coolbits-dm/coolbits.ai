# ActiveContext

ActiveContext is the backend-confirmed source of truth for agent, model, provider, and billing selection.
No LLM request should execute unless an ActiveContext is active.

## Shape

```
{
  contextId: "ctx_...",
  userId,
  workspace: "cbB|cbA|cbD|cbP|custom",
  agentId: "cbAgent-...",
  role: "CEO|CTO|...",
  defaultName: "...",
  customName: "...",      // optional
  provider: "openai|anthropic|google|xai|deepseek|auto",
  model: "vertex-gemini-2.5-pro|openai-gpt-4.1|...",
  billingSource: "coolbits|byok",
  status: "active|pending|error",
  error: null|{ code, message },
  confirmedAt: ISOString
}
```

## API

- `GET /api/context/active`
  - Auth required.
  - Returns `{ ok: true, context: ActiveContext | null }`.

- `POST /api/context/activate`
  - Auth required.
  - Body: `{ workspace, agentId, provider, model, billingSource, customName?, byokKeyPresent?, byokKeyLast4? }`.
  - Validates agentId and billing; resolves provider/model defaults; stores in memory.
  - Returns `{ ok: true, context }` or `{ ok: false, error }`.

## Flow

1. Frontend sets status `pending` when a selection changes (agent/provider/model/billing).
2. `POST /api/context/activate` returns a confirmed ActiveContext.
3. UI updates status to `active` or `error`.
4. LLM requests check ActiveContext and include `contextId` in usage metadata.

## Notes

- ActiveContext is stored in memory per user for now (TODO: persist).
- Provider/model values are normalized to internal registry defaults.
- Billing source `byok` requires a present key flag; `coolbits` uses plan eligibility.
