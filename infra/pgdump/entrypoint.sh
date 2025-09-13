#!/usr/bin/env bash
set -euo pipefail
: "${INSTANCE_CONN:?missing}"
: "${DBNAME:?missing}"
: "${BUCKET:?missing}"
: "${PGPASSWORD:?missing}"
echo "[pgrestore] $(pg_restore --version)"
LATEST=$(gcloud storage ls "${BUCKET}/dump-*.pgdump" | sort | tail -n 1)
if [ -z "${LATEST}" ]; then
  echo "[pgrestore] no dump files found" >&2
  exit 2
fi
TMP="/tmp/restore.pgdump"
gcloud storage cp "${LATEST}" "${TMP}"
pg_restore -h "/cloudsql/${INSTANCE_CONN}" -U postgres -d "${DBNAME}" --clean --if-exists --no-owner --no-privileges "${TMP}"
echo "[pgrestore] done"
