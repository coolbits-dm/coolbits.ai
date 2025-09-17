# chook (Redis forwarder) – Status & Deployment Guide

## Cloud (@oCC)
```bash
PROJECT=coolbits-ai
REGION=europe-west3
IMG=europe-west3-docker.pkg.dev/$PROJECT/containers/chook:v1
MEMO_URL="redis://<memorystore-ip>:6379/0"
VPC="<vpc-connector>"

gcloud config set project $PROJECT
```

1. **Build & push**
   ```bash
   gcloud builds submit --tag $IMG chook
   ```
2. **Deploy Cloud Run** (private ingress, VPC egress)
   ```bash
   gcloud run deploy chook \
     --image $IMG \
     --region $REGION \
     --set-env-vars REDIS_URL="$MEMO_URL" \
     --min-instances 0 --cpu 1 --memory 256Mi \
     --no-allow-unauthenticated \
     --vpc-connector $VPC --egress-settings all-traffic
   ```
3. **Smoke test (same VPC)**
   ```bash
   redis-cli -h <memorystore-ip> -p 6379 XADD opipe.ops * \
     agent @oCC channel opipe.ops audience internal severity info style plain \
     text "chook cloud alive"
   redis-cli -h <memorystore-ip> -p 6379 XRANGE opipe.chook - + | tail -n 5
   redis-cli -h <memorystore-ip> -p 6379 XRANGE opipe.audit - + | tail -n 5
   ```
4. **STATUS update** – record in this file:
   - ✅ `chook@CloudRun` live (revision + UTC timestamp)
   - ✅ Connected to Memorystore (IP + VPC connector)
   - ✅ `opipe.ops → opipe.chook` forwarding OK
   - ✅ Audit hash present in `opipe.audit`

## Local (@oCL)
- Run `python chook/app.py` against a local Redis to validate forwarding.
- Confirm audit entries emit SHA-256 digests.
- Document test payloads and observed outputs.

## Notes
- The worker replays pending entries on startup to avoid message loss.
- Forwarding augments payloads with `source_id`, `source_stream`, and `forwarded_ts` fields.
- Audit entries contain `hash`, `hash_algo`, `source_id`, `source_stream`, and optional `agent`.
