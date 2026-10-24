#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the project's PostgreSQL connection string.}"

psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 --command \
  "create schema if not exists private;
   create table if not exists private.smartschool_migration_history (
     migration_file text primary key,
     checksum text not null,
     applied_at timestamptz not null default now()
   );
   alter table private.smartschool_migration_history enable row level security;
   revoke all on private.smartschool_migration_history from public, anon, authenticated;"

for migration in "$@"; do
  if [[ ! "$migration" =~ ^supabase/[0-9]{3,}_[A-Za-z0-9_-]+\.sql$ ]]; then
    printf 'Refusing unexpected migration path: %s\n' "$migration" >&2
    exit 1
  fi

  filename="${migration##*/}"
  version="${filename%%_*}"
  if (( 10#$version < 69 )); then
    printf 'Refusing to auto-apply historical migration %s; automatic deployment starts at 069.\n' "$filename" >&2
    exit 1
  fi

  checksum="$(sha256sum "$migration" | cut -d ' ' -f 1)"
  applied_checksum="$(psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --set migration_file="$filename" \
    --command "select checksum from private.smartschool_migration_history where migration_file = :'migration_file';")"

  if [[ -n "$applied_checksum" ]]; then
    if [[ "$applied_checksum" != "$checksum" ]]; then
      printf 'Migration %s changed after it was applied. Add a new migration instead of editing deployed SQL.\n' "$filename" >&2
      exit 1
    fi
    printf 'Already applied: %s\n' "$filename"
    continue
  fi

  printf 'Applying %s\n' "$filename"
  transaction_file="$(mktemp)"
  trap 'rm -f "$transaction_file"' EXIT
  cat "$migration" > "$transaction_file"
  printf "\ninsert into private.smartschool_migration_history(migration_file, checksum) values ('%s', '%s');\n" \
    "$filename" "$checksum" >> "$transaction_file"
  psql "$SUPABASE_DB_URL" --set ON_ERROR_STOP=1 --single-transaction --file "$transaction_file"
  rm -f "$transaction_file"
  trap - EXIT
done
