# pgdump Pipeline Status Board

## Cost
- **Recurring:** low (Cloud Run job + GCS storage).
- **Scheduler:** paused (resume only after explicit GO from @Andy).

## Local (@oCL — sandbox)
- EntryPoint: ✅ fixed (`pg_dump` writes `.pgdump` and uploads to GCS).
- Job manifest (local): ✅ validated with `bash -n` and mock run.
- Restore job: ✅ split out under [`infra/pgrestore`](../pgrestore/) for manual use only.
- Watchdog: ✅ Python script emits `ready` / `degraded` / `offline` states.
- Gateway: ❌ blocked on Docker build (engine missing locally).
- **Next:** start Docker Desktop and re-run the `andy-gateway` container to verify it binds to `0.0.0.0:$PORT`.

## Cloud (@oCC — infra)
- Manifest: ✅ cleaned and committed (`pgdump` image requirements satisfied).
- Runbook: ✅ updated (`build`, `deploy`, `execute`, `verify`).
- Scheduler: ⏸️ paused (await manual dump + GO).
- **Next:**
  1. `gcloud builds submit … v16-fixed`
  2. `gcloud run jobs deploy pgdump-nightly`
  3. `gcloud run jobs execute … --wait`
  4. `gcloud storage ls …/dump-*.pgdump` to confirm a fresh artifact
  5. Resume `pgdump-nightly-schedule` once the new dump is verified.

## Risks
- Any automatic restore is already blocked (restore workflow lives separately).
- Keep scheduler disabled until a new GCS dump is confirmed.
- Database audit still pending after the three earlier restores.

## Timeline
- @oCL completed the local script + structure fixes.
- @oCC committed the corrected manifest.
- Pending: cloud build/run confirmation and GCS verification.
- 2025-09-17: @oCodexCloud acknowledged current status; scheduler remains paused awaiting explicit GO.
