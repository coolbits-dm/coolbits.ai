# pgrestore (manual) – Runbook

## Overview
`pgrestore` is an **on-demand** Cloud Run job used only for manual recovery. It downloads a specific `dump-YYYYMMDD-HHMMSS.pgdump` archive from `gs://coolbits-ai-sql-backups-ew3` and restores it into the `coolbits_rag` database. Never attach it to a scheduler.

## Build image
```
gcloud builds submit \
  --tag europe-west3-docker.pkg.dev/coolbits-ai/containers/pgrestore:v16-<STAMP> \
  infra/pgrestore
```

## Deploy job
```
gcloud run jobs deploy pgrestore-manual \
  --image=europe-west3-docker.pkg.dev/coolbits-ai/containers/pgrestore:v16-<STAMP> \
  --region=europe-west3 \
  --service-account="$(gcloud projects describe coolbits-ai --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --set-cloudsql-instances="coolbits-ai:europe-west3:coolbits-rag-e" \
  --set-env-vars="INSTANCE_CONN=coolbits-ai:europe-west3:coolbits-rag-e,DBNAME=coolbits_rag" \
  --set-secrets="PGPASSWORD=postgres-password:latest" \
  --set-env-vars="RESTORE_FLAGS=--clean --if-exists --no-owner --no-privileges" \
  --tasks=1 --max-retries=1 --cpu=1 --memory=512Mi --task-timeout=3600s
```

## Execute manually
Provide the dump URI via `--set-env-vars` at execution time. Example:
```
gcloud run jobs execute pgrestore-manual \
  --region=europe-west3 \
  --wait \
  --set-env-vars=DUMP_URI=gs://coolbits-ai-sql-backups-ew3/dump-20250917-020001.pgdump
```

## Logs
```
gcloud logging read \
  'resource.type=cloud_run_job AND resource.labels.job_name=pgrestore-manual' \
  --limit=100 --format='value(textPayload)'
```

## Safeguards
- Double-check the target dump before running: confirm timestamp and origin.
- Pause all writers to the database prior to restore.
- After completion, re-enable application traffic and run smoke tests.
