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
for package in core ng-forms callable-syntax enterprise guardrails schema; do
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
print_info "Building all packages that are published by scripts/release.sh"

# Build packages in dependency order (core first, then the rest)
if NX_DAEMON=false npx nx build core --configuration=production 2>&1 | tee /tmp/build-core.log; then
    print_success "Core built successfully"
else
    print_error "Core build failed"
    cat /tmp/build-core.log
    exit 1
fi

PUBLISHED_PACKAGES="callable-syntax,shared,guardrails,events,realtime,enterprise,ng-forms,schema"
if NX_DAEMON=false npx nx run-many -t build --projects=$PUBLISHED_PACKAGES --configuration=production 2>&1 | tee /tmp/build.log; then
    print_success "All published packages built successfully"
else
    print_error "Build failed"
    cat /tmp/build.log
    exit 1
fi

# 7a. Skill Code-Block Lint
# Type-checks every fenced ts/typescript/tsx block in docs/skills/ against
# the real built @signaltree/* d.ts files. Must run after the build step
# (needs dist/packages/*). Between lint (step 4) and the build above makes
# no sense because dist isn't present yet; we run it as soon as the build
# completes so any skill API drift fails fast before release assets ship.
print_header "7a. Skill Code-Block Lint"
print_step "Type-checking SKILL.md / reference/*.md code blocks"
if node scripts/lint-skills.mjs 2>&1 | tee /tmp/lint-skills.log; then
    print_success "Skill code blocks all type-check"
else
    print_error "Skill code blocks failed type-check"
    cat /tmp/lint-skills.log
    print_info "Fix the SKILL.md / reference files flagged above, then re-run"
    exit 1
fi

# 7b. Built-Barrel Smoke Test
# Bundles each package's PUBLISHED dist/index.js — fails if any internal
# re-export can't resolve. Catches the class of bug where guardrails@10.6.0
# shipped a barrel re-exporting a never-emitted ./lib/rules.js (invisible to
# source tests + the .d.ts gate). Runs after the build (needs dist/packages/*).
print_header "7b. Built-Barrel Smoke Test"
print_step "Resolving every published package barrel"
if node tools/verify-built-barrels.mjs 2>&1 | tee /tmp/verify-barrels.log; then
    print_success "All package barrels resolve"
else
    print_error "A package barrel failed to resolve — the published package would be broken"
    cat /tmp/verify-barrels.log
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

# 9a. Verify Package Exports
print_step "Verifying package exports match build output"
if node scripts/verify-exports.js 2>&1 | tee /tmp/verify-exports.log; then
    print_success "All package exports verified"
else
    print_error "Package exports verification failed - exports don't match build output"
    cat /tmp/verify-exports.log
    print_info "This prevents publishing packages with broken imports"
    exit 1
fi

# 9b. Verify No Broken Type Declarations
print_step "Checking for stray dist/**/*.d.ts files"
if bash scripts/verify-no-broken-dts.sh 2>&1 | tee /tmp/verify-dts.log; then
    print_success "No broken type declaration files found"
else
    print_error "Found stray type declaration files that will break TypeScript resolution"
    cat /tmp/verify-dts.log
    print_info "These files are generated by Nx but must be excluded via package.json files array"
    print_info "See: .github/instructions/type-declarations-fix.md"
    exit 1
fi

# 9c. (removed) The hand-rolled-walker-guard grep script was deleted: a
# pipefail/exit-status bug made it structurally unable to flag violations
# (verified 2026-07-23 — it greenlit four live ones). Its job moved to an
# ESLint no-restricted-syntax rule (AST-based, runs in editor + lint) and the
# walker-conformance specs. See docs/rfcs/0004-v12-optimal-iteration.md §3 V-P1.

# 10. Bundle Size Analysis (Warning Only)
print_header "10. Bundle Size Analysis"
print_step "Analyzing bundle sizes"
set +e  # Temporarily disable exit on error for bundle analysis
node scripts/consolidated-bundle-analysis.js 2>&1 | tee /tmp/bundle-analysis.log
BUNDLE_EXIT=$?
set -e  # Re-enable exit on error
if [ $BUNDLE_EXIT -eq 0 ]; then
    print_success "Bundle sizes verified"
else
    print_warning "Bundle size analysis encountered issues (non-blocking)"
fi

# 10b. Bundle Budget Gate (BLOCKING)
# Re-measures SignalTree's own gzip cost and fails if the floor regresses past
# budget. Guards against the class of bug where a statically-reachable optional
# module silently leaks into every bundle (the v11 security-injection fix). Needs
# the core build (step 7) present.
print_header "10b. Bundle Budget Gate"
print_step "Enforcing SignalTree gzip budgets (bare ≤5.8KB, with-entities ≤8.6KB)"
if node tools/check-bundle-budget.mjs 2>&1 | tee /tmp/bundle-budget.log; then
    print_success "Bundle within budget"
else
    print_error "Bundle budget exceeded — a regression inflated the floor"
    cat /tmp/bundle-budget.log
    exit 1
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

