#!/usr/bin/env bash
set -Eeuo pipefail

for required_variable in ADMIN_LOGIN_ID ADMIN_PASSWORD_HASH ADMIN_TOKEN_SECRET; do
  value="${!required_variable:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    echo "Missing required admin secret: ${required_variable}" >&2
    exit 1
  fi
done

bcrypt_pattern='^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$'
if [[ ! "${ADMIN_PASSWORD_HASH}" =~ ${bcrypt_pattern} ]]; then
  echo 'ADMIN_PASSWORD_HASH must be a valid BCrypt hash.' >&2
  exit 1
fi

if [[ ${#ADMIN_TOKEN_SECRET} -lt 32 ]]; then
  echo 'ADMIN_TOKEN_SECRET must contain at least 32 characters.' >&2
  exit 1
fi
