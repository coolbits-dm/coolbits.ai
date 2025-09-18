# CoolBits.ai Operations Runbook

## Project Context
- **Google Cloud Project**: `coolbits-ai`
- **Region**: `europe-west3`
- **Automation Service Account**: `o-runner@coolbits-ai.iam.gserviceaccount.com`
- **GitHub Repository**: `coolbits-dm/coolbits.ai`

This document captures the exact pairing steps @oCL and @oCC must follow to provision Workload Identity Federation (WIF), publish the reusable `oCL Exec` GitHub Actions workflow, expose the Cloud Tasks handler in Andy Gateway, and verify the end-to-end dispatch.

---

## 1. Cloud Shell setup (message for @oCL)
Run the block below exactly once from an authenticated Cloud Shell session on the `coolbits-ai` project. It is idempotent; repeated executions keep existing resources in place. Save the final `POOL=`, `PROVIDER=`, and `SA=` lines—they are needed in GitHub.

```bash
# ==== SETUP WIF + SERVICE ACCOUNT pentru GitHub Actions ====
set -euo pipefail

PROJECT="coolbits-ai"
REGION="europe-west3"
SA_ID="o-runner"
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
POOL_ID="gh-pool"
PROVIDER_ID="gh-provider"
REPO="coolbits-dm/coolbits.ai"

gcloud config set project "$PROJECT"

# 1) Service Account (dacă există, ignorăm eroarea)
gcloud iam service-accounts create "$SA_ID" --display-name="oRunner (GitHub Actions)" || true

# 2) Roluri minime pentru Cloud Tasks + Cloud Run invoker + IAP accessor
for ROLE in roles/cloudtasks.enqueuer roles/run.invoker roles/iap.httpsResourceAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" || true
done

# 3) Workload Identity Federation (pool + provider OIDC pentru GitHub)
gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" --display-name="GitHub OIDC Pool" || true

POOL_FULL="projects/$(gcloud projects describe $PROJECT --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_ID}"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com" || true

PROVIDER_FULL="${POOL_FULL}/providers/${PROVIDER_ID}"

# 4) Permite repo-ului să imperson-eze SA-ul fără chei
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_FULL}/attribute.repository/${REPO}"

echo "POOL=${POOL_FULL}"
echo "PROVIDER=${PROVIDER_FULL}"
echo "SA=${SA_EMAIL}"
```

Output-ul final trebuie să listeze clar `PROVIDER=` și `SA=`. Dacă lipsesc, corectează erorile înainte de a merge mai departe.

### 1.1 Verificare & remediere WIF (mesaj pentru @oCL)
Ori de câte ori pairing-ul eșuează în Actions, rulează blocul de mai jos în Cloud Shell pentru a confirma că binding-urile WIF și rolurile proiectului sunt încă valide. Nu sări peste pași: dacă un pas raportează o eroare, repar-o și relansează blocul complet până când output-ul se încheie cu `DONE_WIF=OK`.

```bash
# ==== VERIFY & FIX WIF BINDINGS (Cloud Shell) ====
set -euo pipefail
PROJECT="coolbits-ai"
SA_EMAIL="o-runner@${PROJECT}.iam.gserviceaccount.com"
POOL_ID="gh-pool"
PROVIDER_ID="gh-provider"
REPO="coolbits-dm/coolbits.ai"

gcloud config set project "$PROJECT" >/dev/null

# 0) Afișează providerul și copiază EXACT valoarea PROVIDER= pentru @oCC
POOL_FULL="projects/$(gcloud projects describe $PROJECT --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_ID}"
PROVIDER_FULL="${POOL_FULL}/providers/${PROVIDER_ID}"
echo "PROVIDER=${PROVIDER_FULL}"
echo "SA=${SA_EMAIL}"

# 1) Verifică politica SA: trebuie să vezi principalSet cu attribute.repository/coolbits-dm/coolbits.ai
gcloud iam service-accounts get-iam-policy "$SA_EMAIL" \
  --format="yaml(bindings)"

# 2) Dacă NU vezi principalSet://.../attribute.repository/coolbits-dm/coolbits.ai, rulează:
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_FULL}/attribute.repository/${REPO}"

# 3) Dă rolurile minime la SA (idempotent). Asta se face la nivel de proiect de către tine, nu de către workflow.
for ROLE in roles/cloudtasks.enqueuer roles/run.invoker roles/iap.httpsResourceAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" --role="$ROLE" || true
done

# 4) Confirmă că există queue-ul (nu creează, doar verifică regiunea)
gcloud tasks queues list --location=europe-west3 --format="table(name,state)"

echo "DONE_WIF=OK"
```

