# chook – opipe.ops forwarder

`chook` is a lightweight Cloud Run worker that tails the `opipe.ops` Redis stream and
re-emits events into the `opipe.chook` stream while logging immutable digests in
`opipe.audit`. It is designed to run inside the CoolBits VPC with Memorystore
access and no public ingress.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | ✅ | Redis connection URL (e.g. `redis://10.0.0.3:6379/0`). |
| `INPUT_STREAM` | ❌ | Source stream (default `opipe.ops`). |
| `OUTPUT_STREAM` | ❌ | Forward stream (default `opipe.chook`). |
| `AUDIT_STREAM` | ❌ | Audit log stream (default `opipe.audit`). |
| `CONSUMER_GROUP` | ❌ | Redis consumer group (default `chook`). |
| `CONSUMER_NAME` | ❌ | Override consumer name; defaults to hostname + pid. |
| `BLOCK_MS` | ❌ | Block timeout for `XREADGROUP` (default 5000). |
| `RETRY_DELAY` | ❌ | Delay before retrying after Redis errors (default 5s). |
| `REPLAY_PENDING` | ❌ | When truthy, drains pending entries on startup (default `true`). |

## Local run

```bash
export REDIS_URL="redis://localhost:6379/0"
python app.py
```

## Container build

```bash
PROJECT=coolbits-ai
REGION=europe-west3
IMG=europe-west3-docker.pkg.dev/$PROJECT/containers/chook:v1

gcloud builds submit --tag $IMG chook
```

Deploy to Cloud Run inside the VPC connector and provide the Memorystore URL:

```bash
gcloud run deploy chook \
  --image $IMG \
  --region $REGION \
  --set-env-vars REDIS_URL="redis://<memorystore-ip>:6379/0" \
  --min-instances 0 --cpu 1 --memory 256Mi \
  --no-allow-unauthenticated \
  --vpc-connector <connector> --egress-settings all-traffic
```

After deployment, inject an ops message and verify the downstream streams:

```bash
redis-cli -h <memorystore-ip> -p 6379 XADD opipe.ops * \
  agent @oCC channel opipe.ops audience internal severity info style plain \
  text "chook cloud alive"
redis-cli -h <memorystore-ip> -p 6379 XRANGE opipe.chook - + | tail -n 5
redis-cli -h <memorystore-ip> -p 6379 XRANGE opipe.audit - + | tail -n 5
```
```

Successful forwarding produces a mirrored entry in `opipe.chook` and an audit
record containing a SHA-256 hash of the original payload.
