#!/bin/sh
# Fix ownership of the data volume (bind mounts are often root-owned), then drop to the
# unprivileged `nocta` user, apply database migrations and start the server.
set -e

mkdir -p /app/data
if [ "$(id -u)" = "0" ]; then
  chown -R nocta:nocta /app/data 2>/dev/null || true
  exec su-exec nocta "$0" "$@"
fi

if [ ! -w /app/data ]; then
  echo "[nocta] ERROR: /app/data is not writable by uid $(id -u). Fix the volume's ownership" >&2
  echo "        (e.g. chown -R $(id -u):$(id -g) ./data) or start the container without --user." >&2
  exit 1
fi

# no configuration is required: the admin password is chosen in the first-run setup wizard and
# everything else lives in 夜航后台 → 系统设置 (env vars are optional defaults, see README)

echo "[nocta] applying database migrations…"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

exec "$@"
