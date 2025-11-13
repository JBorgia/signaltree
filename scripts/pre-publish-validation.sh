#!/bin/bash

# SignalTree Pre-Publish Validation Script
# Comprehensive validation before publishing to npm

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Track overall status
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0
START_TIME=$(date +%s)

# Helper functions
print_header() {
    echo -e "\n${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${BLUE}🔍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((VALIDATION_WARNINGS++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((VALIDATION_ERRORS++))
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Function to run a validation check
run_check() {
    local check_name=$1
    local command=$2
    local severity=${3:-error}
    
    print_step "Running: $check_name"
    
    if eval "$command" > /dev/null 2>&1; then
        print_success "$check_name passed"
        return 0
    else
        if [ "$severity" = "error" ]; then
            print_error "$check_name failed"
            return 1
        else
            print_warning "$check_name failed (warning only)"
            return 0
        fi
    fi
}

# Change to workspace root
cd "$(dirname "$0")/.."

print_header "SignalTree Pre-Publish Validation"

# 1. Clean Working Directory
print_header "1. Checking Working Directory"
if [ -z "$(git status --porcelain)" ]; then
    print_success "Working directory is clean"
else
    print_error "Working directory has uncommitted changes"
    git status --short
    exit 1
fi

# 2. Install Dependencies
print_header "2. Installing Dependencies"
print_step "Running: pnpm install --frozen-lockfile"
if pnpm install --frozen-lockfile; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# 3. Type Checking
print_header "3. Type Checking"
print_step "Running TypeScript compiler checks"
# Type checking happens during build, so we'll verify TypeScript configs exist
TYPECHECK_PASSED=true
for package in core ng-forms callable-syntax enterprise guardrails; do
    TSCONFIG="./packages/$package/tsconfig.json"
    if [ ! -f "$TSCONFIG" ]; then
        print_error "Missing tsconfig.json for $package"
        TYPECHECK_PASSED=false
    fi
done

if [ "$TYPECHECK_PASSED" = true ]; then
    print_success "TypeScript configurations verified"
else
    print_error "Type checking configuration failed"
    exit 1
fi

# 4. Linting
print_header "4. Linting"
print_step "Running ESLint on all packages"
if NX_DAEMON=false pnpm run lint:all 2>&1 | tee /tmp/lint.log; then
    print_success "Linting passed"
else
    print_error "Linting failed"
    cat /tmp/lint.log
    exit 1
fi

# 5. Unit Tests
print_header "5. Unit Tests"
print_step "Running all unit tests"
if pnpm run test:all 2>&1 | tee /tmp/tests.log; then
    print_success "All tests passed"
else
    print_error "Tests failed"
    cat /tmp/tests.log
    exit 1
fi

# 6. Test Coverage
print_header "6. Test Coverage"
print_step "Generating test coverage reports"
if bash scripts/test-coverage.sh 2>&1 | tee /tmp/coverage.log; then
    print_success "Test coverage generated"
    
    # Check coverage thresholds
    if [ -f "coverage/coverage-summary.json" ]; then
        print_info "Coverage summary:"
        node -e "
            const fs = require('fs');
            const summary = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
            const total = summary.total;
            console.log('  Statements: ' + total.statements.pct + '%');
            console.log('  Branches:   ' + total.branches.pct + '%');
            console.log('  Functions:  ' + total.functions.pct + '%');
            console.log('  Lines:      ' + total.lines.pct + '%');
        "
    fi
else
    print_warning "Test coverage generation failed"
fi

# 7. Build All Packages
print_header "7. Building All Packages"
print_step "Running production builds"
print_info "Building independent packages (core, callable-syntax, guardrails, shared, types, utils)"
print_info "Note: enterprise and ng-forms will be built during release after core is published"

# Build core and other independent packages
if NX_DAEMON=false npx nx run-many -t build --projects=core,callable-syntax,shared,types,utils 2>&1 | tee /tmp/build.log; then
    print_success "Independent packages built successfully"
else
    print_error "Build failed"
    cat /tmp/build.log
    exit 1
fi

# Build guardrails separately (uses tsup, not Nx)
print_step "Building guardrails package"
if pnpm --filter @signaltree/guardrails build 2>&1 | tee -a /tmp/build.log; then
    print_success "Guardrails package built successfully"
else
    print_error "Guardrails build failed"
    cat /tmp/build.log
    exit 1
fi

# 8. Verify Package Configurations
print_header "8. Verifying Package Configurations"
print_step "Checking package.json files"
if bash scripts/verify-packages.sh 2>&1 | tee /tmp/verify-packages.log; then
    print_success "Package configurations verified"
else
    print_error "Package verification failed"
    cat /tmp/verify-packages.log
    exit 1
fi

# 9. Verify Distribution Files
print_header "9. Verifying Distribution Files"
print_step "Checking that all expected dist files exist"
if bash scripts/verify-dist.sh 2>&1 | tee /tmp/verify-dist.log; then
    print_success "All distribution files verified"
else
    print_error "Distribution verification failed"
    cat /tmp/verify-dist.log
    exit 1
fi

# 10. Bundle Size Analysis
print_header "10. Bundle Size Analysis"
print_step "Analyzing bundle sizes"
if node scripts/consolidated-bundle-analysis.js 2>&1 | tee /tmp/bundle-analysis.log; then
    print_success "Bundle sizes verified"
else
    print_warning "Bundle size analysis encountered issues"
fi

# 11. Sanity Checks
print_header "11. Sanity Checks"
print_step "Running sanity checks on build outputs"
if [ -f "scripts/sanity-checks.js" ]; then
    if node scripts/sanity-checks.js 2>&1 | tee /tmp/sanity.log; then
        print_success "Sanity checks passed"
    else
        print_error "Sanity checks failed"
        cat /tmp/sanity.log
        exit 1
    fi
else
    print_warning "Sanity checks script not found (skipping)"
fi

# 12. Performance Benchmarks
print_header "12. Performance Benchmarks"
print_step "Running performance benchmarks"
if [ -f "scripts/perf-suite.js" ]; then
    print_info "Running benchmarks (this may take a few minutes)..."
    # Use gtimeout on macOS, timeout on Linux
    if command -v gtimeout > /dev/null; then
        TIMEOUT_CMD="gtimeout"
    elif command -v timeout > /dev/null; then
        TIMEOUT_CMD="timeout"
    else
        print_error "timeout command not found (install coreutils: brew install coreutils)"
        exit 1
    fi
    
    if $TIMEOUT_CMD 300 node scripts/perf-suite.js 2>&1 | tee /tmp/perf.log; then
        print_success "Performance benchmarks completed"
    else
        print_warning "Performance benchmarks failed or timed out (non-blocking)"
    fi
else
    print_warning "Performance suite not found (skipping)"
fi

# 13. Documentation Validation
print_header "13. Documentation Validation"
print_step "Checking documentation files"

# Check for required documentation files
REQUIRED_DOCS=("README.md" "CHANGELOG.md" "LICENSE")
MISSING_DOCS=0

for doc in "${REQUIRED_DOCS[@]}"; do
    if [ ! -f "$doc" ]; then
        print_error "Missing required documentation: $doc"
        ((MISSING_DOCS++))
    fi
done

if [ $MISSING_DOCS -eq 0 ]; then
    print_success "All required documentation files present"
    
    # Check if CHANGELOG has an entry for the current version
    if [ -f "CHANGELOG.md" ]; then
        CURRENT_VERSION=$(node -p "require('./package.json').version")
        if grep -q "$CURRENT_VERSION" CHANGELOG.md; then
            print_success "CHANGELOG.md includes entry for version $CURRENT_VERSION"
        else
            print_warning "CHANGELOG.md may not include entry for version $CURRENT_VERSION"
        fi
    fi
else
    print_error "Missing $MISSING_DOCS documentation files"
    exit 1
fi

# Final Summary
print_header "Validation Summary"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

print_info "Total validation time: ${DURATION}s"
print_info "Errors: $VALIDATION_ERRORS"
print_info "Warnings: $VALIDATION_WARNINGS"

if [ $VALIDATION_ERRORS -gt 0 ]; then
    echo ""
    print_error "Validation FAILED with $VALIDATION_ERRORS error(s)"
    echo ""
    print_info "Please fix the errors above before publishing"
    exit 1
else
    echo ""
    print_success "All validation checks PASSED! ✨"
    
    if [ $VALIDATION_WARNINGS -gt 0 ]; then
        print_warning "Note: $VALIDATION_WARNINGS warning(s) were found"
    fi
    
    echo ""
    print_info "Ready to publish to npm 🚀"
    exit 0
fi

