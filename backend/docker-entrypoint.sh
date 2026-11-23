#!/bin/sh
# Self-Notes API container: apply pending migrations, then start the API.
set -eu

# The SQLite database lives in /app/db, usually the ./db bind mount, which Docker creates as root.
# Started as root (the default), give that folder to the unprivileged "node" user, then drop to it.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/db
  chown -R node:node /app/db
  exec su-exec node "$0" "$@"
fi

node_modules/.bin/prisma migrate deploy
exec node dist/server.js
