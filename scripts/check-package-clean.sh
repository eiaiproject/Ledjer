#!/usr/bin/env bash
# =============================================================================
# check-package-clean.sh — local packaging guard for source archives
# =============================================================================
# =============================================================================
# Fails with a clear error if any forbidden path is present in a source
# archive created with `git ls-files` or `git archive`.
#
# Usage:
#   ./scripts/check-package-clean.sh [path-to-zip-or-tarball]
#
# If no argument is supplied, the script uses `git ls-files` to inspect
# the current working tree (which mirrors what would be in a clean archive).
#
# Forbidden paths:
#   - .env, .env.local, .env.*  EXCEPT .env.example (which is committed intentionally)
#   - .git (and any .git/*)
#   - node_modules
#   - dist (and any */dist/*)
#   - __MACOSX, .DS_Store
#   - supabase/.temp, supabase/.branches
#   - *.log
# =============================================================================

set -euo pipefail

# Build the forbidden regex. Allow .env.example explicitly.
FORBIDDEN_REGEX='(^|/)(\.git|node_modules|dist|__MACOSX|\.DS_Store|\.temp|\.branches)(/|$)|(^|/)\.env(\.local)?(\.[^/]+)?(/|$)'

fail=0

if [ "$#" -gt 0 ]; then
  archive="$1"
  if [ ! -f "$archive" ]; then
    echo "ERROR: archive not found: $archive" >&2
    exit 2
  fi
  case "$archive" in
    *.zip)
      if ! command -v unzip >/dev/null 2>&1; then
        echo "ERROR: unzip not installed (cannot inspect zip: $archive)" >&2
        exit 2
      fi
      echo "Inspecting zip: $archive"
      FILES=$(unzip -Z1 "$archive")
      ;;
    *.tar.gz|*.tgz|*.tar)
      echo "Inspecting tarball: $archive"
      FILES=$(tar -tzf "$archive")
      ;;
    *)
      echo "ERROR: unknown archive format: $archive" >&2
      exit 2
      ;;
  esac
else
  echo "Inspecting git ls-files in: $(pwd)"
  FILES=$(git ls-files)
fi

fail=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Allow .env.example explicitly (it's a documented template, no secrets).
  case "$f" in
    */.env.example|.env.example) continue ;;
  esac
  if [[ "$f" =~ $FORBIDDEN_REGEX ]]; then
    echo "FORBIDDEN: $f" >&2
    fail=1
  fi
done <<EOF
$FILES
EOF

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "ERROR: forbidden path(s) detected. See list above." >&2
  echo "Regenerate the archive from a clean checkout using:" >&2
  echo "  git archive --format=tar.gz --output=ledjer-src.tar.gz HEAD" >&2
  echo "  git ls-files | zip -@ ledjer-src.zip" >&2
  exit 1
fi

echo "OK: no forbidden paths in archive."
