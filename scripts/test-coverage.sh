#!/bin/bash

# SignalTree Test Coverage Analysis Script
# Runs comprehensive test coverage across all modular packages

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}🧪 $1${NC}"
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

print_coverage() {
    echo -e "${PURPLE}📊 $1${NC}"
}

# List of packages to test
PACKAGES=(
    "core"
    "batching"
    "memoization"
    "middleware"
    "async"
    "entities"
    "devtools"
    "time-travel"
    "presets"
    "ng-forms"
)

print_step "Starting comprehensive test coverage analysis..."
echo ""

# Clean previous coverage reports
print_step "Cleaning previous coverage reports..."
rm -rf coverage/
print_success "Previous coverage reports cleaned"
echo ""

# Run tests with coverage for each package
TOTAL_PACKAGES=${#PACKAGES[@]}
SUCCESSFUL_TESTS=0
FAILED_TESTS=0

for i in "${!PACKAGES[@]}"; do
    pkg="${PACKAGES[$i]}"
    current=$((i + 1))

    print_step "[$current/$TOTAL_PACKAGES] Testing package: $pkg"

    if nx test "$pkg" --coverage --silent; then
        print_success "✓ $pkg - Tests passed"
        ((SUCCESSFUL_TESTS++))
    else
        print_error "✗ $pkg - Tests failed"
        ((FAILED_TESTS++))
    fi
    echo ""
done

# Generate coverage summary
print_step "Generating coverage summary..."
echo ""

# Check for coverage reports
COVERAGE_REPORTS=()
for pkg in "${PACKAGES[@]}"; do
    coverage_file="coverage/packages/$pkg/index.html"
    if [ -f "$coverage_file" ]; then
        COVERAGE_REPORTS+=("$pkg")
    fi
done

if [ ${#COVERAGE_REPORTS[@]} -gt 0 ]; then
    print_coverage "Coverage reports generated for:"
    for pkg in "${COVERAGE_REPORTS[@]}"; do
        echo -e "  ${GREEN}📋${NC} packages/$pkg → coverage/packages/$pkg/index.html"
    done
    echo ""

    # Extract coverage percentages (if possible)
    print_coverage "Coverage Summary:"
    for pkg in "${COVERAGE_REPORTS[@]}"; do
        coverage_html="coverage/packages/$pkg/index.html"
        if [ -f "$coverage_html" ]; then
            # Try to extract coverage percentage from HTML
            coverage_pct=$(grep -o "coverage-summary.*[0-9]\+\.[0-9]\+%" "$coverage_html" 2>/dev/null | head -1 | grep -o "[0-9]\+\.[0-9]\+%" || echo "N/A")
            echo -e "  ${PURPLE}$pkg:${NC} $coverage_pct"
        fi
    done
    echo ""
else
    print_warning "No coverage reports found. This might indicate Jest configuration issues."
fi

# Final summary
print_step "Test Coverage Analysis Complete!"
echo ""
print_success "✨ Results Summary:"
echo -e "  ${GREEN}Successful tests:${NC} $SUCCESSFUL_TESTS/$TOTAL_PACKAGES"
echo -e "  ${RED}Failed tests:${NC} $FAILED_TESTS/$TOTAL_PACKAGES"
echo -e "  ${PURPLE}Coverage reports:${NC} ${#COVERAGE_REPORTS[@]}/$TOTAL_PACKAGES"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    print_success "🎉 All tests passed!"
else
    print_warning "Some tests failed. Review the output above for details."
fi

# Open coverage reports
if [ ${#COVERAGE_REPORTS[@]} -gt 0 ]; then
    echo ""
    print_step "Opening coverage reports..."
    echo "Coverage reports available at:"
    for pkg in "${COVERAGE_REPORTS[@]}"; do
        echo "  file://$(pwd)/coverage/packages/$pkg/index.html"
    done

    # Open the core package coverage by default
    if [[ " ${COVERAGE_REPORTS[@]} " =~ " core " ]]; then
        print_coverage "Opening core package coverage in browser..."
        # Uncomment the next line if you want auto-open
        # open "coverage/packages/core/index.html" 2>/dev/null || true
    fi
fi

echo ""
print_step "Coverage analysis complete! 🧪✨"
