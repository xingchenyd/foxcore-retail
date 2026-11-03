#!/bin/sh
set -eu
umask 077
mkdir -p /run/foxcore-root /run/foxcore-app
for file in /run/foxcore-root/password /run/foxcore-app/db_password; do
  if [ ! -s "$file" ]; then
    head -c 48 /dev/urandom | base64 | tr -d '\n' > "$file.tmp"
    mv "$file.tmp" "$file"
  fi
done
chown -R 1000:1000 /run/foxcore-app
chmod 700 /run/foxcore-app
export POSTGRES_USER=postgres POSTGRES_DB=foxcore
export POSTGRES_PASSWORD="$(cat /run/foxcore-root/password)"
export FOXCORE_APP_PASSWORD="$(cat /run/foxcore-app/db_password)"
exec /usr/local/bin/docker-entrypoint.sh "$@"
