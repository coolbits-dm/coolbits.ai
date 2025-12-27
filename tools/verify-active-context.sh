#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8788}"
AUTH_HEADER=()
if [[ -n "${CB_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${CB_TOKEN}")
fi

printf "\n[health]\n"
curl -i "${BASE_URL}/health"

printf "\n\n[context active]\n"
curl -i "${AUTH_HEADER[@]}" "${BASE_URL}/api/context/active"

printf "\n\n[context activate]\n"
curl -i -X POST "${AUTH_HEADER[@]}" "${BASE_URL}/api/context/activate" \
  -H 'Content-Type: application/json' \
  -d '{"workspace":"cbB","agentId":"cbAgent-B-002-cto","provider":"google","model":"gemini-2.5-pro","billingSource":"coolbits"}'

printf "\n\n[context active via Host header]\n"
curl -i "${AUTH_HEADER[@]}" -H 'Host: coolbits.ai' "${BASE_URL}/api/context/active"
