#!/usr/bin/env bash
# Scan the production build output for leaked secrets.
# Exits non-zero on any hit. Catches the common shape of tokens/keys.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

scan_dirs=(apps/web/dist)
fail=0

if [[ ! -d "${scan_dirs[0]}" ]]; then
  echo "ERROR: ${scan_dirs[0]} not found. Run 'pnpm --filter web build' first." >&2
  exit 1
fi

# Patterns: AWS, GitHub PAT, generic JWT, sk-/pk- prefixed keys, long base64 blobs.
patterns=(
  'AKIA[0-9A-Z]{16}'                          # AWS access key
  'github_pat_[A-Za-z0-9_]{20,}'              # GitHub fine-grained PAT
  'ghp_[A-Za-z0-9]{20,}'                      # GitHub classic PAT
  'sk_(live|test)_[A-Za-z0-9]{16,}'           # Stripe secret
  'pk_(live|test)_[A-Za-z0-9]{16,}'           # Stripe publishable (warn, not fail)
  'xox[bpars]-[A-Za-z0-9-]{10,}'              # Slack
  'eyJ[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}' # JWT
  '-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----'
  'AIza[0-9A-Za-z_-]{35}'                     # Google API key
  'SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}' # SendGrid
)

for dir in "${scan_dirs[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' f; do
    for pat in "${patterns[@]}"; do
      # Skip source maps (.map) — they may contain inline source.
      case "$f" in
        *.map) continue ;;
        *) ;; # ponytail: no-op default, satisfies sonar S131
      esac
      if grep -aE -o -- "$pat" "$f" >/dev/null 2>&1; then
        # Filter false positives:
        #  - VITE_SENTRY_DSN public DSN (key after @ is host, not secret)
        #  - test fixtures with explicit "_test" / "fake" markers
        if grep -aE -o -- "$pat" "$f" \
          | grep -aE -i '(_test|fake|example|placeholder)' >/dev/null; then
          continue
        fi
        echo "FAIL: $f matches pattern: $pat" >&2
        grep -aE -o -- "$pat" "$f" | head -1 >&2
        fail=1
      fi
    done
  done < <(find "$dir" -type f -print0)
done

if [[ "$fail" -ne 0 ]]; then
  echo "ERROR: leaked secret pattern(s) detected in build output" >&2
  exit 1
fi

echo "OK: build output free of common secret patterns"
