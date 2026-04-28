#!/usr/bin/env bash
# verify-signaltree-migration.sh
# Verifies a SignalTree migration is complete by checking the legacy package's
# fingerprint is gone from source AND from package.json, then runs the build /
# test / lint gates. Optionally commits.
#
# Works on any @ngrx/signals app regardless of layout, package manager, or
# naming convention — it does not look at file paths or class names; it only
# verifies the package's fingerprint is gone.
#
# Usage:
#   scripts/verify-signaltree-migration.sh \
#     --src    src/app \
#     --build  "pnpm nx build trax-mobile" \
#     --test   "pnpm nx test trax-mobile" \
#     --lint   "pnpm nx lint trax-mobile" \
#     [--package @ngrx/signals]                  # repeatable; default: @ngrx/signals
#     [--allow-dep-presence]                     # don't fail if package still in package.json
#     [--package-json package.json]              # default: ./package.json
#     [--commit "feat: migrate to SignalTree"]
#     [--dry-run]                                # print what would run, exit 0
#
# Verification (must all be empty / absent):
#   1. grep -rln "from '<pkg>'" <src>/                  — no source imports
#   2. grep -rln 'signalStore(' <src>/                  — no factory calls
#                                                         (only checked if --package contains @ngrx/signals)
#   3. <pkg> not in package.json dependencies / peerDependencies
#      (devDependencies allowed; --allow-dep-presence skips this entirely)
#
# Then runs --build, --test, --lint commands as provided. Fail-fast.
#
# Note on tee'd invocations: piping the script through `tee` will mask its
# exit code with tee's. Capture the real status via "${PIPESTATUS[0]}" in
# bash/zsh, or `set -o pipefail` in the calling shell.
#
# Required tools: bash 4+, git, grep, find, node (for package.json parsing).

set -euo pipefail

# Non-interactive defaults for downstream package-manager invocations.
export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"
export NX_DAEMON="${NX_DAEMON:-false}"
export CI="${CI:-true}"

# Preflight: node is required for the package.json check (Step 3). It is
# present in every JS project's dev environment but may not be on PATH if
# you're using nvm/asdf inside a non-login shell.
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' not found on PATH." >&2
  echo "  This script requires node to parse package.json. Activate your version manager" >&2
  echo "  (nvm/asdf/etc.) or prepend node's dir to PATH before invoking." >&2
  exit 127
fi

SRC=""
BUILD_CMD=""
TEST_CMD=""
LINT_CMD=""
COMMIT_MSG=""
PACKAGE_JSON="package.json"
ALLOW_DEP=0
DRY_RUN=0
PACKAGES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src)                 SRC="$2"; shift 2 ;;
    --build)               BUILD_CMD="$2"; shift 2 ;;
    --test)                TEST_CMD="$2"; shift 2 ;;
    --lint)                LINT_CMD="$2"; shift 2 ;;
    --package)             PACKAGES+=("$2"); shift 2 ;;
    --package-json)        PACKAGE_JSON="$2"; shift 2 ;;
    --allow-dep-presence)  ALLOW_DEP=1; shift ;;
    --commit)              COMMIT_MSG="$2"; shift 2 ;;
    --dry-run)             DRY_RUN=1; shift ;;
    -h|--help)             sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$SRC" || -z "$BUILD_CMD" || -z "$TEST_CMD" || -z "$LINT_CMD" ]]; then
  echo "Missing required args (--src, --build, --test, --lint). See --help." >&2
  exit 2
fi

if [[ ! -d "$SRC" ]]; then
  echo "Source dir not found: $SRC" >&2
  exit 2
fi

# Default to @ngrx/signals if no --package given.
if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  PACKAGES=("@ngrx/signals")
fi

echo "==> verify-signaltree-migration"
echo "    src:           $SRC"
echo "    packages:      ${PACKAGES[*]}"
echo "    package.json:  $PACKAGE_JSON"
echo "    build:         $BUILD_CMD"
echo "    test:          $TEST_CMD"
echo "    lint:          $LINT_CMD"
echo "    allow-dep:     $ALLOW_DEP"
echo "    dry-run:       $DRY_RUN"
echo

