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
PACKAGES=(
    "core"            # Main package with all enhancers (batching, memoization, etc.)
    "ng-forms"        # Angular forms integration
    "callable-syntax" # Build-time transform for callable DX syntax
    "enterprise"      # Enterprise-grade optimizations for large-scale apps
    "guardrails"      # Dev-only performance guardrails with tsup build
)

# Parse command line arguments
RELEASE_TYPE=${1:-patch}
SKIP_TESTS=${2:-false}
NON_INTERACTIVE=false
if [[ "$*" == *"--yes"* ]] || [[ "$*" == *"-y"* ]]; then
    NON_INTERACTIVE=true
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

print_step "New version will be: $NEW_VERSION"

# Confirm with user (unless non-interactive)
if [ "$NON_INTERACTIVE" = false ]; then
    echo -e "${YELLOW}Continue with modular release $CURRENT_VERSION → $NEW_VERSION? (y/N)${NC}"
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
print_step "Updating versions in all packages..."

# Update workspace version
node -p "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
    'Workspace version updated successfully'
"

# Update each package version and dependencies
for package in "${PACKAGES[@]}"; do
    PACKAGE_JSON="./packages/$package/package.json"
    if [ -f "$PACKAGE_JSON" ]; then
        print_step "Updating version for @signaltree/$package..."
        node -p "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
            pkg.version = '$NEW_VERSION';

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
npx nx run core:postbuild || {
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

NX_REMAINING_PACKAGES=()
BUILD_GUARDRAILS=false
for package in "${REMAINING_PACKAGES[@]}"; do
    if [ "$package" = "guardrails" ]; then
        BUILD_GUARDRAILS=true
    else
        NX_REMAINING_PACKAGES+=("$package")
    fi
done

if [ ${#NX_REMAINING_PACKAGES[@]} -gt 0 ]; then
    print_step "Building remaining Nx packages..."
    REMAINING_LIST=$(IFS=,; echo "${NX_REMAINING_PACKAGES[*]}")
    npx nx run-many -t build --projects=$REMAINING_LIST --configuration=production || {
        print_warning "Some dependent packages failed to build, but continuing with core..."
        print_warning "Failed packages will be skipped during publish"
    }
fi

if [ "$BUILD_GUARDRAILS" = true ]; then
    print_step "Building @signaltree/guardrails with tsup..."
    if ! pnpm --filter @signaltree/guardrails build; then
        print_error "Guardrails package build failed! Rolling back version changes."
        rollback_versions
        exit 1
    fi
    mkdir -p dist/packages
    rm -rf dist/packages/guardrails
    mkdir -p dist/packages/guardrails
    cp -R packages/guardrails/dist dist/packages/guardrails/
    cp packages/guardrails/README.md dist/packages/guardrails/ 2>/dev/null || true
    cp packages/guardrails/CHANGELOG.md dist/packages/guardrails/ 2>/dev/null || true
    cp packages/guardrails/package.json dist/packages/guardrails/
    print_success "Guardrails package built successfully"
fi

print_success "Package builds completed"

# Step 4: Commit changes
print_step "Committing version changes..."
git add package.json packages/*/package.json
git commit -m "chore: bump all packages to version $NEW_VERSION" || {
    print_warning "Nothing to commit (versions might already be updated)"
}

# Step 5: Create and push tag
print_step "Creating git tag v$NEW_VERSION..."
git tag "v$NEW_VERSION" || {
    print_error "Tag v$NEW_VERSION already exists!"
    rollback_versions
    exit 1
}

# Determine current branch and push to it (safer than hardcoding 'main')
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD || echo "main")
print_step "Pushing changes and tag to GitHub (branch: $CURRENT_BRANCH)..."
git push origin "$CURRENT_BRANCH" || {
    print_error "Failed to push changes to GitHub!"
    # Remove the tag we just created
    git tag -d "v$NEW_VERSION" 2>/dev/null || true
    rollback_versions
    exit 1
}
git push origin "v$NEW_VERSION" || {
    print_error "Failed to push tag to GitHub!"
    # Try to delete the remote tag if it was created
    git push origin --delete "v$NEW_VERSION" 2>/dev/null || true
    git tag -d "v$NEW_VERSION" 2>/dev/null || true
    rollback_versions
    exit 1
}
print_success "Changes and tag pushed to GitHub"

# Step 6: Publish all packages to npm
print_step "Publishing all packages to npm..."

PUBLISHED_PACKAGES=()
FAILED_PACKAGES=()

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

        npm publish --access public 2>&1 | tee /tmp/npm_publish_$package.log
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            print_success "Published @signaltree/$package successfully"
            PUBLISHED_PACKAGES+=("$package")
        else
            # Check if it's a "cannot publish over existing version" error
            if grep -q "cannot publish over the previously published versions" /tmp/npm_publish_$package.log; then
                print_warning "@signaltree/$package@$NEW_VERSION already published, skipping..."
                PUBLISHED_PACKAGES+=("$package")
            else
                print_error "npm publish failed for @signaltree/$package!"
                FAILED_PACKAGES+=("$package")
            fi
        fi
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
    print_warning "You may need to fix build issues and publish these manually"
fi

# Step 7: Clean up backup file (release succeeded)
rm -f .version_backup
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
