#!/bin/sh
set -eu

uid="${NESTIKU_UID:-10001}"
gid="${NESTIKU_GID:-10001}"

if [ "$(id -u)" = "0" ]; then
  if [ "$uid" = "0" ] || [ "$gid" = "0" ]; then
    exec "$@"
  fi
  if [ -d /data ] && chown -R "$uid:$gid" /data; then
    exec su-exec "$uid:$gid" "$@"
  fi
  echo "Nestiku warning: could not chown /data to $uid:$gid; continuing as root so existing mounted data remains readable and writable." >&2
  exec "$@"
fi

exec "$@"