Output-ul trebuie să includă binding-ul `principalSet://iam.googleapis.com/.../attribute.repository/coolbits-dm/coolbits.ai` la pasul 1 și mesajul final `DONE_WIF=OK`. Fără acești pași, GitHub Actions nu se poate autentifica prin WIF.

---

## 2. GitHub secrets & workflow scaffolding (message for @oCC)
1. În repo-ul `coolbits-dm/coolbits.ai`, setează secretele GitHub:
   - `GCP_WIF_PROVIDER` = valoarea `PROVIDER=` primită de la @oCL.
   - `GCP_SA_EMAIL` = `o-runner@coolbits-ai.iam.gserviceaccount.com`.
2. Creează fișierul `.github/workflows/oclexec.yml` cu **exact** conținutul de mai jos, apoi commit & push:

```yaml
name: oCL Exec

on:
  workflow_dispatch:
    inputs:
      region:
        description: "GCP region"
        required: true
        default: "europe-west3"
      action:
        description: "Action name"
        required: true
        default: "iam-queue-invoker"
      args:
        description: "Extra args (optional)"
        required: false
        default: ""

permissions:
  id-token: write
  contents: read

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v2
        with:
          project_id: coolbits-ai
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}   # ex: projects/123/locations/global/workloadIdentityPools/gh-pool/providers/gh-provider
          service_account: ${{ secrets.GCP_SA_EMAIL }}                  # ex: o-runner@coolbits-ai.iam.gserviceaccount.com

      - name: gcloud version
        run: gcloud version

      - name: Install Cloud Tasks client
        run: python3 -m pip install --upgrade google-cloud-tasks

      - name: Execute requested action
        env:
          REGION: ${{ github.event.inputs.region }}
          ACTION: ${{ github.event.inputs.action }}
          ARGS:   ${{ github.event.inputs.args }}
        run: |
          set -euo pipefail
          echo "Action: $ACTION | Region: $REGION | Args: $ARGS"

          case "$ACTION" in
            iam-queue-invoker)
              PROJECT="coolbits-ai"
              SA="o-runner@${PROJECT}.iam.gserviceaccount.com"
              SVC="andy-gateway"

              echo "[IAM] grant roles to SA on project"
              for ROLE in roles/cloudtasks.enqueuer roles/run.invoker roles/iap.httpsResourceAccessor; do
                gcloud projects add-iam-policy-binding "$PROJECT" \
                  --member="serviceAccount:${SA}" --role="$ROLE" || true
              done

              echo "[Run] add invoker on service"
              gcloud run services add-iam-policy-binding "$SVC" \
                --region="$REGION" \
                --member="serviceAccount:${SA}" \
                --role="roles/run.invoker" || true
              ;;

            create-queue)
              PROJECT="coolbits-ai"
              QUEUE="${ARGS:-ogpt-default-queue}"
              echo "[Tasks] ensure queue '$QUEUE' in $REGION"
              gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT" \
                || gcloud tasks queues create "$QUEUE" --location="$REGION" --project="$PROJECT"
              gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT" \
                --format="yaml(name,state,rateLimits,retryConfig)"
              ;;

            ping-task)
              PROJECT="coolbits-ai"
              QUEUE="${ARGS:-ogpt-default-queue}"

              BASE_URL=$(gcloud run services describe andy-gateway --region="$REGION" --project="$PROJECT" --format="value(status.url)")
              TASK_URL="${BASE_URL}/api/v1/task-hook"
              echo "[Create Task] $QUEUE -> $TASK_URL"

              cat > ping_task.py <<'PY'
import os, json
from google.cloud import tasks_v2

project = "coolbits-ai"
region  = os.environ["REGION"]
queue   = os.environ.get("QUEUE", "ogpt-default-queue")
url     = os.environ["TASK_URL"]
aud     = os.environ["TASK_AUD"]
sa      = os.environ["TASK_SA"]

client = tasks_v2.CloudTasksClient()
parent = client.queue_path(project, region, queue)

payload = {"job": "ping", "args": {"x": 1}}
task = {
  "http_request": {
    "http_method": tasks_v2.HttpMethod.POST,
    "url": url,
    "headers": {"Content-Type": "application/json"},
    "body": json.dumps(payload).encode("utf-8"),
    "oidc_token": {
      "service_account_email": sa,
      "audience": aud
    }
  }
}
resp = client.create_task(request={"parent": parent, "task": task})
print(resp.name)
PY
              REGION="$REGION" QUEUE="$QUEUE" TASK_URL="$TASK_URL" TASK_AUD="$BASE_URL" TASK_SA="o-runner@coolbits-ai.iam.gserviceaccount.com" python3 ping_task.py
              ;;

            *)
              echo "Unknown action: $ACTION" >&2
              exit 2
              ;;
          esac
```

