#!/bin/bash

# Validate Documentation
# Ensures documentation is complete and up-to-date

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WARNINGS=0
ERRORS=0

echo "Validating documentation..."

# Check for required files
REQUIRED_DOCS=("README.md" "CHANGELOG.md" "LICENSE")

for doc in "${REQUIRED_DOCS[@]}"; do
    if [ ! -f "$doc" ]; then
        echo -e "${RED}❌ Missing required documentation: $doc${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✅ Found: $doc${NC}"
    fi
done

# Check CHANGELOG for current version
if [ -f "CHANGELOG.md" ]; then
    CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    
    if [ "$CURRENT_VERSION" != "unknown" ]; then
        if grep -q "$CURRENT_VERSION" CHANGELOG.md; then
            echo -e "${GREEN}✅ CHANGELOG.md includes version $CURRENT_VERSION${NC}"
        else
            echo -e "${YELLOW}⚠️  CHANGELOG.md may not include version $CURRENT_VERSION${NC}"
            ((WARNINGS++))
        fi
    fi
fi

# Check for package-specific READMEs
PACKAGES=("core" "ng-forms" "callable-syntax" "enterprise" "guardrails")

for package in "${PACKAGES[@]}"; do
    README_PATH="./packages/$package/README.md"
    if [ ! -f "$README_PATH" ]; then
        echo -e "${YELLOW}⚠️  Missing README for $package${NC}"
        ((WARNINGS++))
    else
        # Check if README has substantial content (more than just a title)
        LINE_COUNT=$(wc -l < "$README_PATH")
        if [ "$LINE_COUNT" -lt 10 ]; then
            echo -e "${YELLOW}⚠️  README for $package seems too short (${LINE_COUNT} lines)${NC}"
            ((WARNINGS++))
        fi
    fi
done

# Check for benchmark results documentation
if [ -f "scripts/perf-suite.js" ]; then
    if ! grep -q "performance" README.md; then
        echo -e "${YELLOW}⚠️  README.md may not document performance benchmarks${NC}"
        ((WARNINGS++))
    fi
fi

# Check for bundle size documentation
if [ -f "scripts/consolidated-bundle-analysis.js" ]; then
    if ! grep -q "bundle size" README.md; then
        echo -e "${YELLOW}⚠️  README.md may not document bundle sizes${NC}"
        ((WARNINGS++))
    fi
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}Documentation validation failed with $ERRORS error(s)${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Documentation validation passed with $WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${GREEN}All documentation validated successfully${NC}"
    exit 0
fi

