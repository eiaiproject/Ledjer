#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FULL=0
ARG="${1:-}"
if [[ "$ARG" == "--full" ]]; then
  FULL=1
elif [[ "$ARG" != "" ]]; then
  echo "Usage: bash scripts/ci-local.sh [--full]" >&2
  exit 2
fi

section() {
  echo ""
  echo "==> $1"
}

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

section "Install"
pnpm install --frozen-lockfile

section "Typecheck"
pnpm --filter web typecheck

section "Lint"
pnpm --filter web lint

section "Unit tests"
pnpm --filter web test

section "Build"
pnpm --filter web build

section "Build secrets scan"
bash scripts/check-build-secrets.sh

section "D1 migration naming"
bash scripts/check-migration-naming.sh

section "D1 migration executable-code guard"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
for f in apps/web/worker/db/migrations/*.sql; do
  [[ -f "$f" ]] || continue
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s/(?m)^[ \t]*--.*$//g' "$f" \
    | awk -v file="$f" '{ print file ":" NR ":" $0 }'
done > "$tmp"
if grep -n '_test_assert' "$tmp"; then
  echo "ERROR: _test_assert referenced in executable D1 migration code" >&2
  exit 1
fi

if [[ "$FULL" -eq 1 ]]; then
  section "Fresh D1 migration apply"
  # Use the default .wrangler persistence path so vite preview (via
  # @cloudflare/vite-plugin) picks up the same D1 database.
  local_d1="${ROOT}/apps/web/.wrangler/state/v3/d1"
  rm -rf "$local_d1"
  pnpm --filter web db:migrations:apply:local

  section "D1 migration list"
  pnpm --filter web db:migrations:list

  section "Playwright public E2E"
  E2E_MODE=local-full \
  E2E_BASE_URL=http://localhost:4173 \
  CI=true \
  pnpm --filter web exec playwright test \
    e2e/smoke.spec.ts \
    e2e/auth.spec.ts \
    e2e/security-public.spec.ts \
    e2e/static-routes.spec.ts \
    e2e/accessibility.spec.ts \
    e2e/responsive.spec.ts \
    e2e/performance.spec.ts \
    --project=chromium
fi

echo ""
echo "OK: local CI passed"
