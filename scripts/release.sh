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
# Note: batching, memoization, middleware, entities, devtools, time-travel, presets, serialization
# were consolidated into @signaltree/core in v4.0.0 and are no longer separate packages
# Order matters: types/utils must be published before packages that depend on them
# Note: "shared" is private (bundled into core) and should NOT be in this list
PACKAGES=(
    "types"           # Core TypeScript types (dependency of other packages)
    "utils"           # Utility functions (dependency of core)
    "core"            # Main package with all enhancers (batching, memoization, etc.)
    "ng-forms"        # Angular forms integration
    "callable-syntax" # Build-time transform for callable DX syntax
    "enterprise"      # Enterprise-grade optimizations for large-scale apps
    "guardrails"      # Dev-only performance guardrails (Rollup build)
)

# Parse command line arguments
RELEASE_TYPE=${1:-patch}
SKIP_TESTS=${2:-false}
NON_INTERACTIVE=false
KEEP_VERSION=false
NPM_TOKEN=${NPM_TOKEN:-} # Automation token for 2FA bypass

if [[ "$*" == *"--yes"* ]] || [[ "$*" == *"-y"* ]]; then
    NON_INTERACTIVE=true
fi
if [[ "$*" == *"--keep-version"* ]]; then
    KEEP_VERSION=true
fi

if [[ ! "$RELEASE_TYPE" =~ ^(major|minor|patch)$ ]]; then
    print_error "Invalid release type. Use: major, minor, or patch"
    echo "Usage: $0 [major|minor|patch] [skip-tests]"
    exit 1
fi

print_step "Starting modular release process with type: $RELEASE_TYPE"

# Step 0: Run comprehensive pre-publish validation
print_step "Running comprehensive pre-publish validation..."
if [ "$SKIP_TESTS" != "skip-tests" ]; then
    if bash scripts/pre-publish-validation.sh; then
        print_success "Pre-publish validation passed"
    else
        print_error "Pre-publish validation failed!"
        print_error "Please fix the errors above before proceeding with the release"
        exit 1
    fi
else
    print_warning "Skipping pre-publish validation (tests disabled)"
fi

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

# Backup workspace version
ORIGINAL_WORKSPACE_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('./package.json', 'utf8')).version")

# Create backup file for rollback
echo "ORIGINAL_WORKSPACE_VERSION=$ORIGINAL_WORKSPACE_VERSION" > .version_backup
echo "NEW_VERSION=$NEW_VERSION" >> .version_backup
echo "PACKAGES=(${PACKAGES[*]})" >> .version_backup

