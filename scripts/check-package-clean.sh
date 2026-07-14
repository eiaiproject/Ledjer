#!/usr/bin/env bash
# Verify that a git archive contains only the tracked file set
# and excludes junk (node_modules, dist, secrets, .git, etc.).
# Args: <archive>  (tar.gz or zip)
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <archive.tar.gz|archive.zip>" >&2
  exit 2
fi

archive="$1"

if [[ ! -f "$archive" ]]; then
  echo "FAIL: archive not found: $archive" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

tracked="$(mktemp)"
listed="$(mktemp)"
trap 'rm -f "$tracked" "$listed"' EXIT

git ls-files | sort > "$tracked"

# Normalize archive listing: strip leading "./" and any path prefix
# that exists in tracked files (git archive stores relative paths
# with a "./" prefix).
list_archive() {
  case "$archive" in
    *.tar.gz|*.tgz)
      # tar lists directories as separate entries — drop them.
      tar -tzf "$archive" | sed 's|^\./||' | grep -v '/$' | sort | sed '/^$/d'
      ;;
    *.zip)
      unzip -Z1 "$archive" | sed 's|^\./||' | sort | sed '/^$/d'
      ;;
    *)
      echo "FAIL: unsupported archive format: $archive" >&2
      exit 1
      ;;
  esac
}

list_archive > "$listed"

fail=0

# Diff the two sets. Use comm to catch any tracked-only or archive-only entries.
if ! cmp -s "$tracked" "$listed"; then
  echo "FAIL: archive contents differ from git ls-files" >&2
  # Show only first 20 diff lines for brevity.
  diff "$tracked" "$listed" | head -40 >&2
  echo "(diff truncated)" >&2
  fail=1
fi

# Forbidden: archive must not contain any of these, even if "tracked".
# (Defence in depth — these should already be gitignored.)
forbidden_re='(^|/)(node_modules|\.git|\.dev\.vars|dist|playwright-report|\.wrangler)(/|$)'
hits="$(grep -E "$forbidden_re" "$listed" || true)"
if [[ -n "$hits" ]]; then
  echo "FAIL: archive contains forbidden paths:" >&2
  echo "$hits" >&2
  fail=1
fi

# Required: lockfile must be present (reproducible builds).
for must in package.json pnpm-lock.yaml; do
  if ! grep -qx "$must" "$listed"; then
    echo "FAIL: archive missing required file: $must" >&2
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "OK: package clean ($archive: $(wc -l < "$tracked") files match)"