if [[ $DRY_RUN -eq 1 ]]; then
  echo "(dry-run: no checks will be executed)"
  exit 0
fi

fail=0

# --- 1. source-import fingerprint ----------------------------------------
echo "--- Step 1: source-import fingerprint (must be empty)"
step_fail=0
for pkg in "${PACKAGES[@]}"; do
  # grep returns 1 when no matches — turn that into success.
  if matches=$(grep -rln "from '${pkg}'" "$SRC" 2>/dev/null); then
    if [[ -n "$matches" ]]; then
      echo "  ✗ leftover \"from '${pkg}'\" imports in:"
      echo "$matches" | sed 's/^/      /'
      step_fail=1
    fi
  fi
  # Also catch double-quoted form.
  if matches=$(grep -rln "from \"${pkg}\"" "$SRC" 2>/dev/null); then
    if [[ -n "$matches" ]]; then
      echo "  ✗ leftover \"from \\\"${pkg}\\\"\" imports in:"
      echo "$matches" | sed 's/^/      /'
      step_fail=1
    fi
  fi
done
[[ $step_fail -eq 0 ]] && echo "  ✓ no source imports of: ${PACKAGES[*]}"
fail=$(( fail | step_fail ))
echo

# --- 2. signalStore() factory calls (only if @ngrx/signals targeted) -----
if printf '%s\n' "${PACKAGES[@]}" | grep -qx '@ngrx/signals'; then
  echo "--- Step 2: no signalStore() factory calls (must be empty)"
  step_fail=0
  if matches=$(grep -rln 'signalStore(' "$SRC" 2>/dev/null); then
    if [[ -n "$matches" ]]; then
      echo "  ✗ leftover signalStore( calls in:"
      echo "$matches" | sed 's/^/      /'
      step_fail=1
    fi
  fi
  [[ $step_fail -eq 0 ]] && echo "  ✓ no signalStore( calls"
  fail=$(( fail | step_fail ))
  echo
fi

# --- 3. package.json dependency check ------------------------------------
if [[ $ALLOW_DEP -eq 1 ]]; then
  echo "--- Step 3: package.json check SKIPPED (--allow-dep-presence)"
else
  echo "--- Step 3: package.json (no legacy package in dependencies / peerDependencies)"
  step_fail=0
  if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "  ✗ package.json not found: $PACKAGE_JSON" >&2
    step_fail=1
  else
    for pkg in "${PACKAGES[@]}"; do
      # node script returns the offending key ("dependencies" / "peerDependencies") or empty.
      # We deliberately do NOT swallow node's stderr here — a parse error or
      # missing node should be loud, not a silent false negative.
      offending=$(node -e "
        const fs = require('fs');
        const p = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
        const hits = [];
        for (const key of ['dependencies', 'peerDependencies']) {
          if (p[key] && p[key]['$pkg']) hits.push(key + ' (' + p[key]['$pkg'] + ')');
        }
        process.stdout.write(hits.join(', '));
      ")
      if [[ -n "$offending" ]]; then
        echo "  ✗ '${pkg}' still listed in $PACKAGE_JSON: $offending"
        echo "      Remove it, or pass --allow-dep-presence if other apps in this repo still need it."
        step_fail=1
      fi
    done
  fi
  [[ $step_fail -eq 0 ]] && echo "  ✓ no legacy packages in dependencies / peerDependencies"
  fail=$(( fail | step_fail ))
  echo
fi

if [[ $fail -ne 0 ]]; then
  echo "Verification FAILED. Fix the leftovers above and re-run." >&2
  exit 1
fi

# --- 4. gates -------------------------------------------------------------
echo "--- Step 4: gates"
echo "    \$ $BUILD_CMD"
eval "$BUILD_CMD"
echo "    \$ $TEST_CMD"
eval "$TEST_CMD"
echo "    \$ $LINT_CMD"
eval "$LINT_CMD"
echo "  ✓ all gates green"
echo

# --- 5. commit (optional) -------------------------------------------------
if [[ -n "$COMMIT_MSG" ]]; then
  echo "--- Step 5: commit"
  git add -A
  git commit -m "$COMMIT_MSG"
  git --no-pager log --oneline -1
fi

echo
echo "==> verify-signaltree-migration: DONE"