# Backup each package version
for package in "${PACKAGES[@]}"; do
    PACKAGE_JSON="./packages/$package/package.json"
    if [ -f "$PACKAGE_JSON" ]; then
        ORIGINAL_VERSION=$(node -p "JSON.parse(require('fs').readFileSync('$PACKAGE_JSON', 'utf8')).version")
        # Convert package name to uppercase using tr for compatibility
        PACKAGE_UPPER=$(echo "$package" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
        echo "ORIGINAL_${PACKAGE_UPPER}_VERSION=$ORIGINAL_VERSION" >> .version_backup
    fi
done

print_success "Version backup created"

# Rollback function
rollback_versions() {
    print_error "Rolling back version changes..."

    if [ -f ".version_backup" ]; then
        source .version_backup

        # Restore workspace version
        node -p "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
            pkg.version = '$ORIGINAL_WORKSPACE_VERSION';
            fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
            'Workspace version restored to $ORIGINAL_WORKSPACE_VERSION'
        "

        # Restore each package version
        for package in "${PACKAGES[@]}"; do
            PACKAGE_JSON="./packages/$package/package.json"
            if [ -f "$PACKAGE_JSON" ]; then
                # Convert package name to uppercase using tr for compatibility
                PACKAGE_UPPER=$(echo "$package" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
                VAR_NAME="ORIGINAL_${PACKAGE_UPPER}_VERSION"
                ORIGINAL_VERSION=${!VAR_NAME}
                if [ -n "$ORIGINAL_VERSION" ]; then
                    node -p "
                        const fs = require('fs');
                        const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
                        pkg.version = '$ORIGINAL_VERSION';

                        // Restore peer dependencies
                        if (pkg.peerDependencies) {
                            Object.keys(pkg.peerDependencies).forEach(dep => {
                                if (dep.startsWith('@signaltree/')) {
                                    pkg.peerDependencies[dep] = '*';
                                }
                            });
                        }

                        // Restore dependencies
                        if (pkg.dependencies) {
                            Object.keys(pkg.dependencies).forEach(dep => {
                                if (dep.startsWith('@signaltree/')) {
                                    pkg.dependencies[dep] = '*';
                                }
                            });
                        }

                        fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
                        'Package $package version restored to $ORIGINAL_VERSION'
                    "
                fi
            fi
        done

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

        # Clean up git changes
        git reset --hard HEAD 2>/dev/null || true

        # Remove backup file
        rm -f .version_backup

        print_success "Version rollback completed"
        print_error "Release failed - all changes have been reverted"
    else
        print_warning "No version backup found"
    fi
}

# Set up trap to rollback on failure
trap rollback_versions ERR

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
print_step "Running post-build step for @signaltree/core..."
npx nx run core:postbuild --skip-nx-cache || {
    print_error "Core package post-build failed! Rolling back version changes."
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
    npx nx run-many -t build --projects=$REMAINING_LIST --configuration=production || {
        print_warning "Some dependent packages failed to build, but continuing with core..."
        print_warning "Failed packages will be skipped during publish"
    }
fi

print_success "Package builds completed"

# Step 4: Commit changes
print_step "Committing version changes (if any)..."
git add package.json packages/*/package.json
if [ "$KEEP_VERSION" = true ]; then
    git commit -m "chore(release): publish $NEW_VERSION (no version bump)" || {
        print_warning "Nothing to commit (no changes for keep-version)"
    }
else
    git commit -m "chore: bump all packages to version $NEW_VERSION" || {
        print_warning "Nothing to commit (versions might already be updated)"
    }
fi

# Step 5: Publish all packages to npm (BEFORE tagging/pushing)
print_step "Publishing all packages to npm..."

PUBLISHED_PACKAGES=()
FAILED_PACKAGES=()

# Authentication: prefer NPM_TOKEN (automation token) to bypass OTP; otherwise use web login
if [ -n "$NPM_TOKEN" ]; then
    print_step "Using NPM_TOKEN for npm authentication"
    echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > ~/.npmrc.signaltree-temp
else
    print_step "Performing npm authentication (browser-based for 2FA)..."
    npm login --auth-type=web
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
            if [ -n "$NPM_TOKEN" ]; then
                PUBLISH_CMD="$PUBLISH_CMD --userconfig ~/.npmrc.signaltree-temp"
            fi

            $PUBLISH_CMD 2>&1 | tee /tmp/npm_publish_$package.log

            PUBLISH_EXIT_CODE=${PIPESTATUS[0]}

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
        print_warning "Dist folder not found for $package at $DIST_PATH, skipping..."
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

# Step 6: Create and push tag (AFTER successful publish)
# Tagging must be idempotent and must NEVER roll back versions after a successful publish
TAG_CREATED=0
print_step "Creating git tag v$NEW_VERSION (idempotent)..."
if git rev-parse -q --verify "refs/tags/v$NEW_VERSION" >/dev/null; then
    print_warning "Tag v$NEW_VERSION already exists locally; skipping tag creation"
else
    if git tag "v$NEW_VERSION"; then
        TAG_CREATED=1
        print_success "Created tag v$NEW_VERSION"
    else
        print_warning "Could not create tag v$NEW_VERSION (may already exist remotely). Skipping tag creation"
    fi
fi

# Determine current branch and push to it (safer than hardcoding 'main')
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD || echo "main")
print_step "Pushing changes to GitHub (branch: $CURRENT_BRANCH)..."
if ! git push origin "$CURRENT_BRANCH"; then
    print_warning "Failed to push changes to GitHub. Please push manually: git push origin $CURRENT_BRANCH"
fi

if [ "$TAG_CREATED" -eq 1 ]; then
    print_step "Pushing tag v$NEW_VERSION to GitHub..."
    if git push origin "v$NEW_VERSION"; then
        print_success "Tag v$NEW_VERSION pushed to GitHub"
    else
        print_warning "Failed to push tag v$NEW_VERSION. It may already exist remotely."
        print_warning "If needed, recreate or move the tag manually: git tag -d v$NEW_VERSION && git tag v$NEW_VERSION && git push origin v$NEW_VERSION --force"
    fi
else
    print_warning "Skipping tag push because tag was not created in this run."
fi

# Step 7: Clean up backup file and temporary npm credentials (release succeeded)
rm -f .version_backup
if [ -n "$NPM_TOKEN" ]; then
    rm -f ~/.npmrc.signaltree-temp
    print_step "Cleaned up temporary npm credentials"
fi
# Disable trap now that we've succeeded
trap - ERR

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
