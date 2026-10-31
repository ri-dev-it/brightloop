#!/bin/sh
# Generates a persistent SECRET_KEY on first start if none was supplied, then hands over to the CMD.
set -eu
KEY_FILE="$(dirname "$DATABASE")/.secret_key"
if [ -z "${SECRET_KEY:-}" ]; then
  if [ ! -s "$KEY_FILE" ]; then
    python -c "import secrets; print(secrets.token_urlsafe(48))" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
  fi
  SECRET_KEY="$(cat "$KEY_FILE")"
  export SECRET_KEY
fi
exec "$@"
