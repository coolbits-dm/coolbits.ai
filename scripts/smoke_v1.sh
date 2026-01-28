#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8788}"
WORKSPACE_EXPECTED="${WORKSPACE_EXPECTED:-business}"
OUT_DIR="${OUT_DIR:-}"
COOKIE="${COOKIE:-}"
AUTH_BEARER="${AUTH_BEARER:-}"
PSQL_DSN="${PSQL_DSN:-}"
TENANT_WORKSPACE="${TENANT_WORKSPACE:-}"
REAL_GUARDRAIL_CHECK="${REAL_GUARDRAIL_CHECK:-}"
REAL_MODE="${REAL_MODE:-}"
USE_REAL_VERTEX="${USE_REAL_VERTEX:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$ROOT_DIR/var/smoke"
fi
mkdir -p "$OUT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/smoke.$TS.json"

HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi
HAS_PSQL=0
if command -v psql >/dev/null 2>&1; then
  HAS_PSQL=1
fi

if [[ -n "$AUTH_BEARER" && "$AUTH_BEARER" != Bearer* ]]; then
  AUTH_BEARER="Bearer $AUTH_BEARER"
fi

AUTH_ARGS=()
if [[ -n "$AUTH_BEARER" ]]; then
  AUTH_ARGS+=(-H "Authorization: $AUTH_BEARER")
fi
if [[ -n "$COOKIE" ]]; then
  AUTH_ARGS+=(-H "Cookie: $COOKIE")
