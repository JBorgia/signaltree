#!/usr/bin/env bash

# SignalTree Package Deprecation Script
# Marks deprecated packages on npm with migration instructions

set -e  # Exit on any error

echo "📢 Starting SignalTree package deprecation process..."

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

# Check if user is logged into npm
if ! npm whoami > /dev/null 2>&1; then
    print_error "You must be logged into npm. Run 'npm login' first."
    exit 1
fi

print_status "Verified npm authentication as: $(npm whoami)"

# Check for flags
DRY_RUN=""
OTP_CODE=""

for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN="true"
        print_warning "Running in DRY RUN mode - no packages will actually be deprecated"
    elif [[ "$arg" == --otp=* ]]; then
        OTP_CODE="${arg#--otp=}"
        print_status "Using provided OTP code"
    fi
done

# Prompt for OTP if not provided and not in dry-run mode
if [ -z "$DRY_RUN" ] && [ -z "$OTP_CODE" ]; then
    echo
    print_warning "This operation requires 2FA authentication"
    echo "Please enter your OTP code from your authenticator app:"
    read -r OTP_CODE
    echo
fi

# Define deprecated packages (package_name:message format)
# Note: serialization was never published to npm, so it's excluded
PACKAGES=(
    "batching:This package has been consolidated into @signaltree/core. Please use: import { withBatching } from '@signaltree/core'"
    "memoization:This package has been consolidated into @signaltree/core. Please use: import { withMemoization } from '@signaltree/core'"
    "devtools:This package has been consolidated into @signaltree/core. Please use: import { withDevtools } from '@signaltree/core'"
    "entities:This package has been consolidated into @signaltree/core. Please use entity helpers from '@signaltree/core'"
    "middleware:This package has been consolidated into @signaltree/core. Please use: import { withMiddleware } from '@signaltree/core'"
    "presets:This package has been consolidated into @signaltree/core. Please use preset functions from '@signaltree/core'"
    "time-travel:This package has been consolidated into @signaltree/core. Please use: import { withTimeTravel } from '@signaltree/core'"
)

# Function to deprecate a single package
deprecate_package() {
    local package_name=$1
    local message=$2
    local full_package="@signaltree/$package_name"

    print_status "Deprecating package: $full_package"

    if [ -n "$DRY_RUN" ]; then
        print_warning "DRY RUN: Would deprecate $full_package"
        echo "  Message: $message"
    else
        # Build npm command with OTP if provided
        local npm_cmd="npm deprecate \"$full_package\" \"$message\""
        if [ -n "$OTP_CODE" ]; then
            npm_cmd="$npm_cmd --otp=$OTP_CODE"
        fi

        if eval "$npm_cmd" 2>&1; then
            print_success "Successfully deprecated $full_package"
        else
            print_error "Failed to deprecate $full_package"
            return 1
        fi
    fi

    return 0
}

# Main deprecation loop
print_status "Starting to deprecate ${#PACKAGES[@]} packages..."
echo

FAILED_PACKAGES=()
SUCCESSFUL_PACKAGES=()

for entry in "${PACKAGES[@]}"; do
    # Split entry on colon
    package_name="${entry%%:*}"
    message="${entry#*:}"

    if deprecate_package "$package_name" "$message"; then
        SUCCESSFUL_PACKAGES+=("$package_name")
    else
        FAILED_PACKAGES+=("$package_name")
        print_warning "Continuing with remaining packages despite failure..."
    fi

    # Small delay to avoid rate limiting
    if [ -z "$DRY_RUN" ]; then
        sleep 1
    fi
done

# Summary
echo
print_status "Deprecation Summary:"
echo "===================="

if [ ${#SUCCESSFUL_PACKAGES[@]} -gt 0 ]; then
    print_success "Successfully deprecated packages:"
    for package in "${SUCCESSFUL_PACKAGES[@]}"; do
        echo "  ✅ @signaltree/$package"
    done
fi

if [ ${#FAILED_PACKAGES[@]} -gt 0 ]; then
    print_warning "Failed to deprecate packages:"
    for package in "${FAILED_PACKAGES[@]}"; do
        echo "  ⚠️  @signaltree/$package"
    done
    echo
    print_warning "Some packages could not be deprecated. This may be because:"
    echo "  - They were never published to npm"
    echo "  - You don't have permission to deprecate them"
    echo "  - They're already deprecated"
fi

echo
if [ -n "$DRY_RUN" ]; then
    print_success "DRY RUN completed successfully!"
    print_status "To actually deprecate packages, run: npm run deprecate:packages"
else
    print_success "Package deprecation process completed! 📢"
    print_status "Users will now see deprecation warnings when installing these packages"
    print_status "Migration instructions point them to @signaltree/core"
fi
