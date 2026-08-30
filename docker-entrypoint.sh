#!/bin/sh
set -eu

uid="${NESTIKU_UID:-10001}"
gid="${NESTIKU_GID:-10001}"

if [ "$(id -u)" = "0" ]; then
  if [ "$uid" = "0" ] || [ "$gid" = "0" ]; then
    exec "$@"
  fi
  # Traverse before changing the mount root owner. This also handles a fresh
  # appliance bind directory created with mode 0700 while keeping DAC override
  # confined to this short startup phase.
  if [ -d /data ] \
    && find /data -depth -mindepth 1 -exec chown -h "$uid:$gid" {} + \
    && chown "$uid:$gid" /data; then
    exec su-exec "$uid:$gid" "$@"
  fi
  echo "Nestiku error: could not prepare /data for runtime UID/GID $uid:$gid." >&2
  exit 1
fi

exec "$@"
