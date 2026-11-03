#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$FOXCORE_APP_PASSWORD" <<'SQL'
CREATE ROLE foxcore LOGIN PASSWORD :'app_password';
SQL
