#!/bin/bash

# Verify Distribution Files
# Ensures all expected distribution files exist after build

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Only verify packages that were actually built during validation
# enterprise and ng-forms are skipped during validation
NX_PACKAGES=("core" "callable-syntax" "shared" "types" "utils")
TSUP_PACKAGES=("guardrails")
ERRORS=0

echo "Verifying distribution files for independent packages..."
echo "(Note: enterprise and ng-forms are built during release, not validation)"
echo ""

# Check Nx-built packages (output to dist/packages/$package/src/)
for package in "${NX_PACKAGES[@]}"; do
    DIST_DIR="./dist/packages/$package"
    SRC_DIR="$DIST_DIR/src"
    
    echo "Checking Nx package: $package..."
    
    # Check dist directory exists
    if [ ! -d "$DIST_DIR" ]; then
        echo -e "${RED}❌ Missing dist directory: $DIST_DIR${NC}"
        ((ERRORS++))
        continue
    fi
    
    # Check for package.json
    if [ ! -f "$DIST_DIR/package.json" ]; then
        echo -e "${RED}❌ Missing package.json in $DIST_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ package.json found${NC}"
    fi
    
    # Check for main entry point in src/ subdirectory
    if [ ! -f "$SRC_DIR/index.js" ]; then
        echo -e "${RED}❌ Missing index.js in $SRC_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.js found${NC}"
    fi
    
    # Check for TypeScript declarations in src/ subdirectory
    if [ ! -f "$SRC_DIR/index.d.ts" ]; then
        echo -e "${RED}❌ Missing index.d.ts in $SRC_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.d.ts found${NC}"
    fi
    
    echo -e "${GREEN}✅ $package verified${NC}\n"
done

# Check tsup-built packages (output to packages/$package/dist/)
for package in "${TSUP_PACKAGES[@]}"; do
    DIST_DIR="./packages/$package/dist"
    
    echo "Checking tsup package: $package..."
    
    # Check dist directory exists
    if [ ! -d "$DIST_DIR" ]; then
        echo -e "${RED}❌ Missing dist directory: $DIST_DIR${NC}"
        ((ERRORS++))
        continue
    fi
    
    # Check for main entry points (both CJS and ESM)
    if [ ! -f "$DIST_DIR/index.js" ]; then
        echo -e "${RED}❌ Missing index.js in $DIST_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.js found${NC}"
    fi
    
    if [ ! -f "$DIST_DIR/index.cjs" ]; then
        echo -e "${RED}❌ Missing index.cjs in $DIST_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.cjs found${NC}"
    fi
    
    # Check for TypeScript declarations
    if [ ! -f "$DIST_DIR/index.d.ts" ]; then
        echo -e "${RED}❌ Missing index.d.ts in $DIST_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.d.ts found${NC}"
    fi
    
    # Special checks for guardrails (has noop and factories)
    if [ "$package" = "guardrails" ]; then
        if [ ! -f "$DIST_DIR/noop.js" ]; then
            echo -e "${RED}❌ Missing noop.js${NC}"
            ((ERRORS++))
        else
            echo -e "${GREEN}✓ noop.js found${NC}"
        fi
        
        if [ ! -d "$DIST_DIR/factories" ]; then
            echo -e "${RED}❌ Missing factories/ directory${NC}"
            ((ERRORS++))
        else
            echo -e "${GREEN}✓ factories/ directory found${NC}"
        fi
    fi
    
    echo -e "${GREEN}✅ $package verified${NC}\n"
done

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}Found $ERRORS distribution file issue(s)${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
else
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ All distribution files verified successfully!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
fi
