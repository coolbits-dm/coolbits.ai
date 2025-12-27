# CoolBits Object Spec (v1 draft)

## Run
A Run is a deterministic unit of work: objective + scope + constraints -> dry-run diff -> commit -> measured impact.

**Fields**
- `runId` (string, ULID/UUID)
- `traceId` (string) - stable idempotency anchor across retries
- `workspaceId` (string)
- `createdAt` (iso8601)
- `createdBy` (string userId/service)
- `status` (RunStatus)
- `reason` (RoutingReason | RunFailureReason | null)
- `objective` (string)
- `requested` (RequestedContext)
- `resolved` (ResolvedContext | null)
- `scope` (RunScope)
- `policyId` (string | null)
- `payloadIds` (string[]) - attached payload artifacts (.cbpl)
- `plan` (RunPlan | null)
- `dryRun` (DryRunResult | null)
- `commit` (CommitResult | null)
- `usage` (UsageSummary | null) - **final only** (`isEstimate=false`)
- `walletDelta` (WalletDelta | null) - written only on final
- `artifacts` (RunArtifacts)

## RunEvent
Append-only event for UI timeline, analytics, and replay.

**Fields**
- `eventId` (string)
- `runId` (string)
- `traceId` (string)
- `seq` (int) - monotonic per run
- `ts` (iso8601)
- `type` (RunEventType)
- `status` (RunStatus | null)
- `reason` (RoutingReason | RunFailureReason | null)
- `message` (string | null)
- `usageDelta` (UsageDelta | null) - can be estimate (`isEstimate=true`)
- `tool` (ToolCallEvent | null)
- `diff` (DiffEvent | null)

## Policy
Policy-as-code: constraints and approvals that gate execution.

**Fields**
- `policyId` (string)
- `name` (string)
- `version` (string)
- `enabled` (bool)
- `scopes` (string[]) - e.g. `googleads:read`, `googleads:write`, `ga4:read`
- `spendCaps` (SpendCaps)
- `approvals` (ApprovalRules)
- `riskThresholds` (RiskThresholds)
- `routingPrefs` (RoutingPreferences)
- `limits` (ExecutionLimits)

## Playbook
Versioned procedure that produces a Run plan (and optionally a payload artifact).

**Fields**
- `playbookId` (string)
- `name` (string)
- `version` (string)
- `description` (string)
- `category` (string) - e.g. `googleads`, `ga4`, `cross`
- `inputSchema` (json-schema-like object)
- `steps` (PlaybookStep[])
- `gates` (Gate[])
- `kpis` (KpiSpec[])
- `outputs` (OutputSpec[])

---

## Enums

### RunStatus
- `queued`
- `planning`
- `dry_run`
- `awaiting_approval`
- `executing`
- `committed`
- `completed`
- `failed`
- `canceled`

### RoutingReason (closed taxonomy; unknown -> `fallback_error`)
- `direct`
- `fallback_rate_limit`
- `fallback_provider_down`
- `fallback_policy_block`
- `fallback_budget_cap`
- `fallback_error`

### RunFailureReason (examples; keep closed)
- `tool_error`
- `validation_failed`
- `policy_blocked`
- `provider_error`
- `timeout`
- `unknown_error`

### RunEventType (minimal set)
- `run.created`
- `run.status`
- `routing.resolved`
- `usage.update` (SSE; can be estimate)
- `tool.call.started`
- `tool.call.completed`
- `diff.proposed`
- `approval.required`
- `approval.granted`
- `commit.started`
- `commit.completed`
- `ledger.debit` (final only)
- `wallet.update` (final only)
- `run.completed`
- `run.failed`

### AvailabilityStatus (UI parity surfaces)
- `available`
- `unavailable`
- `partial`
- `unknown`

---

## CoolBits Payload (.cbpl)
Canonical payload artifact. The versioned schema reference is `docs/cbpl.schema.v1.json`.

### File format (v1)
- Header: `CBPL\0` + `v1` (binary prefix)
- Body: canonical JSON (UTF-8, sorted keys)
- Hash: computed over canonical JSON with `hash`, `signature`, `name`, `description` omitted

### Body fields (v1)
- `schemaVersion` (string, `cbpl.v1`)
- `kind` (`selection` | `snapshot_ref` | `dryrun` | `commit_intent`)
- `workspaceId` (string)
- `createdAt` (iso8601)
- `createdBy` (string)
- `selection` (SelectionState)
- `payload` (object) - widget-specific request spec
- `availability` (map field -> { status, note? })
- `hash` (string)
- `signature` (object | null)

### SelectionState (current UI mapping)
Mirrors the selection objects built in `public/assets/chat.js` for GA4 and Google Ads.

**Fields**
- `workspaceId` (string)
- `connector` (`ga4` | `googleads` | `mixed`)
- `ga4` (object | null)
  - `propertyId` (string | null)
  - `from` (YYYY-MM-DD)
  - `to` (YYYY-MM-DD)
  - `blocks` (string[])
  - `compareMode` (`none` | `previous_period` | `previous_year` | `custom`)
  - `compareFrom` (YYYY-MM-DD | null)
  - `compareTo` (YYYY-MM-DD | null)
- `googleads` (object | null)
  - `customerId` (string | null)
  - `loginCustomerId` (string | null)
  - `from` (YYYY-MM-DD)
  - `to` (YYYY-MM-DD)
  - `blocks` (string[])
  - `compareMode` (`none` | `previous_period` | `previous_year` | `custom`)
  - `compareFrom` (YYYY-MM-DD | null)
  - `compareTo` (YYYY-MM-DD | null)
