#!/bin/bash
# Applies each file in supabase/migrations that has not been applied yet, in
# order, to the database in DATABASE_URL (environment first, then .env.local).
# Applied files are recorded in eurowerken_meta.migrations, a schema the API
# does not expose.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)"
fi
if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *"YOUR-DATABASE-PASSWORD"* ]]; then
  echo "Set DATABASE_URL in .env.local first (Supabase: Project Settings, Database, connection string)." >&2
  exit 1
fi
command -v psql >/dev/null || { echo "psql is not installed (brew install postgresql)." >&2; exit 1; }

# Hide the "already exists, skipping" notices; errors still show and stop the run.
export PGOPTIONS='-c client_min_messages=warning'
q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX "$@"; }

q -c "create schema if not exists eurowerken_meta;
      create table if not exists eurowerken_meta.migrations (
        name text primary key, applied_at timestamptz not null default now());"

# Projects set up before this tracking existed ran 001 and 002 by hand in the
# SQL editor. Record them as applied so they are not replayed over newer ones.
if [ "$(q -c "select count(*) from eurowerken_meta.migrations")" = "0" ]; then
  if [ "$(q -c "select to_regclass('public.profiles') is not null")" = "t" ]; then
    q -c "insert into eurowerken_meta.migrations (name) values ('001_profiles.sql') on conflict do nothing"
  fi
  if [ "$(q -c "select to_regclass('public.role_permissions') is not null")" = "t" ]; then
    q -c "insert into eurowerken_meta.migrations (name) values ('002_registration_and_rbac.sql') on conflict do nothing"
  fi
  if [ "$(q -c "select to_regclass('public.workshop_invites') is not null")" = "t" ]; then
    q -c "insert into eurowerken_meta.migrations (name) values ('003_workshops.sql') on conflict do nothing"
  fi
fi

applied=0
for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [ "$(q -c "select count(*) from eurowerken_meta.migrations where name = '$name'")" = "1" ]; then
    echo "Already applied: $name"
    continue
  fi
  echo "Applying $name"
  # One transaction per file: a failure leaves the database as it was.
  q -1 -f "$f" >/dev/null || { echo "Failed on $name; nothing from it was applied." >&2; exit 1; }
  q -c "insert into eurowerken_meta.migrations (name) values ('$name')"
  applied=$((applied + 1))
done
echo "Done. $applied migration(s) applied."
