# Andy Gateway Status

## Context (Cloud Shell)
```bash
PROJECT=coolbits-ai
REGION=europe-west3
SVC=andy-gateway
IMG=europe-west3-docker.pkg.dev/$PROJECT/containers/andy-gateway:v1

gcloud config set project $PROJECT
```

## Cloud (@oCC)
1. **Build image**
   ```bash
   gcloud builds submit --tag $IMG gateway
   ```
2. **Deploy Cloud Run** (min instances 0)
   ```bash
   gcloud run deploy $SVC \
     --image $IMG \
     --region $REGION \
     --platform managed \
     --port 8080 \
     --cpu 1 --memory 512Mi \
     --concurrency 80 \
     --min-instances 0 \
     --set-env-vars PYTHONUNBUFFERED=1,ENV=prod
   ```
3. **Smoke checks**
   ```bash
   curl -sS https://andy.coolbits.ai/openapi.json | head -n 20 || true
   curl -fsS https://andy.coolbits.ai/healthz || curl -fsS https://andy.coolbits.ai/readyz || true
   ```
4. **Logs & revision**
   ```bash
   gcloud run services describe $SVC --region $REGION --format='value(status.latestCreatedRevisionName)'
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SVC" --limit=50 --format='value(textPayload)'
   ```
5. **Ops message**
   ```json
   {
     "agent":"@oCC",
     "type":"deploy_result",
     "service":"andy-gateway",
     "state":"Healthy",
     "url":"https://andy.coolbits.ai",
     "rev":"<latestCreatedRevisionName>",
     "ts":"<utc>"
   }
   ```

## Local (@oCL)
- Update this file with smoke test results and revision.
- Run Docker Desktop build + `curl http://localhost:8080/openapi.json`.
- Ensure watchdog publishes heartbeats to `opipe.handshake` (Redis stream).

### Current blockers
- **Docker Desktop unavailable** → container smoke tests still pending.
- **FastAPI boot failure** → SQLAlchemy raises `InvalidRequestError` because more than one ORM model defines a column named `metadata`.

### Immediate local actions
1. Refactor the conflicting ORM columns to map the raw database field while keeping a distinct attribute, for example:
   ```python
   metadata = Column("metadata", JSON, key="metadata_json")
   ```
   Update all model references accordingly so the application stops shadowing SQLAlchemy's `metadata` attribute.
2. After the rename, rerun the local FastAPI server (`uvicorn gateway.main:app --reload`) and confirm the `/openapi.json` endpoint serves successfully.
3. Once the API boots, retry the Docker build/run sequence when Docker Desktop becomes available and document the results below.

## Status Snapshot
- Andy online: _pending_.
- Health endpoints: _pending_.
- Cost: Cloud Run `--min-instances 0` → idle cost low.

## Prompt @oCL — Roadmap pe pașii M
```
@oCL — Andy Gateway + Watchdog rollout (M1→M6)

M1 • Infra Backup (pgdump pipeline)
- Rulează `bash -n infra/pgdump/entrypoint.sh` la start de zi și notează statusul în `infra/pgdump/STATUS.md`.
- Confirmă cu @oCC când apare dump nou în GCS înainte de a cere GO pentru scheduler.

M2 • Andy Gateway (local sandbox)
- Pornește Docker Desktop, rulează `docker build -t andy-gateway:test infra/gateway`.
- `docker run --rm -p 8080:8080 andy-gateway:test` și `curl http://localhost:8080/openapi.json`.
- Documentează rezultatele și eventualele erori (inclusiv logs) în acest fișier.

M3 • Watchdog (Redis heartbeat)
- Conectează `scripts/watchdog_codex.py` la `redis://localhost:6379/opipe.handshake`.
- Verifică degradările automate conform politicii heartbeat (missed 2 → degraded, 5 → offline, recover note).
- Publică transcript scurt în `infra/watchdog/STATUS.md`.

M4 • Cloud pairing
- Sincronizează comenzi cu @oCC: `gcloud auth login office@coolbits.ai`, `gcloud config set project coolbits-ai`.
- Confirmă ce commit trebuie promovat înainte de handover.

M5 • Status & Observability
- Actualizează `infra/pgdump/STATUS.md` și `infra/gateway/STATUS.md` la fiecare handover (dimineață/prânz/seară).
- Trimite rezumat în `opipe.dev` cu state ready/degraded/blocked.

M6 • Greenlight
- După ce M1–M5 sunt verificate, confirmă cu @Andy că:
  • `https://andy.coolbits.ai/openapi.json` răspunde 200 și nu e gol.
  • `/healthz` sau `/readyz` răspunde 200.
  • Ops log conține mesaj `state:"Healthy"` pentru ultima revizie.
- Cerere explicită pentru resume scheduler: `gcloud scheduler jobs resume pgdump-nightly-schedule --location=europe-west3` (numai după GO).

Handover seara:
- Push branch-urile, atașează logurile relevante și marchează status final în `infra/pgdump/STATUS.md` + `infra/gateway/STATUS.md`.
- Notifică @oCC și @Andy despre blocaje sau permisiuni necesare.
```
