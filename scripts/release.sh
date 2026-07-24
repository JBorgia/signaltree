#!/bin/bash

# SignalTree Modular Release Script
# Handles version bumping, building, tagging, and publishing for all packages

set -euo pipefail # Exit on any error, fail on unset variables

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    print_error "This script must be run from the workspace root (where packages/ folder exists)"
    exit 1
fi

# List of packages to release
# Note: batching, middleware, entities, devtools, time-travel, serialization
# were consolidated into @signaltree/core in v4.0.0 and are no longer separate packages
# Note: memoization & presets were removed entirely in v10.0.0
# Note: "shared" is private (bundled into core) and should NOT be in this list
PACKAGES=(
    "core"            # Main package with all enhancers (batching, devtools, etc.)
    "events"          # Event-driven architecture (BullMQ, NestJS, testing)
    "ng-forms"        # Angular forms integration
    "realtime"        # Real-time sync with Supabase/WebSocket
    "callable-syntax" # Build-time transform for callable DX syntax
    "enterprise"      # Enterprise-grade optimizations for large-scale apps
    "guardrails"      # Dev-only performance guardrails (Rollup build)
    "schema"          # Schema-driven validation via StandardSchema (Zod, Valibot, …)
)

# Parse command line arguments
RELEASE_TYPE=${1:-patch}
SKIP_TESTS=${2:-false}
NON_INTERACTIVE=false
KEEP_VERSION=false
NPM_TOKEN=${NPM_TOKEN:-} # Automation token for 2FA bypass

# Track whether we have entered the publishing phase.
# If the user interrupts (Ctrl+C) during publish, we should NOT auto-rollback
# versions/commits because we may have already published some packages.
PUBLISH_STARTED=false
BACKUP_DIR=".release_backup"

backup_file() {
    local file_path="$1"
    if [ -f "$file_path" ]; then
        mkdir -p "$BACKUP_DIR/$(dirname "$file_path")"
        cp "$file_path" "$BACKUP_DIR/$file_path"
    fi
}

restore_file() {
    local file_path="$1"
    local backup_path="$BACKUP_DIR/$file_path"
    if [ -f "$backup_path" ]; then
        mkdir -p "$(dirname "$file_path")"
        cp "$backup_path" "$file_path"
        print_step "Restored $file_path"
    fi
}

if [[ "$*" == *"--yes"* ]] || [[ "$*" == *"-y"* ]]; then
    NON_INTERACTIVE=true
fi
if [[ "$*" == *"--keep-version"* ]]; then
    KEEP_VERSION=true
fi

if [[ ! "$RELEASE_TYPE" =~ ^(major|minor|patch)$ ]]; then
    print_error "Invalid release type. Use: major, minor, or patch"
    echo "Usage: $0 [major|minor|patch] [skip-tests] [--yes] [--keep-version]"
    echo ""
    echo "  skip-tests  Skips ONLY the slow steps (unit tests, coverage, benchmarks)."
    echo "              ALL correctness gates still run: builds, barrel + export"
    echo "              parity, tarball-consumer, taught-symbols, version-claims,"
    echo "              guardrails-exports, size gates, changelog gate."
    echo "              There is no flag that skips the correctness gates."
    exit 1
fi

print_step "Starting modular release process with type: $RELEASE_TYPE"

on_interrupt() {
    print_error "Release interrupted"
    if [ "$PUBLISH_STARTED" = false ]; then
        rollback_versions
    else
        print_error "Interrupted during npm publish; not rolling back versions automatically"
        print_error "Some packages may already be published. Re-run publish or reconcile manually."
    fi
    exit 130
}

trap on_interrupt INT TERM

# ORDERING NOTE (RFC 0004 v12-audit intake, 2026-07-24):
# This script BUMPS the version and FINALIZES the changelog BEFORE running the
# comprehensive pre-publish validation (moved down, just above the build step).
# Validation must see exactly what ships — package.json == CHANGELOG ==
# NEW_VERSION — so the release-state gate validates the shipped version instead
# of the pre-bump one. See the big comment block above the validation call
# below for the full rationale.

# Get current workspace version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_step "Current workspace version: $CURRENT_VERSION"

