#!/usr/bin/env bash
# =============================================================================
# run-sql-tests.sh
# -----------------------------------------------------------------------------
# Runs `supabase/tests/run_all.sql` against the local Supabase stack using psql.
#
# Usage:
#   bash scripts/run-sql-tests.sh
#
# Equivalent to CI's psql command, but on macOS hosts without libpq installed,
# this falls back to streaming the script into the running local `supabase_db_*`
# container (which always has psql). When CI does have psql installed, the
# script uses the canonical command directly:
#   psql -h localhost -p 54322 -U postgres -d postgres \
#     -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

if command -v psql >/dev/null 2>&1; then
  exec psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
fi

# Fallback: stream the test files into the local Supabase postgres container.
container=$(docker ps --format '{{.Names}}' | grep -E '^supabase_db(_|$)' | head -1 || true)
if [[ -z "${container:-}" ]]; then
  echo "ERROR: psql not installed and no supabase_db container running." >&2
  echo "Install postgresql-client or run 'supabase start --workdir .' first." >&2
  exit 1
fi
echo "psql not found on host; running via container '${container}'."

# /i relative paths in run_all.sql expect `<repo>/supabase/tests/...`, so we
# place the tests inside the container at the same layout.
target=/tmp/ledjer-sql-tests
docker exec "$container" mkdir -p "$target/supabase" >/dev/null
tar -C supabase -c tests \
  | docker exec -i "$container" tar -C "$target/supabase" -x

exec docker exec -i -u postgres -w "$target" "$container" \
  psql -h localhost -U "$PGUSER" -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 -f "$target/supabase/tests/run_all.sql"