3. După commit, confirmă că workflow-ul apare în tab-ul **Actions**.

---

## 3. Andy Gateway task hook (message for @oCC)
Implement the Cloud Tasks handler and ensure Gunicorn binds to the runtime-provided `$PORT`. Place the files below under `andy-src/` (create directories as needed) and commit with `feat(gateway): add /api/v1/task-hook + fix gunicorn bind`.

`andy-src/app/routers/tasks.py`
```python
from fastapi import APIRouter, Request, Response, status
import json, logging

router = APIRouter()

@router.post("/api/v1/task-hook")
async def task_hook(request: Request):
    try:
        body = await request.body()
        payload = json.loads(body.decode("utf-8") or "{}")
        logging.info("TASK PAYLOAD %s", payload)
    except Exception:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)
    # răspunde rapid 2xx; munca grea se face async altundeva
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

`andy-src/app/main.py`
```python
from fastapi import FastAPI
from app.routers import tasks

app = FastAPI()
app.include_router(tasks.router)
```

`andy-src/app/routers/__init__.py`
```python
from . import tasks

__all__ = ["tasks"]
```

`andy-src/Dockerfile`
```dockerfile
# Example production image for Andy Gateway
FROM python:3.11-slim

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

CMD ["gunicorn","-w","2","-k","uvicorn.workers.UvicornWorker","app.main:app","--bind","0.0.0.0:$PORT"]
```

`andy-src/requirements.txt`
```
fastapi==0.111.0
uvicorn[standard]==0.30.1
gunicorn==22.0.0
```

Redeploy Andy Gateway via the existing deployment workflow (or manually with `gcloud run deploy`) so the `/api/v1/task-hook` route becomes available.

---

## 4. Dispatch order & evidence (message for @oCC)
1. În GitHub → **Actions → oCL Exec → Run workflow** folosește `region=europe-west3` și rulează acțiunile în ordinea exactă:
   1. `action=iam-queue-invoker`
   2. `action=create-queue`, `args=ogpt-default-queue`
   3. `action=ping-task`
2. După fiecare rulare:
   - Salvează URL-ul rundei GitHub Actions.
   - Capturează ieșirea `gcloud tasks queues describe` și numele task-ului creat.
   - Extrage un snippet din logurile Cloud Run (`gcloud run logs read --service andy-gateway --region europe-west3 --limit 50`) care arată că `/api/v1/task-hook` a răspuns 204.
3. Dacă `ping-task` nu returnează un nume de task, problema este la endpoint (404/401), nu la IAM. Repară ruta, redeployează Andy Gateway și repetă doar pasul `ping-task`.

---

## 5. Troubleshooting checklist
- Verifică `gcloud tasks queues describe` pentru stări `DISABLED` sau rate limits restrictive înainte de rerulare.
- Dacă Andy Gateway este în spatele IAP, setează `TASK_AUD` cu URL-ul IAP sau semnează un JWT corespunzător.
- Confirmă că `google-cloud-tasks` este instalat și că `gcloud` raportează versiunea corectă în logurile workflow-ului.
- 401 la hook indică lipsă de `run.invoker` pe serviciu pentru `o-runner@coolbits-ai.iam.gserviceaccount.com`.
- 404 la hook indică faptul că `/api/v1/task-hook` nu este montat sau că aplicația nu rulează cu FastAPI routerul înregistrat.

Respectă această ordine fără improvizații pentru ca pairing-ul @oCC ↔ @oCL să rămână auditat și repetabil.
