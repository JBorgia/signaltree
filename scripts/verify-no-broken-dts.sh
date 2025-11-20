#!/usr/bin/env bash
# Verify that .d.ts files in dist follow the expected structure
# TypeScript declarations should be in src/ subdirectory, with re-exports in dist/
# This ensures proper module resolution for consumers.

set -e

EXIT_CODE=0

echo "🔍 Verifying TypeScript declaration structure in dist/packages/..."

for pkg in dist/packages/*; do
  if [ ! -d "$pkg" ]; then
    continue
  fi

  PKG_NAME=$(basename "$pkg")

  # ng-forms uses Angular's ng-packagr which puts declarations at root
  if [ "$PKG_NAME" = "ng-forms" ]; then
    if [ ! -f "$pkg/index.d.ts" ]; then
      echo "❌ ERROR: Missing $PKG_NAME/index.d.ts"
      EXIT_CODE=1
    else
      echo "✅ $PKG_NAME: declarations found at root (Angular package)"
    fi
    continue
  fi

  # Check that src/ declarations exist
  if [ ! -d "$pkg/src" ]; then
    echo "⚠️  WARNING: $PKG_NAME has no src/ directory for declarations"
    continue
  fi

  # Check for main index.d.ts in src/
  if [ ! -f "$pkg/src/index.d.ts" ]; then
    echo "❌ ERROR: Missing $PKG_NAME/src/index.d.ts"
    EXIT_CODE=1
  else
    echo "✅ $PKG_NAME: declarations found in src/"
  fi
done

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ All packages have properly structured TypeScript declarations"
fi

exit $EXIT_CODE
