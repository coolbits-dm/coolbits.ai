# Council Fibonacci Model (canonical)

Status: canonical reference for all council/orb clients (chat, console, future iOS/VR).

## Core primitives
- Axes: `cbA`, `cbB`, `cbD`, `cbP`
- Fibonacci levels: first 22 numbers (`FIB_LEVELS`) used as depth buckets.
- Helpers (single source): `app/server/services/councilFib.js`
  - `FIB_LEVELS`
  - `fibBucket(x)`
  - `computeAxisScore(metrics)`
  - `normalizeOrbState(councilState)`
  - `buildCanonicalCouncilAxisState(workspaceMode, overrides)`
  - `decideCouncilTier(levelTotal)` → `shallow | standard | deep | max`

## Billing summary contract (invariant)
`GET /api/billing/summary` includes:
```
workspace_mode: 'cbA' | 'cbB' | 'cbD' | 'cbP'
council: {
  by_axis: {
    cbA: { ready, pressure },
    cbB: { ready, pressure },
    cbD: { ready, pressure },
    cbP: { ready, pressure }
  },
  fib: {
    level_total: 1..22,
    level_by_axis: { cbA, cbB, cbD, cbP }, // each 1..22
    totals_by_axis: { cbA, cbB, cbD, cbP }
  }
}
```
Zeros are allowed; structure must always be present.

## Orchestrator gating (next to wire)
- Compute tier once per run: `const tier = decideCouncilTier(council.fib.level_total)`.
- Gate:
  - `selectAgentsForTier(tier)`
  - `selectModelForTier(tier)`
  - `selectTokenCapForTier(tier)`
- Use the same helpers for any council run (chat or other clients).

## Console / integrations summary (alignment)
- Reuse `buildCanonicalCouncilAxisState` to expose the same `by_axis` + `fib` for `/integrations/summary`, so console/orb reads identical gravity as chat.

## Logging per run (prep for cost/insights)
Log after each council run:
```
{
  workspace_id,
  tier,
  fib_level_total,
  fib_level_by_axis,
  tokens_total,
  tokens_by_agent,
  model_used,
  ts
}
```
Schema suggestion: table `council_runs` with the fields above.

## Invariant
One ruler, one module: **only** import from `app/server/services/councilFib.js`.
No local Fibonacci copies in other files. All UI/clients consume the same `by_axis + fib` block; visuals are just skins over this core.
