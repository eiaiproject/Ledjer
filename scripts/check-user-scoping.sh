#!/usr/bin/env bash
# Check all service queries include user_id scoping
# Usage: scripts/check-user-scoping.sh
#
# Scans worker/services/*.ts for SELECT/UPDATE/DELETE queries via queryAll/queryFirst/execute
# and flags SQL strings (template literals with `) that don't contain user_id.
#
# Satu akun = satu buku: user_id adalah satu-satunya kolom skoping (pengganti
# organization_id). Tabel auth/system (users, sessions, tokens, rate_limits)
# tidak di-scope.
#
# Exceptions: docs/compliance/user-scope-exceptions.json lists files where queries
# operate on auth/system tables (users, sessions, tokens) rather than book data.
# Inline exceptions: /* no-user-scope */ comment before the call.
#
# ponytail: Simple grep-based, not a SQL parser. Handles backtick template literals only.
# Upgrade to AST-based when false positives become a problem.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXCEPTIONS_FILE="$PROJECT_ROOT/docs/compliance/user-scope-exceptions.json"
HAS_ERRORS=0

# Check exceptions file exists and is valid
if [[ ! -f "$EXCEPTIONS_FILE" ]]; then
  echo "{}" > "$EXCEPTIONS_FILE"
fi

# Read file-level exceptions
EXCEPTED_FILES=$(python3 -c "
import json, sys
try:
  with open('$EXCEPTIONS_FILE') as f:
    data = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
  data = {}
for f in data.get('files', []):
  print(f)
" 2>/dev/null || echo "")

is_excepted_file() {
  local rel="$1"
  while IFS= read -r exc; do
    [[ -z "$exc" ]] && continue
    if [[ "$rel" == "$exc" ]]; then
      return 0
    fi
  done <<< "$EXCEPTED_FILES"
  return 1
}

while IFS= read -r file; do
  rel="${file#$PROJECT_ROOT/apps/web/worker/}"

  # Skip test files
  if echo "$rel" | grep -qE '(__tests__|\.test\.|\.spec\.)'; then
    continue
  fi

  if is_excepted_file "$rel"; then
    continue
  fi

  line_num=0
  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # Skip lines with /* no-user-scope */ annotation
    if echo "$line" | grep -q "/\* no-user-scope \*/"; then
      continue
    fi

    # Check queryAll/queryFirst/execute with SQL template literal
    if echo "$line" | grep -qE "(queryAll|queryFirst|execute)\("; then
      sql_line="$line"

      # If SQL is on next line, read ahead
      if echo "$sql_line" | grep -qE ",\s*$" && ! echo "$sql_line" | grep -q '`'; then
        next_line=$(sed -n "$((line_num + 1))p" "$file")
        sql_line="$sql_line $next_line"
      fi

      # Check if SQL string contains backtick (template literal SQL)
      if echo "$sql_line" | grep -q '`'; then
        sql_content=$(echo "$sql_line" | sed -n 's/.*`\([^`]*\)`.*/\1/p')

        # Only check SELECT/UPDATE/DELETE queries
        if echo "$sql_content" | grep -qiE "^\s*(SELECT|UPDATE|DELETE)\s" && ! echo "$sql_content" | grep -qi "user_id"; then
            echo "ERROR: $rel:$line_num — query appears to lack user_id scoping"
            echo "  SQL: ${sql_content:0:80}..."
            echo "  Fix: add user_id = ? to WHERE clause"
            echo "  Or add inline /* no-user-scope */ comment if intentional"
            HAS_ERRORS=1
        fi
      fi
    fi
  done < "$file"
done < <(find "$PROJECT_ROOT/apps/web/worker/services" -name '*.ts' -type f)

if [[ "$HAS_ERRORS" -eq 1 ]]; then
  echo ""
  echo "Some queries may lack user_id scoping."
  echo "If the query is intentionally cross-user (auth, maintenance, system),"
  echo "add the file to docs/compliance/user-scope-exceptions.json or inline /* no-user-scope */."
  exit 1
fi

echo "✓ All service queries have user_id scoping or are annotated as exceptions."
exit 0
