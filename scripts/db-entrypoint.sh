#!/bin/sh
set -eu
mkdir -p /run/foxcore-root /run/foxcore-app
if [ ! -s /run/foxcore-root/password ]; then
  head -c 48 /dev/urandom | base64 | tr -d '\n' > /run/foxcore-root/password
  chmod 600 /run/foxcore-root/password
fi
if [ ! -s /run/foxcore-app/db_password ]; then
  head -c 48 /dev/urandom | base64 | tr -d '\n' > /run/foxcore-app/db_password
fi
chown -R 1000:1000 /run/foxcore-app
chmod 700 /run/foxcore-app
chmod 600 /run/foxcore-app/db_password
export MARIADB_ROOT_PASSWORD="$(cat /run/foxcore-root/password)"
export MARIADB_PASSWORD="$(cat /run/foxcore-app/db_password)"
export MARIADB_DATABASE=foxcore
export MARIADB_USER=foxcore
export MARIADB_ROOT_HOST=%
exec /usr/local/bin/docker-entrypoint.sh mariadbd
