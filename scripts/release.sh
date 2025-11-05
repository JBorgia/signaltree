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
# Note: batching, memoization, middleware, entities, devtools, time-travel, presets
# were consolidated into @signaltree/core in v4.0.0
PACKAGES=(
    "core"
    "ng-forms"
    "callable-syntax"
    # "enterprise" - not published to npm (internal/private package)
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

# Step 1: Run tests for all packages (unless skipped)
if [ "$SKIP_TESTS" != "skip-tests" ]; then
    print_step "Running tests for all packages..."

    # Prefer nx run-many to leverage caching and parallelism
    # Convert array to comma-separated list for Nx
    PROJECTS_LIST=$(IFS=,; echo "${PACKAGES[*]}")
    npx nx run-many -t test --projects=$PROJECTS_LIST || {
        print_error "Some tests failed! Aborting release."
        exit 1
    }

    print_success "All package tests passed"
fi

# Step 2: Backup original versions (for rollback if needed)
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

        # Clean up git changes
        git reset --hard HEAD 2>/dev/null || true

        # Remove backup file
        rm -f .version_backup

        print_success "Version rollback completed"
    else
        print_warning "No version backup found"
    fi
}

# Set up trap to rollback on failure
trap rollback_versions ERR

# Step 3: Update versions in all package.json files
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

# Step 5: Build all packages
print_step "Building all packages..."

# Use nx run-many so Nx can parallelize and use cache
# Convert array to comma-separated list for Nx
PROJECTS_LIST=$(IFS=,; echo "${PACKAGES[*]}")
npx nx run-many -t build --projects=$PROJECTS_LIST --configuration=production || {
    print_error "Some package builds failed! Rolling back version changes."
    rollback_versions
    exit 1
}

print_success "All packages built successfully"

# Step 6: Commit changes
print_step "Committing version changes..."
git add package.json packages/*/package.json
git commit -m "chore: bump all packages to version $NEW_VERSION" || {
    print_warning "Nothing to commit (versions might already be updated)"
}

# Step 7: Create and push tag
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

# Step 8: Publish all packages to npm
print_step "Publishing all packages to npm..."

for package in "${PACKAGES[@]}"; do
    DIST_PATH="./dist/packages/$package"
    if [ -d "$DIST_PATH" ]; then
        print_step "Publishing @signaltree/$package..."
        cd "$DIST_PATH"
        npm publish --access public || {
            print_error "npm publish failed for @signaltree/$package!"
            cd - > /dev/null
            print_error "Some packages may have been published. Check npm manually."
            print_warning "Git changes and tags have been pushed and cannot be automatically rolled back."
            print_warning "You may need to manually unpublish packages or create a patch release."
            exit 1
        }
        cd - > /dev/null
        print_success "Published @signaltree/$package successfully"
    else
        print_warning "Dist folder not found for $package at $DIST_PATH"
    fi
done
print_success "Published to npm successfully"

# Step 9: Clean up backup file (release succeeded)
rm -f .version_backup
# Disable trap now that we've succeeded
trap - ERR

# Step 10: Check GitHub Actions
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
