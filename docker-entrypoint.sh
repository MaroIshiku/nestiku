#!/bin/sh
set -eu

uid="${NESTIKU_UID:-10001}"
gid="${NESTIKU_GID:-10001}"

if [ "$(id -u)" = "0" ]; then
  if [ -d /data ]; then
    chown -R "$uid:$gid" /data 2>/dev/null || true
  fi
  exec su-exec "$uid:$gid" "$@"
fi

exec "$@"
