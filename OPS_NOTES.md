# OPS Notes

## Postgres URI and bash history expansion
- Do not wrap a postgres URI that contains `!` in double quotes; bash history expansion can break with `event not found`.
- Safe options:
  - Single-quoted URI:
    `psql 'postgresql://USER:PASSWORD@HOST:5432/DBNAME' -c 'SELECT 1;'`
  - `PGPASSWORD` + flags:
    `PGPASSWORD='PASSWORD' psql -h HOST -U USER -d DBNAME -c 'SELECT 1;'`
