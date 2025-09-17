#!/usr/bin/env bash
set -euo pipefail

: "${INSTANCE_CONN:?missing}"
: "${DBNAME:?missing}"
: "${DUMP_URI:?missing}"
: "${PGPASSWORD:?missing}"

TMP="$(mktemp "/tmp/${DBNAME}-restore-XXXXXX.pgdump")"
trap 'rm -f "${TMP}"' EXIT

RESTORE_FLAGS="${RESTORE_FLAGS:---clean --if-exists --no-owner --no-privileges}"
IFS=' ' read -r -a RESTORE_ARGS <<< "${RESTORE_FLAGS}"

echo "[pgrestore] fetching ${DUMP_URI} -> ${TMP}"
gcloud storage cp "${DUMP_URI}" "${TMP}"

if [[ ! -s "${TMP}" ]]; then
  echo "[pgrestore] downloaded dump is empty" >&2
  exit 1
fi

echo "[pgrestore] restoring ${DBNAME} from ${DUMP_URI}"
pg_restore \
  -h "/cloudsql/${INSTANCE_CONN}" \
  -U postgres \
  -d "${DBNAME}" \
  "${RESTORE_ARGS[@]}" \
  "${TMP}"

echo "[pgrestore] restore complete"
