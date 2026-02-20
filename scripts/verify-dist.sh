#!/bin/bash

# Verify Distribution Files
# Ensures all expected distribution files exist after build

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Verify the packages that scripts/release.sh publishes.
NX_PACKAGES=(
    "core"
    "callable-syntax"
    "shared"
    "guardrails"
    "events"
    "realtime"
    "enterprise"
    "ng-forms"
)
ERRORS=0

echo "Verifying distribution files for independent packages..."
echo "(Matches the packages published by scripts/release.sh)"
echo ""

# Check Nx-built packages (output to dist/packages/$package)
for package in "${NX_PACKAGES[@]}"; do
    DIST_DIR="./dist/packages/$package"
    JS_DIR="$DIST_DIR/dist"

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

    # Check for compiled JS entry point
    if [ ! -d "$JS_DIR" ]; then
        echo -e "${RED}❌ Missing compiled output directory: $JS_DIR${NC}"
        ((ERRORS++))
    else
        if [ "$package" = "events" ]; then
            EVENTS_EXPECTED=(
                "$JS_DIR/index.js"
                "$JS_DIR/nestjs/index.js"
                "$JS_DIR/angular/index.js"
                "$JS_DIR/testing/index.js"
            )
            for expected in "${EVENTS_EXPECTED[@]}"; do
                RELATIVE_PATH="${expected#$JS_DIR/}"
                if [ ! -f "$expected" ]; then
                    echo -e "${RED}❌ Missing events artifact: $RELATIVE_PATH${NC}"
                    ((ERRORS++))
                else
                    echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
                fi
            done
        elif [ "$package" = "realtime" ]; then
            REALTIME_EXPECTED=(
                "$JS_DIR/index.js"
                "$JS_DIR/supabase/index.js"
            )
            for expected in "${REALTIME_EXPECTED[@]}"; do
                RELATIVE_PATH="${expected#$JS_DIR/}"
                if [ ! -f "$expected" ]; then
                    echo -e "${RED}❌ Missing realtime artifact: $RELATIVE_PATH${NC}"
                    ((ERRORS++))
                else
                    echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
                fi
            done
        elif [ "$package" = "guardrails" ]; then
            GUARDRAILS_EXPECTED=(
                "$JS_DIR/lib/guardrails.js"
                "$JS_DIR/factories/index.js"
                "$JS_DIR/noop.js"
            )
            for expected in "${GUARDRAILS_EXPECTED[@]}"; do
                RELATIVE_PATH="${expected#$JS_DIR/}"
                if [ ! -f "$expected" ]; then
                    echo -e "${RED}❌ Missing guardrails artifact: $RELATIVE_PATH${NC}"
                    ((ERRORS++))
                else
                    echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
                fi
            done
        else
            if [ ! -f "$JS_DIR/index.js" ]; then
                echo -e "${RED}❌ Missing index.js in $JS_DIR${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}✓ index.js found${NC}"
            fi
        fi
    fi

    # Check for TypeScript declarations
    if [ "$package" = "events" ]; then
        EVENTS_DTS=(
            "$DIST_DIR/src/index.d.ts"
            "$DIST_DIR/src/nestjs/index.d.ts"
            "$DIST_DIR/src/angular/index.d.ts"
            "$DIST_DIR/src/testing/index.d.ts"
        )
        for expected in "${EVENTS_DTS[@]}"; do
            RELATIVE_PATH="${expected#$DIST_DIR/}"
            if [ ! -f "$expected" ]; then
                echo -e "${RED}❌ Missing events declaration: $RELATIVE_PATH${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
            fi
        done
    elif [ "$package" = "realtime" ]; then
        REALTIME_DTS=(
            "$DIST_DIR/src/index.d.ts"
            "$DIST_DIR/src/supabase/index.d.ts"
        )
        for expected in "${REALTIME_DTS[@]}"; do
            RELATIVE_PATH="${expected#$DIST_DIR/}"
            if [ ! -f "$expected" ]; then
                echo -e "${RED}❌ Missing realtime declaration: $RELATIVE_PATH${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
            fi
        done
    elif [ "$package" = "ng-forms" ]; then
        NG_FORMS_DTS=(
            "$DIST_DIR/src/index.d.ts"
            "$DIST_DIR/src/audit/index.d.ts"
        )
        for expected in "${NG_FORMS_DTS[@]}"; do
            RELATIVE_PATH="${expected#$DIST_DIR/}"
            if [ ! -f "$expected" ]; then
                echo -e "${RED}❌ Missing ng-forms declaration: $RELATIVE_PATH${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
            fi
        done
    elif [ "$package" = "guardrails" ]; then
        # Guardrails has special entry points, skip generic index.d.ts check
        :
    elif [ ! -f "$JS_DIR/index.d.ts" ]; then
        echo -e "${RED}❌ Missing index.d.ts in $JS_DIR${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ index.d.ts found${NC}"
    fi

    if [ "$package" = "guardrails" ]; then
        EXTRA_DTS=(
            "$JS_DIR/noop.d.ts"
            "$JS_DIR/factories/index.d.ts"
        )
        for expected in "${EXTRA_DTS[@]}"; do
            RELATIVE_PATH="${expected#$JS_DIR/}"
            if [ ! -f "$expected" ]; then
                echo -e "${RED}❌ Missing guardrails declaration: $RELATIVE_PATH${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}✓ $RELATIVE_PATH found${NC}"
            fi
        done
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
