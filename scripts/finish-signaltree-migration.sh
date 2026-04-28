#!/usr/bin/env bash
# finish-signaltree-migration.sh
# Final-phase script for an @ngrx/signals → SignalTree big-bang migration.
# Deletes the legacy *.store.ts files for migrated domains, verifies via grep,
# and runs the build/test/lint gates.
#
# Usage:
#   scripts/finish-signaltree-migration.sh \
#     --app-src frontend/apps/trax-mobile/src \
#     --nx-project trax-mobile \
#     --pnpm-cwd frontend \
#     --domain feature-flag \
#     [--domain driver] \
#     [--commit "feat(trax-mobile): migrate feature-flag to SignalTree"]
#
# For each --domain X, deletes:
#   <app-src>/app/root-services/store/X.store.ts
#   <app-src>/app/root-services/store/X.store.spec.ts (if present)
#
# Then verifies inside <app-src>:
#   - no remaining "from '@ngrx/signals'" imports referencing migrated domains
#   - no remaining `inject(<Domain>Store)` references
#
# If --commit is provided, stages all changes and commits with that message.
# Exits non-zero on any verification or gate failure. Safe to re-run.
#
# Note on tee'd invocations: piping the script through `tee` will mask its
# exit code with tee's. Capture the real status via "${PIPESTATUS[0]}" in
# bash/zsh, or `set -o pipefail` in the calling shell.
#
# Required tools: bash 4+, git, grep, find, pnpm.

set -euo pipefail

# Non-interactive defaults: corepack must not stall on download prompts;
# the Nx daemon's sqlite cleanup races on cold first-run and trips set -e
# even when the build itself succeeded; CI quiets noisy progress UIs.
export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"
export NX_DAEMON="${NX_DAEMON:-false}"
export CI="${CI:-true}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: 'pnpm' not found on PATH." >&2
  echo "  This script requires pnpm. Activate corepack (corepack enable) or install pnpm globally," >&2
  echo "  then re-run. If pnpm lives at a non-standard path, prepend its dir to PATH before invoking." >&2
  exit 127
fi

APP_SRC=""
NX_PROJECT=""
PNPM_CWD=""
COMMIT_MSG=""
DOMAINS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-src)    APP_SRC="$2"; shift 2 ;;
    --nx-project) NX_PROJECT="$2"; shift 2 ;;
    --pnpm-cwd)   PNPM_CWD="$2"; shift 2 ;;
    --domain)     DOMAINS+=("$2"); shift 2 ;;
    --commit)     COMMIT_MSG="$2"; shift 2 ;;
    -h|--help)    sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$APP_SRC" || -z "$NX_PROJECT" || -z "$PNPM_CWD" || ${#DOMAINS[@]} -eq 0 ]]; then
  echo "Missing required args. See --help." >&2
  exit 2
fi

if [[ ! -d "$APP_SRC" ]]; then
  echo "App source dir not found: $APP_SRC" >&2
  exit 2
fi

echo "==> finish-signaltree-migration"
echo "    app-src:    $APP_SRC"
echo "    nx-project: $NX_PROJECT"
echo "    pnpm-cwd:   $PNPM_CWD"
echo "    domains:    ${DOMAINS[*]}"
echo

# --- domain-name → PascalCase store class name ---------------------------
to_pascal() {
  echo "$1" | awk -F'-' '{for(i=1;i<=NF;i++) printf("%s%s", toupper(substr($i,1,1)), substr($i,2))}'
}

# --- 1. delete legacy stores --------------------------------------------
echo "--- Step 1: delete legacy *.store.ts for migrated domains"
for d in "${DOMAINS[@]}"; do
  store="$APP_SRC/app/root-services/store/${d}.store.ts"
  spec="$APP_SRC/app/root-services/store/${d}.store.spec.ts"
  for f in "$store" "$spec"; do
    if [[ -f "$f" ]]; then
      echo "    rm $f"
      rm "$f"
    fi
  done
done
echo

# --- 2. clean junk files --------------------------------------------------
echo "--- Step 2: remove junk files from app/store/"
if [[ -d "$APP_SRC/app/store" ]]; then
  find "$APP_SRC/app/store" \( -name '.DS_Store' -o -name '*.code-workspace' -o -name '.idea' \) -print -delete || true
fi
echo

# --- 3. verification greps ------------------------------------------------
echo "--- Step 3: verify deletion (all greps must return empty)"
fail=0

# 3a. No leftover legacy *.store.ts files for migrated domains.
for d in "${DOMAINS[@]}"; do
  if [[ -f "$APP_SRC/app/root-services/store/${d}.store.ts" ]]; then
    echo "  ✗ legacy file still exists: $APP_SRC/app/root-services/store/${d}.store.ts"
    fail=1
  fi
done

# 3b. No remaining `inject(<Domain>Store)` references in app code.
for d in "${DOMAINS[@]}"; do
  pascal="$(to_pascal "$d")Store"
  if matches=$(grep -rln "inject($pascal)" "$APP_SRC" 2>/dev/null); then
    if [[ -n "$matches" ]]; then
      echo "  ✗ leftover inject($pascal) in:"
      echo "$matches" | sed 's/^/      /'
      fail=1
    fi
  fi
done

# 3c. No remaining imports of the deleted store paths.
for d in "${DOMAINS[@]}"; do
  pattern="root-services/store/${d}\\.store"
  if matches=$(grep -rln "$pattern" "$APP_SRC" 2>/dev/null); then
    if [[ -n "$matches" ]]; then
      echo "  ✗ leftover import of '$pattern' in:"
      echo "$matches" | sed 's/^/      /'
      fail=1
    fi
  fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "Verification FAILED. Fix the leftover references above and re-run." >&2
  exit 1
fi
echo "  ✓ all greps clean"
echo

# --- 4. gates -------------------------------------------------------------
echo "--- Step 4: gates (build / test / lint)"
pushd "$PNPM_CWD" >/dev/null
echo "    pnpm nx build $NX_PROJECT"
pnpm nx build "$NX_PROJECT"
echo "    pnpm nx test $NX_PROJECT"
pnpm nx test "$NX_PROJECT"
echo "    pnpm nx lint $NX_PROJECT"
pnpm nx lint "$NX_PROJECT"
popd >/dev/null
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
echo "==> finish-signaltree-migration: DONE"
