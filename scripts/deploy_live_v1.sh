#!/usr/bin/env bash
set -euo pipefail

LIVE_ROOT="${LIVE_ROOT:-/opt/coolbits.ai}"
DEV_ROOT="${DEV_ROOT:-/home/cblm/dev/coolbits-backend}"
UNIT="${UNIT:-pm2-cblm.service}"
FORCE="${FORCE:-0}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8788/healthz}"
HEALTH_RETRIES="${HEALTH_RETRIES:-40}"
HEALTH_SLEEP="${HEALTH_SLEEP:-0.5}"
SMOKE_SCRIPT="${SMOKE_SCRIPT:-$LIVE_ROOT/scripts/smoke_v1.sh}"

cd "$DEV_ROOT"

DIRTY_LINES="$(git status --porcelain)"
if [[ -n "$DIRTY_LINES" && "$FORCE" != "1" ]]; then
  echo "ERROR: dev tree is dirty. Commit or stash before deploy. Set FORCE=1 to override."
  git status -sb
  exit 2
fi

PREDEPLOY_CHECK="${PREDEPLOY_CHECK:-$HOME/audit/scripts/predeploy-check.sh}"
if [[ ! -x "$PREDEPLOY_CHECK" ]]; then
  PREDEPLOY_CHECK="$DEV_ROOT/scripts/predeploy-check.sh"
fi
if [[ -x "$PREDEPLOY_CHECK" ]]; then
  echo "Running predeploy guardrail: $PREDEPLOY_CHECK"
  "$PREDEPLOY_CHECK"
else
  echo "ERROR: predeploy guardrail not found. Set PREDEPLOY_CHECK or install ~/audit/scripts/predeploy-check.sh"
  exit 2
fi

SHA="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOYER="$(whoami)"
DIRTY="0"
DIRTY_FILES="0"
if [[ -n "$DIRTY_LINES" ]]; then
  DIRTY="1"
  DIRTY_FILES="$(printf "%s" "$DIRTY_LINES" | wc -l | tr -d ' ')"
fi

echo "Deploying $SHA ($BRANCH) -> $LIVE_ROOT at $TS"

rsync -av --delete \
  --exclude '.env' --exclude 'var/' --exclude 'node_modules/' --exclude '.git/' \
  "$DEV_ROOT/app/server/" "$LIVE_ROOT/app/server/"

rsync -av --delete \
  --exclude '.env' --exclude 'var/' --exclude 'node_modules/' --exclude '.git/' \
  "$DEV_ROOT/scripts/" "$LIVE_ROOT/scripts/"

LIVE_PUBLIC="$LIVE_ROOT/public"
if [[ -d "$LIVE_PUBLIC" ]]; then
  mkdir -p "$LIVE_PUBLIC"
  rsync -av --delete \
    --exclude '.env' --exclude 'var/' --exclude 'node_modules/' --exclude '.git/' \
    "$DEV_ROOT/public/" "$LIVE_PUBLIC/"
fi

PLACEHOLDER="__UI_BUILD_SHA__"
UI_TARGET="$LIVE_PUBLIC/chat.html"
if [[ -f "$UI_TARGET" ]]; then
  if grep -q "$PLACEHOLDER" "$UI_TARGET"; then
    sed -i "s/${PLACEHOLDER}/${SHA}/g" "$UI_TARGET"
    echo "Stamped UI build SHA in $UI_TARGET"
  else
    echo "WARN: UI build placeholder not found in $UI_TARGET"
  fi
fi

echo "Writing build_commit marker"
sudo mkdir -p "$LIVE_ROOT/var"
cat <<MARK | sudo tee "$LIVE_ROOT/var/build_commit" >/dev/null
sha=$SHA
branch=$BRANCH
utc=$TS
deployer=$DEPLOYER
dirty=$DIRTY
dirty_files=$DIRTY_FILES
MARK

echo "Restarting $UNIT"
sudo systemctl restart "$UNIT"

echo "Health check"
ok=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    ok=1
    break
  fi
  sleep "$HEALTH_SLEEP"
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: health check failed after ${HEALTH_RETRIES}s"
  exit 3
fi
echo "OK"

if [[ -x "$SMOKE_SCRIPT" ]]; then
  echo "Running smoke..."
  if [[ -z "${AUTH_BEARER:-}" && -z "${COOKIE:-}" ]]; then
    echo "WARN: AUTH_BEARER/COOKIE not set; running public smoke (/healthz) only."
    curl -fsS "$HEALTH_URL" >/dev/null
  else
    set +e
    "$SMOKE_SCRIPT"
    RC=$?
    set -e
    if [[ $RC -ne 0 ]]; then
      echo "ERROR: smoke failed (rc=$RC)"
      exit $RC
    fi
  fi
else
  echo "WARN: smoke script not found/executable at $SMOKE_SCRIPT"
fi

echo "DEPLOY OK"
