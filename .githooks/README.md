# Git Hooks Setup

This directory contains git hooks for maintaining code quality and bundle size requirements.

## Setup

To enable git hooks for this repository:

```bash
# Set git hooks directory
git config core.hooksPath .githooks

# Make hooks executable (on Unix-like systems)
chmod +x .githooks/pre-commit
```

## Available Hooks

### pre-commit

- **Purpose**: Validates bundle sizes before commits
- **Action**: Runs `npm run size:check`
- **Behavior**:
  - ✅ Allows commit if all packages pass size requirements
  - ❌ Blocks commit if any package exceeds size targets
  - Provides guidance on optimization resources

### Usage

The hooks run automatically once configured. To bypass (not recommended):

```bash
git commit --no-verify
```

## Troubleshooting

If pre-commit hook fails:

1. Run `npm run size:report` for detailed analysis
2. Check [Bundle Optimization Guide](../docs/performance/bundle-optimization.md)
3. Use [Optimization Checklist](../docs/OPTIMIZATION-CHECKLIST.md)
4. Fix size issues and commit again

## CI/CD Integration

The same checks run in CI/CD via GitHub Actions workflows:

- `bundle-size-check.yml`: Basic size validation
- `bundle-size-monitor.yml`: Detailed reporting with PR comments