# 12. Performance Benchmarks (Warning Only)
print_header "12. Performance Benchmarks"
print_step "Running performance benchmarks (warning only)"
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

    set +e  # Temporarily disable exit on error
    $TIMEOUT_CMD 300 node scripts/perf-suite.js 2>&1 | tee /tmp/perf.log
    PERF_EXIT=$?
    set -e  # Re-enable exit on error

    if [ $PERF_EXIT -eq 0 ]; then
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

else
    print_error "Missing $MISSING_DOCS documentation files"
    exit 1
fi

# Note: the former `validate:doc-snippets` gate (scripts/validate-doc-snippets.js)
# was DELETED 2026-07-23: zero `// @check` markers were ever adopted in 3 months,
# so it validated nothing — the twice-proven orphan-gate rot pattern
# (RFC 0004 §3 V-P6). Doc code-blocks are covered by the blocking skill
# code-block lint (section 7a) and the taught-symbol gate below (13a).

# 13a. Taught-Symbol Verification (BLOCKING)
# Reverse diff: every symbol llms-full.txt claims is importable from
# @signaltree/core (root or subpath) must exist in the built d.ts of that
# exact entry point (catches phantom/removed APIs — the hallucination vector).
# Golden API list: ~30 curated capabilities must be BOTH exported AND taught
# (catches "shipped a capability, never taught it"). Needs the core build
# (step 7). Self-test runs first: a gate that cannot fail is presumed inert
# (RFC 0004 §5 rule 2).
print_header "13a. Taught-Symbol Verification"
print_step "Self-testing the taught-symbol gate (negative test)"
if node scripts/verify-taught-symbols.js --self-test 2>&1 | tee /tmp/taught-symbols-selftest.log; then
    print_success "Taught-symbol gate self-test passed (gate can fail)"
else
    print_error "Taught-symbol gate self-test FAILED — the gate is inert, refusing to continue"
    cat /tmp/taught-symbols-selftest.log
    exit 1
fi
print_step "Checking llms-full.txt taught symbols against built @signaltree/core d.ts"
if node scripts/verify-taught-symbols.js 2>&1 | tee /tmp/taught-symbols.log; then
    print_success "All taught symbols exist; golden API list exported AND taught"
else
    print_error "Taught-symbol verification failed — doc teaches a phantom API or a capability is untaught"
    cat /tmp/taught-symbols.log
    exit 1
fi

# 13b. Version-Claims Verification (BLOCKING)
# Check-only: canonical claim sites (README.md, packages/core/README.md,
# llms.txt, llms-full.txt, install.md) must match the authoritative Angular
# range in packages/core/package.json peerDependencies. Precedent: install.md
# said "derived from peerDependencies" and still drifted a full major.
print_header "13b. Version-Claims Verification"
print_step "Self-testing the version-claims gate (negative test)"
if node scripts/verify-version-claims.js --self-test 2>&1 | tee /tmp/version-claims-selftest.log; then
    print_success "Version-claims gate self-test passed (gate can fail)"
else
    print_error "Version-claims gate self-test FAILED — the gate is inert, refusing to continue"
    cat /tmp/version-claims-selftest.log
    exit 1
fi
print_step "Checking Angular version claims against peerDependencies"
if node scripts/verify-version-claims.js 2>&1 | tee /tmp/version-claims.log; then
    print_success "All canonical claim sites match peerDependencies"
else
    print_error "Version-claim drift detected — fix the claim sites to match peerDependencies"
    cat /tmp/version-claims.log
    exit 1
fi

# 13c. Size-Claims Verification (BLOCKING)
# Formerly an orphan npm script (8 months, never in any workflow — RFC 0004
# §3 V-P6); wired here 2026-07-23 after refreshing the stale claims in
# consolidated-bundle-analysis.js. Negative test: empirically proven able to
# fail — it fired on all four packages' stale claims the day it was wired.
# Needs the production builds from step 7.
print_header "13c. Size-Claims Verification"
print_step "Verifying full-package size claims (±5%)"
if node scripts/verify-size-claims.js 2>&1 | tee /tmp/size-claims.log; then
    print_success "Size claims verified"
else
    print_error "Size claims drifted >5% from measured — update consolidated-bundle-analysis.js claims deliberately"
    cat /tmp/size-claims.log
    exit 1
fi

# 13d. Release-State Verification (BLOCKING)
# Catches the class the other gates missed: a CHANGELOG top heading still
# labeled "(unreleased)" for a version whose git tag already exists (the 11.6.0
# post-release finding), and CHANGELOG/package.json version drift. Added
# 2026-07-23 (audit item H). Self-test proves the gate can fail.
print_header "13d. Release-State Verification"
print_step "Self-testing the release-state gate (negative test)"
if node scripts/verify-release-state.js --self-test 2>&1 | tee /tmp/release-state-selftest.log; then
    print_success "Release-state gate self-test passed (gate can fail)"
else
    print_error "Release-state gate self-test FAILED — the gate is inert, refusing to continue"
    cat /tmp/release-state-selftest.log
    exit 1
fi
print_step "Checking CHANGELOG heading vs package.json version and tag state"
if node scripts/verify-release-state.js 2>&1 | tee /tmp/release-state.log; then
    print_success "Release-state consistent"
else
    print_error "Release-state drift — a shipped version still says (unreleased), or CHANGELOG/package.json versions disagree"
    cat /tmp/release-state.log
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

