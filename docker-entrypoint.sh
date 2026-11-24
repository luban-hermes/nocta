#!/bin/sh
# Fix ownership of the data volume (bind mounts are often root-owned), then drop to the
# unprivileged `nocta` user, apply database migrations and start the server.
set -e

mkdir -p /app/data
if [ "$(id -u)" = "0" ]; then
  chown -R nocta:nocta /app/data 2>/dev/null || true
  exec su-exec nocta "$0" "$@"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "[nocta] WARNING: ADMIN_PASSWORD is not set — nobody can sign in to 夜航后台." >&2
fi

echo "[nocta] applying database migrations…"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

exec "$@"
