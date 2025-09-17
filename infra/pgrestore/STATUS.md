# pgrestore Manual Job – Status

- **Scope:** emergency/manual restores only; never scheduled.
- **Image:** build from `infra/pgrestore/Dockerfile` when a restore is needed.
- **Env vars required:** `INSTANCE_CONN`, `DBNAME`, `DUMP_URI`, `PGPASSWORD` secret, optional `RESTORE_FLAGS`.
- **Runbook:** see `infra/pgrestore/RUNBOOK.md` for deploy + execute steps.
- **Current state:** ready (no active executions).
