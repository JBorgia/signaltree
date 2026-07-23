#!/usr/bin/env bash
# Guards against reintroducing the "callable tree node treated as plain
# object" bug class: v11.4/11.5 shipped fixes for this in batching() and
# updateOptimized() independently, and a further audit found the same
# hand-rolled duck-typing duplicated across 13 sites in 4 packages. All of
# them were consolidated onto the shared `isTraversableNode()` predicate in
# packages/core/src/lib/utils.ts. This script fails if that duck-typing
# pattern (checking a value against BOTH 'object' and 'function' typeof
# results — the tell-tale sign of a hand-rolled walker guard) reappears
# anywhere outside utils.ts itself or test files.
#
# NodeAccessors (SignalTree branch accessors) and leaf signals are BOTH
# callable (typeof 'function'), so any walker that only accepts 'object'
# silently skips every accessor in the tree. `isTraversableNode()` is the
# one place that's allowed to know this; everywhere else should call it.

set -euo pipefail

EXIT_CODE=0

echo "🔍 Checking for hand-rolled 'object or function' tree-walker guards..."

# Files allowed to contain the raw pattern: the predicate's own definition,
# and test files (which may legitimately exercise the pattern in fixtures).
ALLOWED_PATTERN='utils\.ts$|\.spec\.ts$|__tests__/'

# Find files containing a typeof-'object' comparison...
OBJECT_HITS=$(grep -rlE "typeof [A-Za-z_$][A-Za-z0-9_$.]* (===|!==) 'object'" \
  --include='*.ts' packages/*/src 2>/dev/null | grep -vE "$ALLOWED_PATTERN" || true)

for file in $OBJECT_HITS; do
  # ...and also a typeof-'function' comparison against the SAME kind of
  # guard nearby (within 3 lines either direction covers both the single-line
  # and wrapped/multi-line forms seen across the codebase).
  if grep -nE "typeof [A-Za-z_$][A-Za-z0-9_$.]* (===|!==) 'object'" "$file" | while IFS=: read -r lineno _; do
      start=$((lineno > 3 ? lineno - 3 : 1))
      end=$((lineno + 3))
      sed -n "${start},${end}p" "$file" | grep -qE "typeof [A-Za-z_$][A-Za-z0-9_$.]* (===|!==) 'function'" && echo "match"
    done | grep -q "match"; then
    echo "❌ ERROR: $file re-derives the traversable-node guard by hand."
    echo "   Use isTraversableNode() from packages/core/src/lib/utils.ts instead"
    echo "   (import it from '@signaltree/core' if this file is in another package)."
    EXIT_CODE=1
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ No hand-rolled traversable-node guards found outside utils.ts"
fi

exit $EXIT_CODE