fi
if [[ ${#AUTH_ARGS[@]} -eq 0 ]]; then
  echo "[FAIL] auth: set AUTH_BEARER or COOKIE"
  exit 1
fi

declare -A STEP_STATUS
declare -A STEP_DETAIL
FAILED=0
SKIPPED=0
REAL_MODE_ACTIVE=0

is_true() {
  case "$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if is_true "$REAL_MODE"; then
  REAL_MODE_ACTIVE=1
elif is_true "$USE_REAL_VERTEX"; then
  REAL_MODE_ACTIVE=1
fi

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

set_step() {
  local name="$1"
  local status="$2"
  local detail="${3:-}"
  STEP_STATUS["$name"]="$status"
  STEP_DETAIL["$name"]="$detail"
  if [[ "$status" == "fail" ]]; then
    FAILED=1
  elif [[ "$status" == "skipped" ]]; then
    SKIPPED=1
  fi
}

HTTP_STATUS=""
HTTP_BODY=""
http_request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local use_auth="${4:-1}"
  local tmp
  tmp="$(mktemp)"
  local status rc
  local -a args
  args=(-sS -o "$tmp" -w "%{http_code}" -X "$method")
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  if [[ "$use_auth" -eq 1 ]]; then
    args+=("${AUTH_ARGS[@]}")
  fi
  set +e
  status="$(curl "${args[@]}" "$url")"
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    HTTP_STATUS="000"
    HTTP_BODY=""
    rm -f "$tmp"
    return 0
  fi
  HTTP_STATUS="$status"
  HTTP_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

json_get() {
  local key="$1"
  local input="$2"
  if [[ "$key" == *.* ]]; then
    json_get_path "$key" "$input"
    return
  fi
  if [[ "$HAS_JQ" -eq 1 ]]; then
    echo "$input" | jq -r --arg k "$key" '.[$k] // empty'
    return
  fi
  echo "$input" | sed -n 's/.*"'"$key"'":"\([^"]*\)".*/\1/p' | head -n1
}

json_get_path() {
  local path="$1"
  local input="$2"
  if [[ "$HAS_JQ" -eq 1 ]]; then
    echo "$input" | jq -r --arg p "$path" 'getpath($p|split(".")) // empty'
    return
  fi
  # Fallback: best-effort lookup by key name at any depth.
  local key="${path##*.}"
  echo "$input" | sed -n 's/.*"'"$key"'":"\([^"]*\)".*/\1/p' | head -n1
}

step_print() {
  local name="$1"
  local status="${STEP_STATUS[$name]:-skipped}"
  local detail="${STEP_DETAIL[$name]:-}"
  local label="SKIPPED"
  if [[ "$status" == "pass" ]]; then
    label="PASS"
  elif [[ "$status" == "fail" ]]; then
    label="FAIL"
  fi
  if [[ -n "$detail" ]]; then
    printf '[%s] %s - %s\n' "$label" "$name" "$detail"
  else
    printf '[%s] %s\n' "$label" "$name"
  fi
}

STEP_ORDER=(
  health
  auth_gate
  create_run
  run_workspace_db
  append_event
  concurrency_http
  concurrency_db
  snapshot_http
  snapshot_db
  snapshot_file
  llm_http
  llm_events
  real_guardrail
  tenant_isolation
)

RUN_ID=""
ARTIFACT_ID=""
SNAPSHOT_URI=""
SNAPSHOT_SHA=""
INPUT_HASH=""
OUTPUT_HASH=""
LLM_SKIPPED=0

# /health
http_request GET "$BASE_URL/health" "" 0
if [[ "$HTTP_STATUS" == "200" ]]; then
  set_step health pass "200"
else
  set_step health fail "expected 200, got $HTTP_STATUS"
fi

# Auth gate
http_request POST "$BASE_URL/api/runs" '{"title":"smoke auth gate","clientId":null}' 0
if [[ "$HTTP_STATUS" == "401" ]]; then
  set_step auth_gate pass "401"
else
  set_step auth_gate fail "expected 401, got $HTTP_STATUS"
fi

# Create run
http_request POST "$BASE_URL/api/runs" "{\"title\":\"smoke v1\",\"clientId\":null,\"workspaceId\":\"agency\"}"
if [[ "$HTTP_STATUS" == "200" ]]; then
  RUN_ID="$(json_get runId "$HTTP_BODY")"
  if [[ -n "$RUN_ID" ]]; then
    set_step create_run pass "runId=$RUN_ID"
  else
    set_step create_run fail "missing runId"
  fi
else
  set_step create_run fail "expected 200, got $HTTP_STATUS"
fi

# Run workspace DB check
if [[ -n "$RUN_ID" && -n "$PSQL_DSN" && "$HAS_PSQL" -eq 1 ]]; then
  row="$(psql "$PSQL_DSN" -At -F',' -c "select workspace_id from runs where id='$RUN_ID';" 2>/dev/null || true)"
  if [[ -z "$row" ]]; then
    set_step run_workspace_db fail "no row for run"
  elif [[ "$row" == "$WORKSPACE_EXPECTED" ]]; then
    set_step run_workspace_db pass "$row"
  else
    set_step run_workspace_db fail "expected $WORKSPACE_EXPECTED, got $row"
  fi
else
  set_step run_workspace_db skipped "PSQL_DSN not set"
fi

# Append event
if [[ -n "$RUN_ID" ]]; then
  http_request POST "$BASE_URL/api/runs/$RUN_ID/events" '{"kind":"actor_hello","actor":{"provider":"local","model":"none","profile":"local"},"payload":{}}'
  if [[ "$HTTP_STATUS" == "200" ]]; then
    set_step append_event pass "200"
  else
    set_step append_event fail "expected 200, got $HTTP_STATUS"
  fi
else
  set_step append_event fail "missing runId"
fi

# Concurrency 20
if [[ -n "$RUN_ID" ]]; then
  tmp_counts="$(mktemp)"
  for _i in $(seq 1 20); do
    (
      curl -sS -o /dev/null -w "%{http_code}\n" \
        -X POST "$BASE_URL/api/runs/$RUN_ID/events" \
        -H "Content-Type: application/json" \
        "${AUTH_ARGS[@]}" \
        -d '{"kind":"probe","actor":{"provider":"local","model":"none","profile":"local"},"payload":{"i":{}}}'
    ) >>"$tmp_counts" &
  done
  wait
  ok_count="$(grep -c '^200$' "$tmp_counts" || true)"
  total_count="$(wc -l < "$tmp_counts" | tr -d ' ')"
  dist="$(sort "$tmp_counts" | uniq -c | tr '\n' ';')"
  rm -f "$tmp_counts"
  if [[ "$total_count" == "20" && "$ok_count" == "20" ]]; then
    set_step concurrency_http pass "$dist"
  else
    set_step concurrency_http fail "$dist"
  fi
else
  set_step concurrency_http fail "missing runId"
fi

# Concurrency DB check
if [[ -n "$RUN_ID" && -n "$PSQL_DSN" && "$HAS_PSQL" -eq 1 ]]; then
  row="$(psql "$PSQL_DSN" -At -F',' -c "select count(*),min(seq),max(seq),count(distinct seq) from run_events where run_id='$RUN_ID' and kind='probe';" 2>/dev/null || true)"
  IFS=',' read -r n min_seq max_seq distinct_seq <<<"$row"
  dup="$(psql "$PSQL_DSN" -At -F',' -c "select seq from run_events where run_id='$RUN_ID' and kind='probe' group by seq having count(*) > 1 limit 1;" 2>/dev/null || true)"
  gap="$(psql "$PSQL_DSN" -At -F',' -c "with s as (select generate_series(min(seq), max(seq)) as seq from run_events where run_id='$RUN_ID' and kind='probe') select s.seq from s left join run_events e on e.run_id='$RUN_ID' and e.kind='probe' and e.seq=s.seq where e.seq is null limit 1;" 2>/dev/null || true)"
  if [[ "$n" == "20" && "$distinct_seq" == "20" && -z "$dup" && -z "$gap" ]]; then
    set_step concurrency_db pass "n=$n min=$min_seq max=$max_seq distinct=$distinct_seq"
  else
    set_step concurrency_db fail "n=$n min=$min_seq max=$max_seq distinct=$distinct_seq dup=$dup gap=$gap"
  fi
else
  set_step concurrency_db skipped "PSQL_DSN not set"
fi

# Snapshot
if [[ -n "$RUN_ID" ]]; then
  http_request POST "$BASE_URL/api/runs/$RUN_ID/snapshot"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    ARTIFACT_ID="$(json_get artifactId "$HTTP_BODY")"
    SNAPSHOT_URI="$(json_get uri "$HTTP_BODY")"
    SNAPSHOT_SHA="$(json_get sha256 "$HTTP_BODY")"
    if [[ -n "$ARTIFACT_ID" ]]; then
      set_step snapshot_http pass "artifactId=$ARTIFACT_ID"
    else
      set_step snapshot_http fail "missing artifactId"
    fi
  else
    set_step snapshot_http fail "expected 200, got $HTTP_STATUS"
  fi
else
  set_step snapshot_http fail "missing runId"
fi

# Snapshot DB check
if [[ -n "$ARTIFACT_ID" && -n "$PSQL_DSN" && "$HAS_PSQL" -eq 1 ]]; then
  row="$(psql "$PSQL_DSN" -At -F',' -c "select id,storage_provider,storage_key,created_by,sha256,bytes,uri from artifacts where id='$ARTIFACT_ID';" 2>/dev/null || true)"
  if [[ -z "$row" ]]; then
    set_step snapshot_db fail "no artifact row"
  else
    IFS=',' read -r a_id storage_provider storage_key created_by sha256 bytes uri <<<"$row"
    if [[ -n "$storage_provider" && -n "$storage_key" && -n "$created_by" && -n "$sha256" && -n "$bytes" && -n "$uri" ]]; then
      set_step snapshot_db pass "$storage_provider"
      if [[ -z "$SNAPSHOT_URI" ]]; then
        SNAPSHOT_URI="$uri"
      fi
    else
      set_step snapshot_db fail "missing fields"
    fi
  fi
else
  set_step snapshot_db skipped "PSQL_DSN not set"
fi

# Snapshot file exists
if [[ -n "$SNAPSHOT_URI" ]]; then
  if [[ -f "$SNAPSHOT_URI" ]]; then
    set_step snapshot_file pass "$(basename "$SNAPSHOT_URI")"
  else
    set_step snapshot_file fail "missing file"
  fi
else
  set_step snapshot_file fail "missing snapshot uri"
fi

# LLM call
if [[ -n "$RUN_ID" ]]; then
  http_request POST "$BASE_URL/api/runs/$RUN_ID/llm" "{\"profileName\":\"google-vertex-sterile\",\"input\":{\"text\":\"ping\"}}"
  if [[ "$REAL_MODE_ACTIVE" -eq 1 ]]; then
    if [[ "$HTTP_STATUS" == "400" || "$HTTP_STATUS" == "403" ]]; then
      if [[ "$HTTP_BODY" == *"real_calls_disabled"* ]]; then
        set_step llm_http skipped "guardrail_blocked"
        set_step llm_events skipped "guardrail_blocked"
      else
        set_step llm_http fail "expected real_calls_disabled"
        set_step llm_events skipped "guardrail_blocked"
      fi
    else
      set_step llm_http fail "expected 403, got $HTTP_STATUS"
      set_step llm_events skipped "guardrail_blocked"
    fi
  else
    if [[ "$HTTP_STATUS" == "200" ]]; then
      INPUT_HASH="$(json_get_path hashes.inputHash "$HTTP_BODY")"
      OUTPUT_HASH="$(json_get_path hashes.outputHash "$HTTP_BODY")"
      if [[ -n "$INPUT_HASH" && -n "$OUTPUT_HASH" ]]; then
        set_step llm_http pass "hashes"
      else
        set_step llm_http fail "missing hashes"
      fi
    elif [[ "$HTTP_STATUS" == "403" || "$HTTP_STATUS" == "400" ]]; then
      if [[ "$HTTP_BODY" == *"real_calls_disabled"* || "$HTTP_BODY" == *"guardrail"* || "$HTTP_BODY" == *"blocked"* ]]; then
        set_step llm_http skipped "guardrail_blocked"
      else
        set_step llm_http skipped "403"
      fi
      LLM_SKIPPED=1
    else
      set_step llm_http fail "expected 200, got $HTTP_STATUS"
    fi
  fi
else
  set_step llm_http fail "missing runId"
fi

# LLM events in timeline (mock mode only)
if [[ "$REAL_MODE_ACTIVE" -eq 0 ]]; then
  if [[ "$LLM_SKIPPED" -eq 1 ]]; then
    set_step llm_events skipped "llm_http_skipped"
  elif [[ -n "$RUN_ID" ]]; then
    if [[ -z "$INPUT_HASH" || -z "$OUTPUT_HASH" ]]; then
      set_step llm_events fail "missing hashes"
    else
      http_request GET "$BASE_URL/api/runs/$RUN_ID"
      if [[ "$HTTP_STATUS" == "200" ]]; then
        if [[ "$HTTP_BODY" == *"actor_hello"* && "$HTTP_BODY" == *"llm_request"* && "$HTTP_BODY" == *"llm_response"* && "$HTTP_BODY" == *"$INPUT_HASH"* && "$HTTP_BODY" == *"$OUTPUT_HASH"* ]]; then
          set_step llm_events pass "timeline ok"
        else
          set_step llm_events fail "missing llm events"
        fi
      else
        set_step llm_events fail "expected 200, got $HTTP_STATUS"
      fi
    fi
  else
    set_step llm_events fail "missing runId"
  fi
fi

# Real-call guardrail check (optional)
if [[ "$REAL_GUARDRAIL_CHECK" == "1" || "$REAL_GUARDRAIL_CHECK" == "true" ]]; then
  if [[ "$REAL_MODE_ACTIVE" -eq 0 ]]; then
    set_step real_guardrail pass "not_applicable"
  elif [[ -n "$RUN_ID" ]]; then
    http_request POST "$BASE_URL/api/runs/$RUN_ID/llm" "{\"profileName\":\"google-vertex-sterile\",\"input\":{\"text\":\"guardrail\"}}"
    if [[ "$HTTP_STATUS" == "400" || "$HTTP_STATUS" == "403" ]]; then
      if [[ "$HTTP_BODY" == *"real_calls_disabled"* ]]; then
        set_step real_guardrail pass "$HTTP_STATUS"
      else
        set_step real_guardrail fail "expected real_calls_disabled"
      fi
    else
      set_step real_guardrail fail "expected 400/403, got $HTTP_STATUS"
    fi
  else
    set_step real_guardrail fail "missing runId"
  fi
else
  set_step real_guardrail pass "not_requested"
fi

# Tenant isolation
if [[ -n "$TENANT_WORKSPACE" && -n "$RUN_ID" ]]; then
  http_request GET "$BASE_URL/api/runs/$RUN_ID" "" 1
  if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "404" ]]; then
    # override request with mismatched workspace header
    local_tmp="$(mktemp)"
    status="$(curl -sS -o "$local_tmp" -w "%{http_code}" -X GET "$BASE_URL/api/runs/$RUN_ID" "${AUTH_ARGS[@]}" -H "X-Workspace-Id: $TENANT_WORKSPACE")"
    rm -f "$local_tmp"
    if [[ "$status" == "404" ]]; then
      set_step tenant_isolation pass "404"
    else
      set_step tenant_isolation fail "expected 404, got $status"
    fi
  else
    set_step tenant_isolation fail "precheck failed $HTTP_STATUS"
  fi
else
  set_step tenant_isolation skipped "TENANT_WORKSPACE not set"
fi

# Print summary
for step in "${STEP_ORDER[@]}"; do
  step_print "$step"
done

overall="pass"
if [[ "$FAILED" -eq 1 ]]; then
  overall="fail"
elif [[ "$SKIPPED" -eq 1 ]]; then
  overall="partial"
fi

fail_count=0
skipped_steps=()
for step in "${STEP_ORDER[@]}"; do
  status="${STEP_STATUS[$step]:-skipped}"
  if [[ "$status" == "fail" ]]; then
    fail_count=$((fail_count + 1))
  elif [[ "$status" == "skipped" ]]; then
    skipped_steps+=("$step")
  fi
done

stability_gate="fail"
allowed_skips=("tenant_isolation")
if [[ "$REAL_MODE_ACTIVE" -eq 1 ]]; then
  allowed_skips+=("llm_http" "llm_events")
fi
if [[ "$fail_count" -eq 0 ]]; then
  if [[ "$overall" == "pass" ]]; then
    stability_gate="pass"
  elif [[ "$overall" == "partial" ]]; then
    ok=1
    for skipped in "${skipped_steps[@]}"; do
      allow=0
      for allowed in "${allowed_skips[@]}"; do
        if [[ "$skipped" == "$allowed" ]]; then
          allow=1
          break
        fi
      done
      if [[ "$allow" -eq 0 ]]; then
        ok=0
        break
      fi
    done
    if [[ "$ok" -eq 1 ]]; then
      stability_gate="partial_ok"
    else
      stability_gate="fail"
    fi
  fi
fi

# Write JSON
{
  printf '{\n'
  printf '  "ts":"%s",\n' "$(json_escape "$TS")"
  printf '  "baseUrl":"%s",\n' "$(json_escape "$BASE_URL")"
  printf '  "workspaceExpected":"%s",\n' "$(json_escape "$WORKSPACE_EXPECTED")"
  printf '  "realMode":"%s",\n' "$(json_escape "$REAL_MODE_ACTIVE")"
  printf '  "runId":"%s",\n' "$(json_escape "$RUN_ID")"
  printf '  "artifactId":"%s",\n' "$(json_escape "$ARTIFACT_ID")"
  printf '  "snapshotUri":"%s",\n' "$(json_escape "$SNAPSHOT_URI")"
  printf '  "snapshotSha256":"%s",\n' "$(json_escape "$SNAPSHOT_SHA")"
  printf '  "hashes":{"inputHash":"%s","outputHash":"%s"},\n' "$(json_escape "$INPUT_HASH")" "$(json_escape "$OUTPUT_HASH")"
  printf '  "steps":{\n'
  last_index=$((${#STEP_ORDER[@]} - 1))
  for i in "${!STEP_ORDER[@]}"; do
    step="${STEP_ORDER[$i]}"
    status="${STEP_STATUS[$step]:-skipped}"
    detail="${STEP_DETAIL[$step]:-}"
    printf '    "%s":{"status":"%s","detail":"%s"}' \
      "$(json_escape "$step")" \
      "$(json_escape "$status")" \
      "$(json_escape "$detail")"
    if [[ "$i" -lt "$last_index" ]]; then
      printf ',\n'
    else
      printf '\n'
    fi
  done
  printf '  },\n'
  printf '  "overall":"%s",\n' "$(json_escape "$overall")"
  printf '  "stabilityGate":"%s"\n' "$(json_escape "$stability_gate")"
  printf '}\n'
} > "$OUT_FILE"

echo "smoke report: $OUT_FILE"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