# Calculate new version
case $RELEASE_TYPE in
    major)
        NEW_VERSION=$(node -p "
            const v = '$CURRENT_VERSION'.split('.');
            \`\${parseInt(v[0]) + 1}.0.0\`
        ")
        ;;
    minor)
        NEW_VERSION=$(node -p "
            const v = '$CURRENT_VERSION'.split('.');
            \`\${v[0]}.\${parseInt(v[1]) + 1}.0\`
        ")
        ;;
    patch)
        NEW_VERSION=$(node -p "
            const v = '$CURRENT_VERSION'.split('.');
            \`\${v[0]}.\${v[1]}.\${parseInt(v[2]) + 1}\`
        ")
        ;;
esac

if [ "$KEEP_VERSION" = true ]; then
    NEW_VERSION=$CURRENT_VERSION
    print_step "Keep-version enabled: will publish current version $NEW_VERSION"
else
    print_step "New version will be: $NEW_VERSION"
fi

# Preflight: refuse to publish a version CHANGELOG.md does not document.
# Blocking, no skip path (RFC 0004 §4 step 6 — gates survive here only when
# they sit on the publish path). Self-test first: a gate that cannot fail is
# presumed inert (§5 rule 2).
print_step "Checking CHANGELOG.md has an entry for $NEW_VERSION..."
if ! bash scripts/verify-changelog-entry.sh --self-test; then
    print_error "CHANGELOG gate self-test failed — refusing to trust the gate"
    exit 1
fi
if ! bash scripts/verify-changelog-entry.sh "$NEW_VERSION"; then
    print_error "CHANGELOG.md lacks a heading for $NEW_VERSION — document the release first"
    exit 1
fi

# Confirm with user (unless non-interactive)
if [ "$NON_INTERACTIVE" = false ]; then
    echo -e "${YELLOW}Continue with modular release $CURRENT_VERSION → $NEW_VERSION (keep-version=${KEEP_VERSION})? (y/N)${NC}"
    read -r CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        print_warning "Release cancelled"
        exit 0
    fi
else
    print_step "Non-interactive mode: proceeding without confirmation"
fi

# Step 1: Backup original versions (for rollback if needed)
print_step "Creating version backup for rollback capability..."

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Provenance token for pre-publish-validation.sh's clean-tree exception.
# The validator relaxes its strict clean-tree gate (to tolerate the release
# bump's expected dirty files) ONLY when the RELEASE_IN_PROGRESS_TOKEN it
# receives matches this per-run secret written into the release-owned backup
# dir. A stray `export RELEASE_IN_PROGRESS=1` in a dev shell has no matching
# token file, so it can no longer loosen the gate on a manual `npm run validate`.
# The token lives inside $BACKUP_DIR, so it is removed by the same rollback /
# success cleanup that clears the backup dir.
RELEASE_IN_PROGRESS_TOKEN="$(openssl rand -hex 16 2>/dev/null || echo "${RANDOM}${RANDOM}${RANDOM}$(date +%s)")"
printf '%s' "$RELEASE_IN_PROGRESS_TOKEN" > "$BACKUP_DIR/.release-token"
export RELEASE_IN_PROGRESS_TOKEN

# Backup workspace manifest, changelog, and generated demo version files as-is.
# CHANGELOG.md is in the set because the finalize step (below) rewrites its top
# heading after the bump; a post-bump validation failure must revert it too.
backup_file "package.json"
backup_file "CHANGELOG.md"
backup_file "apps/demo/src/app/version.ts"
backup_file "apps/demo/src/app/library-versions.ts"

# Backup each publishable package manifest exactly as-is
for package in "${PACKAGES[@]}"; do
    PACKAGE_JSON="./packages/$package/package.json"
    if [ -f "$PACKAGE_JSON" ]; then
        backup_file "$PACKAGE_JSON"
    fi
done

print_success "Version backup created"

# Rollback function
rollback_versions() {
    print_error "Rolling back version changes..."

    if [ -d "$BACKUP_DIR" ]; then
        restore_file "package.json"

        # Revert the changelog finalization (dated heading → back to Unreleased)
        restore_file "CHANGELOG.md"

        # Restore each package manifest exactly, including original dependency ranges
        for package in "${PACKAGES[@]}"; do
            PACKAGE_JSON="./packages/$package/package.json"
            restore_file "$PACKAGE_JSON"
        done

        # Restore generated demo version files exactly
        restore_file "apps/demo/src/app/version.ts"
        restore_file "apps/demo/src/app/library-versions.ts"

        # Clean up build artifacts
        print_step "Cleaning up build artifacts..."
        rm -rf dist/packages 2>/dev/null || true
        for package in "${PACKAGES[@]}"; do
            rm -rf "packages/$package/dist" 2>/dev/null || true
        done

        # Delete the git tag if it was created
        if [ -n "$NEW_VERSION" ]; then
            print_step "Removing git tag v$NEW_VERSION..."
            git tag -d "v$NEW_VERSION" 2>/dev/null || true
            # Try to remove from remote if it was pushed
            git push origin --delete "v$NEW_VERSION" 2>/dev/null || true
        fi

        # Remove backup directory
        rm -rf "$BACKUP_DIR"

        print_success "Version rollback completed"
        print_error "Release failed - all changes have been reverted"
    else
        print_warning "No version backup found"
    fi
}

# Set up trap to rollback on failure (only before publishing starts)
on_error() {
    if [ "$PUBLISH_STARTED" = false ]; then
        rollback_versions
    else
        print_error "Release failed during npm publish; not rolling back versions automatically"
        print_error "Some packages may already be published. Resolve manually and re-run with --keep-version."
    fi
}

trap on_error ERR

# Step 2: Update versions in all package.json files
if [ "$KEEP_VERSION" = true ]; then
    print_step "Skipping version bump (--keep-version)"
else
    print_step "Updating versions in all packages..."
fi

# Update workspace version
if [ "$KEEP_VERSION" != true ]; then
    node -p "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        pkg.version = '$NEW_VERSION';
        fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
        'Workspace version updated successfully'
    "
fi

# Update each package version and dependencies
for package in "${PACKAGES[@]}"; do
    PACKAGE_JSON="./packages/$package/package.json"
    if [ -f "$PACKAGE_JSON" ]; then
        print_step "Updating version for @signaltree/$package..."
                node -p "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
                        if ('$KEEP_VERSION' !== 'true') {
                            pkg.version = '$NEW_VERSION';
                        }

            // Update peer dependencies to use specific versions for other @signaltree packages
            if (pkg.peerDependencies) {
                Object.keys(pkg.peerDependencies).forEach(dep => {
                    if (dep.startsWith('@signaltree/') && pkg.peerDependencies[dep] === '*') {
                        pkg.peerDependencies[dep] = '^' + '$NEW_VERSION';
                    }
                });
            }

            // Update dependencies if any
            if (pkg.dependencies) {
                Object.keys(pkg.dependencies).forEach(dep => {
                    if (dep.startsWith('@signaltree/') && pkg.dependencies[dep] === '*') {
                        pkg.dependencies[dep] = '^' + '$NEW_VERSION';
                    }
                });
            }

            fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
            'Package $package version and dependencies updated successfully'
        "
    else
        print_warning "Package.json not found for $package"
    fi
done

# Keep the demo app version banner in sync with the package versions.
# This file is tracked in git and must be included in the release commit.
if [ -f "tools/generate-version-env.cjs" ]; then
    print_step "Updating demo version constants..."
    node tools/generate-version-env.cjs
fi

# Step 2.5: Finalize the CHANGELOG for the version being shipped.
# Rewrites the top "## Unreleased ($NEW_VERSION)" / bare "## Unreleased" heading
# into a dated "## $NEW_VERSION (YYYY-MM-DD)" heading. Idempotent (a heading
# already dated for this version is left as-is) and fails loudly if the top
# heading documents no release for $NEW_VERSION — we must never publish an
# undocumented version. Skipped for --keep-version (republish of an
# already-dated version). This runs BEFORE validation so the release-state gate
# (in pre-publish-validation.sh) sees package.json == CHANGELOG == $NEW_VERSION
# — the whole point of the bump-then-finalize-then-validate ordering.
if [ "$KEEP_VERSION" = true ]; then
    print_step "Skipping changelog finalize (--keep-version): heading already dated"
else
    print_step "Finalizing CHANGELOG heading for $NEW_VERSION..."
    if node scripts/finalize-changelog.mjs "$NEW_VERSION" --date "$(date +%Y-%m-%d)"; then
        print_success "CHANGELOG finalized for $NEW_VERSION"
    else
        print_error "Failed to finalize CHANGELOG for $NEW_VERSION"
        print_error "The top CHANGELOG heading must document $NEW_VERSION before release"
        rollback_versions
        exit 1
    fi
fi

# Step 2.6: Run comprehensive pre-publish validation — AFTER the bump + finalize
# so it validates exactly what ships (package.json == CHANGELOG == NEW_VERSION).
# This used to run FIRST, before the bump; that let the release-state gate pass
# against the OLD version while the changelog still said "Unreleased
# (NEW_VERSION)", and nothing ever dated the heading — so the shipped version
# went out labeled "Unreleased" and main went red on the next validate (the
# exact class the release-state gate exists to catch). Reordered 2026-07-24.
#
# RELEASE_IN_PROGRESS=1 tells pre-publish-validation.sh's clean-working-tree
# check that the bump + finalize edits (package.json, packages/*/package.json,
# CHANGELOG.md, demo version constants) are EXPECTED and uncommitted at this
# point — the file-backup rollback above owns reverting them. Any OTHER dirty
# path still blocks. If validation fails here, the ERR trap runs
# rollback_versions, which restores every bumped manifest AND the changelog.
#
# skip-tests does NOT bypass validation (RFC 0004 §5). It sets FAST_VALIDATE=1,
# which skips ONLY the slow steps (unit tests, coverage, benchmarks); every
# correctness gate (builds, barrel + export parity, tarball-consumer,
# taught-symbols, version-claims, guardrails-exports, size gates, release-state,
# skill code-block lint) still runs and still blocks the release.
print_step "Running comprehensive pre-publish validation (post-bump, validates what ships)..."
if [ "$SKIP_TESTS" != "skip-tests" ]; then
    if RELEASE_IN_PROGRESS=1 RELEASE_IN_PROGRESS_TOKEN="$RELEASE_IN_PROGRESS_TOKEN" bash scripts/pre-publish-validation.sh; then
        print_success "Pre-publish validation passed"
    else
        print_error "Pre-publish validation failed!"
        print_error "Please fix the errors above before proceeding with the release"
        rollback_versions
        exit 1
    fi
else
    print_warning "skip-tests: running FAST validation (unit tests, coverage, benchmarks skipped)"
    print_warning "ALL correctness gates still run and still block the release"
    if RELEASE_IN_PROGRESS=1 RELEASE_IN_PROGRESS_TOKEN="$RELEASE_IN_PROGRESS_TOKEN" FAST_VALIDATE=1 bash scripts/pre-publish-validation.sh; then
        print_success "Fast pre-publish validation passed (slow steps skipped, all gates enforced)"
    else
        print_error "Pre-publish validation failed!"
        print_error "skip-tests only skips slow steps — a failed correctness gate always blocks"
        rollback_versions
        exit 1
    fi
fi

# Step 3: Build all packages
print_step "Building all packages..."

# Build packages in dependency order to ensure proper resolution
# Core first, then everything else
print_step "Building @signaltree/core first..."
npx nx build core --configuration=production || {
    print_error "Core package build failed! Rolling back version changes."
    rollback_versions
    exit 1
}
print_success "Core package built successfully"

# Build remaining packages that depend on core
REMAINING_PACKAGES=()
for package in "${PACKAGES[@]}"; do
    if [ "$package" != "core" ]; then
        REMAINING_PACKAGES+=("$package")
    fi
done

if [ ${#REMAINING_PACKAGES[@]} -gt 0 ]; then
    print_step "Building remaining Nx packages..."
    REMAINING_LIST=$(IFS=,; echo "${REMAINING_PACKAGES[*]}")
    npx nx run-many -t build --projects=$REMAINING_LIST --configuration=production
fi

print_success "Package builds completed"

# Copy AI-discoverability priming surfaces into the core tarball so that
# `node_modules/@signaltree/core/llms.txt` exists for retrieval-aware AI agents
# without requiring a separate web/GitHub fetch. The +42pp lift we measure
# only fires when llms.txt is in the agent's context — shipping it via npm
# install reaches every user automatically.
if [ -f "apps/demo/public/llms.txt" ] && [ -d "dist/packages/core" ]; then
    print_step "Copying llms.txt + llms-full.txt into @signaltree/core tarball..."
    cp apps/demo/public/llms.txt dist/packages/core/llms.txt
    cp apps/demo/public/llms-full.txt dist/packages/core/llms-full.txt
    print_success "AI priming surfaces shipped with @signaltree/core"
fi

# Preflight: ensure all publishable dist folders exist BEFORE publishing anything.
print_step "Verifying dist outputs exist for all packages (fail-fast)..."
for package in "${PACKAGES[@]}"; do
    DIST_PATH="./dist/packages/$package"
    if [ ! -d "$DIST_PATH" ]; then
        print_error "Dist folder not found for $package at $DIST_PATH"
        print_error "Aborting before publish to avoid partial releases"
        # Explicit exit doesn't fire the ERR trap; roll back the bump +
        # finalized changelog so a dist-preflight bail never leaves the tree
        # bumped (the reorder now also dirties CHANGELOG.md by this point).
        rollback_versions
        exit 1
    fi
    if [ ! -f "$DIST_PATH/package.json" ]; then
        print_error "package.json not found in $DIST_PATH"
        print_error "Aborting before publish to avoid partial releases"
        rollback_versions
        exit 1
    fi
done
print_success "All dist outputs present"

# Preflight 2: resolve the pnpm `workspace:` protocol in published dist manifests.
# We publish with `npm publish` (below), which — unlike `pnpm publish` — does NOT
# rewrite `workspace:*` specs. Shipping a literal `workspace:*` breaks installs
# (hard-fail in `dependencies`, warn + tooling breakage in `peerDependencies`).
# Rewrite any @signaltree/* spec that is `workspace:*`/`workspace:^`/`workspace:~`
# or a bare `*` to `^NEW_VERSION` in the dist package.json before publishing.
print_step "Resolving workspace:* / * specs in dist manifests to ^$NEW_VERSION..."
for package in "${PACKAGES[@]}"; do
    DIST_PKG="./dist/packages/$package/package.json"
    [ -f "$DIST_PKG" ] || continue
    node -e "
        const fs = require('fs');
        const p = '$DIST_PKG';
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        const ver = '^' + '$NEW_VERSION';
        let changed = false;
        const fix = (deps) => {
            if (!deps) return;
            for (const k of Object.keys(deps)) {
                if (!k.startsWith('@signaltree/')) continue;
                const v = deps[k];
                if (v === '*' || (typeof v === 'string' && v.startsWith('workspace:'))) {
                    deps[k] = ver;
                    changed = true;
                }
            }
        };
        fix(j.dependencies); fix(j.peerDependencies); fix(j.optionalDependencies);
        if (changed) {
            fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
            console.log('  resolved @signaltree/* specs in ' + p + ' -> ' + ver);
        }
    "
done
print_success "Workspace specs resolved in dist manifests"

# Step 4: Commit changes
print_step "Committing version changes (if any)..."
git add package.json packages/*/package.json
# Include the finalized changelog (top heading dated by the finalize step).
git add CHANGELOG.md
if [ -f "apps/demo/src/app/version.ts" ]; then
    git add apps/demo/src/app/version.ts
fi
if [ -f "apps/demo/src/app/library-versions.ts" ]; then
    git add apps/demo/src/app/library-versions.ts
fi
if [ "$KEEP_VERSION" = true ]; then
    git commit -m "chore(release): publish $NEW_VERSION (no version bump)" || {
        print_warning "Nothing to commit (no changes for keep-version)"
    }
else
    git commit -m "chore: bump all packages to version $NEW_VERSION" || {
        print_warning "Nothing to commit (versions might already be updated)"
    }
fi

# Step 4.5: Create signed tag and verify signature BEFORE publish.
# Tag creation must happen pre-publish so signature verification can gate the
# publish step. The tag is still considered part of the pre-publish phase, so
# any failure here will trigger the existing rollback (which also deletes the
# tag). Idempotent: reuse an existing local tag if one is present.
TAG_CREATED=0
TAG_NAME="v$NEW_VERSION"
print_step "Creating signed git tag $TAG_NAME (idempotent)..."
if git rev-parse -q --verify "refs/tags/$TAG_NAME" >/dev/null; then
    print_warning "Tag $TAG_NAME already exists locally; skipping tag creation"
else
    if git tag -s -m "Release $TAG_NAME" "$TAG_NAME"; then
        TAG_CREATED=1
        print_success "Created signed tag $TAG_NAME"
    else
        print_error "Failed to create signed tag $TAG_NAME"
        print_error "Ensure your GPG/SSH signing key is configured (see RELEASE_PROCESS.md)"
        exit 1
    fi
fi

print_step "Verifying signature on tag $TAG_NAME..."
if ! git tag -v "$TAG_NAME" >/dev/null 2>&1; then
    print_error "Signature verification failed for tag $TAG_NAME"
    print_error "Aborting release; see RELEASE_PROCESS.md for signing setup"
    exit 1
fi
print_success "Tag $TAG_NAME signature verified"

# Step 5: Publish all packages to npm (AFTER tag is created and verified)
print_step "Publishing all packages to npm..."

PUBLISH_STARTED=true

PUBLISHED_PACKAGES=()
FAILED_PACKAGES=()

# Authentication: prefer NPM_TOKEN (automation token) to bypass OTP; otherwise use web login
if [ -n "$NPM_TOKEN" ]; then
    print_step "Using NPM_TOKEN for npm authentication"
    echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc.signaltree-temp
else
    if npm whoami >/dev/null 2>&1; then
        print_step "Using existing npm authentication"
    else
        print_step "Performing npm authentication (browser-based for 2FA)..."
        npm login --auth-type=web
    fi
fi

for package in "${PACKAGES[@]}"; do
    DIST_PATH="./dist/packages/$package"
    if [ -d "$DIST_PATH" ]; then
        print_step "Publishing @signaltree/$package..."
        cd "$DIST_PATH"

        # Check if package.json exists in dist
        if [ ! -f "package.json" ]; then
            print_warning "package.json not found in $DIST_PATH, skipping..."
            FAILED_PACKAGES+=("$package")
            cd - > /dev/null
            continue
        fi

        # Attempt publish with retry on authentication failure
        PUBLISH_SUCCESS=false
        for attempt in 1 2; do
            PUBLISH_CMD="npm publish --access public"
            # Provenance is only supported on trusted CI providers (e.g. GitHub Actions).
            # Enable it automatically when running on CI; skip for local publishes.
            if [ -n "${GITHUB_ACTIONS:-}" ] || [ "${NPM_CONFIG_PROVENANCE:-}" = "true" ]; then
                PUBLISH_CMD="$PUBLISH_CMD --provenance"
            fi
            if [ -n "${NPM_TOKEN:-}" ]; then
                PUBLISH_CMD="$PUBLISH_CMD --userconfig ~/.npmrc.signaltree-temp"
            fi

            # With `set -e` + `pipefail`, a failing publish would abort the script
            # before we can inspect the output. Also, `trap ERR` would fire even for
            # expected publish failures (already published, OTP expiration, etc.).
            # Temporarily disable both while we capture output and handle failures explicitly.
            trap - ERR
            set +e
            $PUBLISH_CMD 2>&1 | tee /tmp/npm_publish_$package.log
            PUBLISH_EXIT_CODE=${PIPESTATUS[0]}
            set -e
            trap on_error ERR

            if [ $PUBLISH_EXIT_CODE -eq 0 ]; then
                print_success "Published @signaltree/$package successfully"
                PUBLISHED_PACKAGES+=("$package")
                PUBLISH_SUCCESS=true
                break
            fi

            # Publish failed - check the log file (give it a moment to flush)
            sleep 0.1

            # Check if it's a "cannot publish over existing version" error
            if grep -q "cannot publish over the previously published versions" /tmp/npm_publish_$package.log 2>/dev/null; then
                print_warning "@signaltree/$package@$NEW_VERSION already published, skipping..."
                PUBLISHED_PACKAGES+=("$package")
                PUBLISH_SUCCESS=true
                break
            # Check if it's an OTP error
            elif grep -qE "EOTP|one-time password" /tmp/npm_publish_$package.log 2>/dev/null; then
                if [ $attempt -eq 1 ]; then
                    print_error "2FA token expired. Re-logging in..."
                    npm login --auth-type=web
                    print_step "Retrying publish for @signaltree/$package..."
                    continue  # Retry with fresh auth
                else
                    print_error "npm publish failed for @signaltree/$package after re-authentication!"
                    FAILED_PACKAGES+=("$package")
                    break
                fi
            # Check for other authentication errors (E401, etc.)
            elif grep -qE "E401|authentication" /tmp/npm_publish_$package.log 2>/dev/null; then
                if [ $attempt -eq 1 ]; then
                    print_warning "Authentication error. Re-logging in..."
                    npm login --auth-type=web
                    print_step "Retrying publish for @signaltree/$package..."
                    continue
                else
                    print_error "npm publish failed for @signaltree/$package after re-authentication!"
                    FAILED_PACKAGES+=("$package")
                    break
                fi
            else
                print_error "npm publish failed for @signaltree/$package! (Exit code: $PUBLISH_EXIT_CODE)"
                cat /tmp/npm_publish_$package.log | tail -10
                FAILED_PACKAGES+=("$package")
                break
            fi
        done

        cd - > /dev/null
        rm -f /tmp/npm_publish_$package.log
    else
        print_error "Dist folder not found for $package at $DIST_PATH"
        FAILED_PACKAGES+=("$package")
    fi
done

# Summary
echo ""
if [ ${#PUBLISHED_PACKAGES[@]} -gt 0 ]; then
    print_success "Successfully published ${#PUBLISHED_PACKAGES[@]} package(s)"
fi
if [ ${#FAILED_PACKAGES[@]} -gt 0 ]; then
    print_warning "Failed or skipped ${#FAILED_PACKAGES[@]} package(s): ${FAILED_PACKAGES[*]}"
    print_warning "Publishing aborted; will not create or push git tags"
    rollback_versions
    exit 1
fi

# Step 6: Push tag (tag was created and verified pre-publish)
# Pushing must NEVER roll back versions after a successful publish.

# Determine current branch and push to it (safer than hardcoding 'main')
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD || echo "main")
print_step "Pushing changes to GitHub (branch: $CURRENT_BRANCH)..."
if ! git push origin "$CURRENT_BRANCH"; then
    print_warning "Failed to push changes to GitHub. Please push manually: git push origin $CURRENT_BRANCH"
fi

if [ "$TAG_CREATED" -eq 1 ]; then
    print_step "Pushing tag $TAG_NAME to GitHub..."
    if git push origin "$TAG_NAME"; then
        print_success "Tag $TAG_NAME pushed to GitHub"
    else
        print_warning "Failed to push tag $TAG_NAME. It may already exist remotely."
        print_warning "If needed, recreate or move the tag manually: git tag -d $TAG_NAME && git tag -s -m \"Release $TAG_NAME\" $TAG_NAME && git push origin $TAG_NAME --force"
    fi
else
    print_warning "Skipping tag push because tag was not created in this run."
fi

# Step 7: Clean up backup files and temporary npm credentials (release succeeded)
rm -rf "$BACKUP_DIR"
if [ -n "$NPM_TOKEN" ]; then
    rm -f ~/.npmrc.signaltree-temp
    print_step "Cleaned up temporary npm credentials"
fi
# Disable trap now that we've succeeded
trap - ERR INT TERM

# Step 8: Check GitHub Actions
print_step "GitHub Actions should now create a release automatically"
print_step "Check: https://github.com/JBorgia/signaltree/actions"

# Final success message
echo ""
print_success "🎉 Modular release $NEW_VERSION completed successfully!"
echo ""
print_step "Published packages:"
for package in "${PACKAGES[@]}"; do
    echo -e "${GREEN}📦 @signaltree/$package@$NEW_VERSION${NC}"
done
echo ""
echo -e "${GREEN}🏷️  GitHub: https://github.com/JBorgia/signaltree/releases/tag/v$NEW_VERSION${NC}"
echo ""
