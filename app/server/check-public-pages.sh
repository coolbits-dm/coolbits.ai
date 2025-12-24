#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://coolbits.ai}"

urls=(
  "${BASE_URL}/"
  "${BASE_URL}/contact"
  "${BASE_URL}/legal/terms"
  "${BASE_URL}/legal/privacy"
)

for url in "${urls[@]}"; do
  echo ">>> ${url}"
  curl -sS -I "${url}" | sed 's/\r$//'
  echo
done
