#!/bin/bash
# Applies every file in supabase/migrations, in order, to the database in
# DATABASE_URL (read from .env.local). Every migration is safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)"
fi
if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *"YOUR-DATABASE-PASSWORD"* ]]; then
  echo "Set DATABASE_URL in .env.local first (Supabase: Project Settings, Database, connection string)." >&2
  exit 1
fi
command -v psql >/dev/null || { echo "psql is not installed (brew install postgresql)." >&2; exit 1; }

# Hide the "already exists, skipping" notices that re-runs produce; errors still show and stop the run.
export PGOPTIONS='-c client_min_messages=warning'
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "Failed on $f" >&2; exit 1; }
done
echo "Done."
