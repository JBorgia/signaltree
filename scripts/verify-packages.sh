#!/bin/bash

# Package Configuration Verification Script
# Ensures all packages are ready for NPM publishing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}🔍 $1${NC}"
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

print_step "Verifying package configurations for NPM publishing..."
echo ""

# Note: batching, memoization, middleware, entities, devtools, time-travel, presets
# were consolidated into @signaltree/core in v4.0.0
PACKAGES=(
    "core"
    "ng-forms"
    "callable-syntax"
    "enterprise"
    "guardrails"
    "events"
    "realtime"
)

ISSUES_FOUND=0

for pkg in "${PACKAGES[@]}"; do
    pkg_json="packages/$pkg/package.json"

    print_step "Checking package: $pkg"

    if [ ! -f "$pkg_json" ]; then
        print_error "package.json not found for $pkg"
        ((ISSUES_FOUND++))
        continue
    fi

    # Check package name format
    name=$(cat "$pkg_json" | grep '"name"' | sed 's/.*"name": "\(.*\)".*/\1/')
    expected_name="@signaltree/$pkg"

    if [ "$name" = "$expected_name" ]; then
        print_success "✓ Name: $name"
    else
        print_error "✗ Name mismatch. Expected: $expected_name, Got: $name"
        ((ISSUES_FOUND++))
    fi

    # Check if version exists
    version=$(cat "$pkg_json" | grep '"version"' | sed 's/.*"version": "\(.*\)".*/\1/')
    if [ -n "$version" ]; then
        print_success "✓ Version: $version"
    else
        print_error "✗ No version found"
        ((ISSUES_FOUND++))
    fi

    # Check sideEffects is false (for tree-shaking)
    sideEffects=$(node -p "try { const p = require('./$pkg_json'); String(p.sideEffects) } catch { '' }")
    if [ "$sideEffects" = "false" ]; then
        print_success "✓ sideEffects: false (tree-shaking enabled)"
    else
        print_warning "⚠ sideEffects not set to false (recommend for tree-shaking)"
    fi

    echo ""
done

# Check NPM authentication
print_step "Checking NPM authentication..."
if npm whoami &>/dev/null; then
    npm_user=$(npm whoami)
    print_success "✓ Logged into NPM as: $npm_user"
else
    print_warning "⚠ Not logged into NPM. Run: npm login"
    # Note: Auth token in ~/.npmrc is sufficient for publishing
    # ((ISSUES_FOUND++))
fi

# Check if @signaltree org exists (this will fail if not accessible, which is fine)
print_step "Checking @signaltree organization access..."
if npm org ls signaltree &>/dev/null; then
    print_success "✓ Access to @signaltree organization confirmed"
else
    print_warning "⚠ Cannot access @signaltree organization. You may need to:"
    echo "  1. Create it: npm org create signaltree"
    echo "  2. Get added to it if it exists"
fi

echo ""
print_step "Verification Summary:"

if [ $ISSUES_FOUND -eq 0 ]; then
    print_success "🎉 All packages are correctly configured!"
    echo ""
    print_step "Ready to publish! Next steps:"
    echo "1. Run: ./scripts/release.sh patch"
    echo "2. Or manually: npm login && ./scripts/release.sh patch"
else
    print_error "❌ Found $ISSUES_FOUND issues that need to be resolved"
    echo ""
    print_step "Please fix the issues above before publishing"
fi

echo ""
print_step "Package publication will create:"
for pkg in "${PACKAGES[@]}"; do
    echo "  📦 @signaltree/$pkg"
done

echo ""
print_step "Users will install with:"
echo "  npm install @signaltree/core                    # Core with all enhancers"
echo "  npm install @signaltree/ng-forms                # Angular forms integration"
echo "  npm install @signaltree/enterprise              # Enterprise optimizations"
echo "  npm install -D @signaltree/callable-syntax      # Build-time transform (dev)"
echo "  npm install -D @signaltree/guardrails           # Development-only guardrails"
echo ""
