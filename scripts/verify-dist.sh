#!/bin/bash

# Verify Distribution Files
# Ensures all expected distribution files exist after build

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PACKAGES=("core" "ng-forms" "callable-syntax" "enterprise" "guardrails")
ERRORS=0

echo "Verifying distribution files..."

for package in "${PACKAGES[@]}"; do
    DIST_DIR="./packages/$package/dist"
    
    echo "Checking $package..."
    
    # Check dist directory exists
    if [ ! -d "$DIST_DIR" ]; then
        echo -e "${RED}❌ Missing dist directory for $package${NC}"
        ((ERRORS++))
        continue
    fi
    
    # Check for package.json
    if [ ! -f "$DIST_DIR/package.json" ]; then
        echo -e "${RED}❌ Missing package.json in $package/dist${NC}"
        ((ERRORS++))
    fi
    
    # Check for main entry point (CJS or ESM)
    if [ ! -f "$DIST_DIR/index.js" ] && [ ! -f "$DIST_DIR/index.cjs" ] && [ ! -f "$DIST_DIR/index.mjs" ]; then
        echo -e "${RED}❌ Missing main entry point for $package${NC}"
        ((ERRORS++))
    fi
    
    # Check for TypeScript declarations
    if [ ! -f "$DIST_DIR/index.d.ts" ]; then
        echo -e "${RED}❌ Missing TypeScript declarations for $package${NC}"
        ((ERRORS++))
    fi
    
    # Special checks for guardrails (has noop and factories)
    if [ "$package" = "guardrails" ]; then
        if [ ! -f "$DIST_DIR/noop.js" ]; then
            echo -e "${RED}❌ Missing noop.js for guardrails${NC}"
            ((ERRORS++))
        fi
        if [ ! -d "$DIST_DIR/factories" ]; then
            echo -e "${RED}❌ Missing factories directory for guardrails${NC}"
            ((ERRORS++))
        fi
    fi
    
    echo -e "${GREEN}✅ $package distribution files verified${NC}"
done

if [ $ERRORS -gt 0 ]; then
    echo -e "\n${RED}Found $ERRORS distribution file issues${NC}"
    exit 1
else
    echo -e "\n${GREEN}All distribution files verified successfully${NC}"
    exit 0
fi

