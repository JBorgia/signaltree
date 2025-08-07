#!/bin/bash

# Signal Tree Release Script
# Automatically handles version bumping, building, tagging, and publishing

set -e # Exit on any error

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
if [ ! -f "signal-tree/package.json" ]; then
    print_error "This script must be run from the workspace root (where signal-tree/ folder exists)"
    exit 1
fi

# Parse command line arguments
RELEASE_TYPE=${1:-patch}
SKIP_TESTS=${2:-false}

if [[ ! "$RELEASE_TYPE" =~ ^(major|minor|patch)$ ]]; then
    print_error "Invalid release type. Use: major, minor, or patch"
    echo "Usage: $0 [major|minor|patch] [skip-tests]"
    exit 1
fi

print_step "Starting release process with type: $RELEASE_TYPE"

# Get current version
CURRENT_VERSION=$(node -p "require('./signal-tree/package.json').version")
print_step "Current version: $CURRENT_VERSION"

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

# Confirm with user
echo -e "${YELLOW}Continue with release $CURRENT_VERSION → $NEW_VERSION? (y/N)${NC}"
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_warning "Release cancelled"
    exit 0
fi

# Step 1: Run tests (unless skipped)
if [ "$SKIP_TESTS" != "skip-tests" ]; then
    print_step "Running tests..."
    pnpm run test:lib --watch=false || {
        print_error "Tests failed! Aborting release."
        exit 1
    }
    print_success "Tests passed"
fi

# Step 2: Update version in signal-tree/package.json
print_step "Updating version in signal-tree/package.json..."
node -p "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./signal-tree/package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('./signal-tree/package.json', JSON.stringify(pkg, null, 2) + '\n');
    'Version updated successfully'
"

# Step 3: Update version in root package.json
print_step "Updating version in root package.json..."
node -p "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
    'Version updated successfully'
"

# Step 4: Build the library
print_step "Building library..."
pnpm run build:lib || {
    print_error "Build failed! Aborting release."
    exit 1
}
print_success "Library built successfully"

# Step 5: Commit changes
print_step "Committing version changes..."
git add signal-tree/package.json package.json
git commit -m "chore: bump version to $NEW_VERSION" || {
    print_warning "Nothing to commit (version might already be updated)"
}

# Step 6: Create and push tag
print_step "Creating git tag v$NEW_VERSION..."
git tag "v$NEW_VERSION" || {
    print_error "Tag v$NEW_VERSION already exists!"
    exit 1
}

print_step "Pushing changes and tag to GitHub..."
git push origin main
git push origin "v$NEW_VERSION"
print_success "Changes and tag pushed to GitHub"

# Step 7: Publish to npm
print_step "Publishing to npm..."
cd dist/signal-tree
npm publish || {
    print_error "npm publish failed!"
    exit 1
}
cd ../..
print_success "Published to npm successfully"

# Step 8: Check GitHub Actions
print_step "GitHub Actions should now create a release automatically"
print_step "Check: https://github.com/JBorgia/signal-tree/actions"

# Final success message
echo ""
print_success "🎉 Release $NEW_VERSION completed successfully!"
echo -e "${GREEN}📦 npm: https://www.npmjs.com/package/signal-tree/v/$NEW_VERSION${NC}"
echo -e "${GREEN}🏷️  GitHub: https://github.com/JBorgia/signal-tree/releases/tag/v$NEW_VERSION${NC}"
echo ""
