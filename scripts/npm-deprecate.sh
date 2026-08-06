#!/usr/bin/env bash
# Deprecate packages that are no longer supported.
#
# npm packages CANNOT be unpublished after 72 hours, so `npm deprecate` is the
# only way to tell an installer that a package is gone. It is a registry-side
# operation — it is NOT implied by deleting the package from this repo, and it
# needs auth, which is why it lives here rather than inside a publish script.
#
# Verified state at 14.0.0-rc.1 (`npm view <pkg> deprecated`):
#   @signaltree/callable-syntax@13.5.0  live, NOT deprecated  <- deleted in 14.0.0
#   @signaltree/enterprise@13.5.0       live, NOT deprecated  <- docs call it
#                                       deprecated since 13.5.0, npm never told
#
# Usage: NPM_TOKEN=... bash scripts/npm-deprecate.sh [--dry-run]
set -euo pipefail

DRY="${1:-}"
run() {
    if [ "$DRY" = "--dry-run" ]; then
        echo "DRY RUN: npm deprecate $*"
    else
        npm deprecate "$@"
    fi
}

echo "==> Deprecating @signaltree/callable-syntax (all versions)"
run "@signaltree/callable-syntax" \
    "DELETED in 14.0.0. The build transform could not run inside an Angular app at all, so tree.\$.leaf(value) type-checked and then silently did nothing. Write leaves with .set()/.update(); branches and the root stay callable. See https://github.com/JBorgia/signaltree/blob/main/CHANGELOG.md"

echo "==> Deprecating @signaltree/enterprise (all versions)"
run "@signaltree/enterprise" \
    "Deprecated since 13.5.0 — use tree.updateAndReport() in @signaltree/core. It is measurably slower than the core methods that replaced it and has an unfixed array data-loss defect."

echo
echo "Done. Verify with:"
echo "  npm view @signaltree/callable-syntax deprecated"
echo "  npm view @signaltree/enterprise deprecated"
