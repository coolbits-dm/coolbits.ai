# pgdump-nightly (Postgres 16) – Runbook

## Build image
gcloud builds submit --tag europe-west3-docker.pkg.dev/coolbits-ai/containers/pgdump:v16-<STAMP> infra/pgdump

## Deploy job
gcloud run jobs deploy pgdump-nightly \
  --image=europe-west3-docker.pkg.dev/coolbits-ai/containers/pgdump:v16-<STAMP> \
  --region=europe-west3 \
  --service-account="$(gcloud projects describe coolbits-ai --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --set-cloudsql-instances="coolbits-ai:europe-west3:coolbits-rag-e" \
  --set-env-vars="INSTANCE_CONN=coolbits-ai:europe-west3:coolbits-rag-e,DBNAME=coolbits_rag,BUCKET=gs://coolbits-ai-sql-backups-ew3" \
  --set-secrets="PGPASSWORD=postgres-password:latest" \
  --tasks=1 --max-retries=3 --cpu=1 --memory=512Mi --task-timeout=3600s

## Execute once
gcloud run jobs execute pgdump-nightly --region=europe-west3 --wait

## Logs
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=pgdump-nightly' --limit=100 --format='value(textPayload)'

## GCS check
gcloud storage ls gs://coolbits-ai-sql-backups-ew3/dump-*.pgdump | tail -n 5

## Scheduler (02:00 UTC daily)
job: pgdump-nightly-schedule
