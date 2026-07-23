#!/bin/bash

# CHANGELOG-entry gate (RFC 0004 §4 step 6 / §3 V-P6)
# ====================================================
# Refuses a release when CHANGELOG.md has no heading containing the version
# about to be published. Called by scripts/release.sh after NEW_VERSION is
# resolved; standalone so its failure mode is independently testable.
#
# Usage:
#   bash scripts/verify-changelog-entry.sh <version>       # gate
#   bash scripts/verify-changelog-entry.sh --self-test     # negative test:
#       proves the gate fails for a version with no heading and passes for a
#       version that has one (RFC 0004 §5 rule 2).
#
# A "heading containing the version" is any markdown heading line whose text
# includes the bare version as a token, e.g.:
#   ## 11.5.2 / 11.5.3 (2026-07-22)     -> matches 11.5.2 and 11.5.3
#   ## v11.6.0                          -> matches 11.6.0
#
# Exit codes: 0 = pass, 1 = missing entry / self-test failure, 2 = usage.

set -euo pipefail

cd "$(dirname "$0")/.."

CHANGELOG="CHANGELOG.md"

has_entry() {
    local version="$1"
    local escaped="${version//./\\.}"
    grep -qE "^#{1,6} (.*[^0-9.])?${escaped}([^0-9.]|$)" "$CHANGELOG"
}

if [ "${1:-}" = "--self-test" ]; then
    echo "🧪 verify-changelog-entry --self-test (negative test, RFC 0004 §5 rule 2)"
    FAILED=0

    # Must FAIL on a version that has no heading.
    if has_entry "99.99.99"; then
        echo "  ❌ self-test FAILED: gate passed a version with no CHANGELOG heading"
        FAILED=1
    else
        echo "  ✅ self-test: gate refuses a version with no CHANGELOG heading"
    fi

    # Must PASS on a version that demonstrably has a heading (take the first
    # version-looking token from an existing heading).
    KNOWN=$(grep -oE "^#{1,6} .*" "$CHANGELOG" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1 || true)
    if [ -z "$KNOWN" ]; then
        echo "  ❌ self-test FAILED: no versioned heading found in $CHANGELOG at all"
        FAILED=1
    elif has_entry "$KNOWN"; then
        echo "  ✅ self-test: gate accepts existing entry ($KNOWN)"
    else
        echo "  ❌ self-test FAILED: gate rejected existing entry ($KNOWN)"
        FAILED=1
    fi

    if [ "$FAILED" -ne 0 ]; then
        echo "❌ SELF-TEST FAILED — the gate cannot be trusted"
        exit 1
    fi
    echo "✅ Self-test passed — gate demonstrably able to fail"
    exit 0
fi

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version> | --self-test" >&2
    exit 2
fi

if [ ! -f "$CHANGELOG" ]; then
    echo "❌ $CHANGELOG not found" >&2
    exit 1
fi

if has_entry "$VERSION"; then
    echo "✅ $CHANGELOG has a heading for $VERSION"
    exit 0
fi

echo "❌ $CHANGELOG has no heading containing $VERSION" >&2
echo "   Every published version must be documented before release" >&2
echo "   (RFC 0004 §4 step 6). Add a '## $VERSION (YYYY-MM-DD)' section." >&2
exit 1
