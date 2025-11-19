#!/bin/bash

# SignalTree Publishing Script
# Publishes all packages in the correct dependency order

set -e  # Exit on any error

echo "🚀 Starting SignalTree package publishing process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verify we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages" ]; then
    print_error "This script must be run from the root of the SignalTree workspace"
    exit 1
fi

# Check if user is logged into npm
if ! npm whoami > /dev/null 2>&1; then
    print_error "You must be logged into npm. Run 'npm login' first."
    exit 1
fi

print_status "Verified npm authentication"

# Define packages in dependency order (core first, then others)
PACKAGES=(
    "core"
    "enterprise"
    "ng-forms"
    "callable-syntax"
    "guardrails"
)

# Check if dry-run flag is passed
DRY_RUN=""
if [ "$1" = "--dry-run" ]; then
    DRY_RUN="--dry-run"
    print_warning "Running in DRY RUN mode - no packages will actually be published"
fi

# Function to publish a single package
publish_package() {
    local package_name=$1
    local package_path="packages/$package_name"
    local dist_path="dist/packages/$package_name"

    print_status "Building package: @signaltree/$package_name"

    # Build the package via Nx
    if ! nx build "$package_name" --configuration=production; then
        print_error "Failed to build package: $package_name"
        return 1
    fi

    # Check if dist directory exists
    if [ ! -d "$dist_path" ]; then
        print_error "Distribution directory not found: $dist_path"
        return 1
    fi

    print_status "Publishing package: @signaltree/$package_name"

    # Change to dist directory and publish
    cd "$dist_path"

    if [ -n "$DRY_RUN" ]; then
        print_warning "DRY RUN: Would publish @signaltree/$package_name"
        npm publish $DRY_RUN
    else
        if npm publish; then
            print_success "Successfully published @signaltree/$package_name"
        else
            print_error "Failed to publish @signaltree/$package_name"
            cd - > /dev/null
            return 1
        fi
    fi

    # Return to root directory
    cd - > /dev/null

    # Add small delay between publishes to avoid rate limiting
    if [ -z "$DRY_RUN" ]; then
        sleep 2
    fi

    return 0
}

# Main publishing loop
print_status "Starting to publish ${#PACKAGES[@]} packages..."

FAILED_PACKAGES=()
SUCCESSFUL_PACKAGES=()

for package in "${PACKAGES[@]}"; do
    if publish_package "$package"; then
        SUCCESSFUL_PACKAGES+=("$package")
    else
        FAILED_PACKAGES+=("$package")
        print_error "Stopping publication due to failure in package: $package"
        break
    fi
done

# Summary
echo
print_status "Publication Summary:"
echo "===================="

if [ ${#SUCCESSFUL_PACKAGES[@]} -gt 0 ]; then
    print_success "Successfully published packages:"
    for package in "${SUCCESSFUL_PACKAGES[@]}"; do
        echo "  ✅ @signaltree/$package"
    done
fi

if [ ${#FAILED_PACKAGES[@]} -gt 0 ]; then
    print_error "Failed to publish packages:"
    for package in "${FAILED_PACKAGES[@]}"; do
        echo "  ❌ @signaltree/$package"
    done
    echo
    print_error "Publication process stopped due to failures."
    exit 1
else
    echo
    if [ -n "$DRY_RUN" ]; then
        print_success "DRY RUN completed successfully!"
        print_status "To actually publish, run: npm run publish:all"
    else
        print_success "All packages published successfully! 🎉"
        print_status "SignalTree ecosystem is now available on npm"
    fi
fi
