# 📦 NPM Publishing Setup Guide for @signaltree/\* Packages

## 🎯 Overview

Since `signal-tree` (monolithic) is already published on NPM, we're moving to scoped packages under `@signaltree/` for the new modular architecture.

## 📋 Prerequisites Setup

### 1. NPM Account & Organization

```bash
# 1. Create NPM account (if you don't have one)
# Visit: https://www.npmjs.com/signup

# 2. Login to NPM CLI
npm login

# 3. Create @signaltree organization (if it doesn't exist)
# Visit: https://www.npmjs.com/org/create
# Or run: npm org create signaltree

# 4. Verify you can publish to the org
npm org ls signaltree
```

### 2. Verify Package Access

```bash
# Check if you can list packages for the org (correct syntax)
npm access list packages @signaltree

# Alternative: Check your organizations
npm org ls signaltree

# If the org doesn't exist, create it:
npm org create signaltree

# Note: Since no packages are published yet,
# "npm access list packages @signaltree" will return empty until first publish
```

## 🔧 Package Configuration Updates

All packages are already configured correctly:

```json
{
  "name": "@signaltree/core",
  "version": "0.0.1",
  "sideEffects": false,
  "peerDependencies": {
    "@angular/common": "^20.1.0",
    "@angular/core": "^20.1.0"
  }
}
```

## 🚀 Publishing Process

### Option 1: Automated Release (Recommended)

```bash
# Make sure you're logged into NPM
npm whoami

# Run the release script
./scripts/release.sh patch   # 0.0.1 → 0.0.2
./scripts/release.sh minor   # 0.0.1 → 0.1.0
./scripts/release.sh major   # 0.0.1 → 1.0.0
```

### Option 2: Manual Step-by-Step

```bash
# 1. Test and build all packages (one by one)
nx test core && nx test batching && nx test memoization && nx test middleware && nx test async && nx test entities && nx test devtools && nx test time-travel && nx test presets && nx test ng-forms

nx build core && nx build batching && nx build memoization && nx build middleware && nx build async && nx build entities && nx build devtools && nx build time-travel && nx build presets && nx build ng-forms

# 2. Update versions manually (or use the script)
# Edit each packages/*/package.json

# 3. Publish individual packages
cd dist/packages/core && npm publish --access public
cd dist/packages/batching && npm publish --access public
# ... repeat for all packages
```

## 🎯 NPM Registry Setup

### Publishing Configuration

The release script is already configured for scoped packages:

```bash
# Each package will be published as:
@signaltree/core@0.0.1
@signaltree/batching@0.0.1
@signaltree/memoization@0.0.1
@signaltree/middleware@0.0.1
@signaltree/async@0.0.1
@signaltree/entities@0.0.1
@signaltree/devtools@0.0.1
@signaltree/time-travel@0.0.1
@signaltree/presets@0.0.1
@signaltree/ng-forms@0.0.1
```

### Access Control

```bash
# Make sure all packages are public (correct syntax)
npm access set status=public @signaltree/core
npm access set status=public @signaltree/batching
# ... etc (the release script handles this automatically)

# Check package status
npm access get status @signaltree/core
```

## 📊 Package Relationships

### Core Dependencies

```
@signaltree/core (base package)
├── @signaltree/batching (depends on core)
├── @signaltree/memoization (depends on core)
├── @signaltree/middleware (depends on core)
├── @signaltree/async (depends on core)
├── @signaltree/entities (depends on core)
├── @signaltree/devtools (depends on core)
├── @signaltree/time-travel (depends on core)
├── @signaltree/presets (depends on core)
└── @signaltree/ng-forms (depends on core)
```

### User Installation

```bash
# Users will install packages like this:

# Basic setup
npm install @signaltree/core

# With batching
npm install @signaltree/core @signaltree/batching

# Full featured
npm install @signaltree/core @signaltree/batching @signaltree/memoization @signaltree/time-travel
```

## ⚠️ Important Notes

### 1. Scoped Package Naming

- All packages use `@signaltree/` prefix
- This avoids conflicts with the existing `signal-tree` package
- Provides clear namespace ownership

### 2. Version Synchronization

- All packages should use the same version number
- The release script handles this automatically
- Makes it easier for users to know compatible versions

### 3. Access Control

- All packages must be published with `--access public`
- The release script includes this flag
- Required for scoped packages to be publicly available

### 4. Peer Dependencies

- Inter-package dependencies use `*` in development
- Release script updates these to specific versions (e.g., `^0.0.1`)
- Ensures version compatibility

## 🧪 Testing Before Publication

```bash
# 1. Test the release process locally (dry run)
npm pack # In each dist/packages/* directory

# 2. Test installation in a separate project
mkdir test-install && cd test-install
npm init -y
npm install ../dist/packages/core/signaltree-core-0.0.1.tgz

# 3. Test the packages work
echo "import { signalTree } from '@signaltree/core';" > test.js
node test.js
```

## 🎯 First Release Checklist

- [ ] NPM account created and verified
- [ ] `@signaltree` organization created on NPM
- [ ] Logged into NPM CLI (`npm whoami`)
- [ ] All tests passing (use release script to run all tests)
- [ ] All packages building (use release script to build all packages)
- [ ] Release script permissions (`chmod +x scripts/release.sh`)
- [ ] Run first release (`./scripts/release.sh patch`)

## 📈 Post-Release

After successful publishing:

1. **Update README.md** with new installation instructions
2. **Update documentation** to reference `@signaltree/*` packages
3. **Create GitHub Release** (automated by the script)
4. **Update the old `signal-tree` package** with migration notice
5. **Notify users** about the new modular packages

## 🔗 URLs After Publishing

- NPM: `https://www.npmjs.com/package/@signaltree/core`
- GitHub: `https://github.com/JBorgia/signal-tree/releases`
- Documentation: Update to reference new packages

## 🚨 Troubleshooting

### Permission Issues

```bash
# If you get permission errors:
npm login
npm whoami
npm org ls signaltree
```

### Version Conflicts

```bash
# If versions get out of sync:
# Edit packages manually or re-run release script
```

### Build Failures

```bash
# Clean and rebuild (use the release script for all packages):
nx reset
./scripts/release.sh patch

# Or build individual packages:
nx build core
nx build batching
# ... etc

# If you get "@signal-tree/source" errors, exclude it from builds
# The source project is not meant to be built as a package
```

Ready to publish? Run: `./scripts/release.sh patch`
