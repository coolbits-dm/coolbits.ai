#!/usr/bin/env bash
set -euo pipefail

: "${INSTANCE_CONN:?missing}"
: "${DBNAME:?missing}"
: "${BUCKET:?missing}"
: "${PGPASSWORD:?missing}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$(mktemp "/tmp/${DBNAME}-${STAMP}-XXXXXX.pgdump")"
trap 'rm -f "${OUT}"' EXIT

DEST_BUCKET="${BUCKET%/}"
DEST="${DEST_BUCKET}/dump-${STAMP}.pgdump"

echo "[pgdump] $(pg_dump --version)"
echo "[pgdump] dumping ${DBNAME} -> ${OUT}"
pg_dump -h "/cloudsql/${INSTANCE_CONN}" -U postgres -d "${DBNAME}" \
  --format=custom --no-owner --no-privileges \
  --file "${OUT}"

echo "[pgdump] uploading ${OUT} to ${DEST}"
gcloud storage cp "${OUT}" "${DEST}"
echo "[pgdump] done"
