# SignalTree Project Instructions

This directory contains **mandatory** instructions for AI agents and developers working on the SignalTree project.

## ⚠️ Critical: These Are Not Suggestions

All `.instructions.md` files in this directory define **required** processes and architectural decisions. Violating these instructions can result in:

- Broken npm packages
- User-facing bugs
- Build pipeline failures
- Wasted development time

## Active Instructions

### 1. [build-pipeline.instructions.md](./build-pipeline.instructions.md)
**Purpose**: Defines the mandatory build architecture for all SignalTree libraries.

**Key Requirements**:
- Use bundler executors (Rollup/esbuild), not `@nx/js:tsc`
- Emit pure ESM with `preserveModules: true`
- Single bundler invocation per package (no post-build scripts)
- Production optimizations (drop console, define `__DEV__`, emit d.ts bundles)

**Why It Exists**: Historical issues with incomplete `dist/` folders and unreliable copy scripts.

**When to Consult**: Before modifying any library build targets or adding new publishable packages.

---

### 2. [nx.instructions.md](./nx.instructions.md)
**Purpose**: Defines how to work with the Nx workspace and use Nx MCP server tools.

**Key Requirements**:
- Use `nx_workspace` tool to understand architecture
- Use `nx_docs` tool for up-to-date Nx configuration
- Use `nx_generators` for code generation
- Use `nx run <taskId>` to rerun tasks
- Always use Nx-aware commands when available

**Why It Exists**: Nx provides sophisticated workspace management that must be used correctly.

**When to Consult**: Before running any Nx commands, creating new projects, or troubleshooting build issues.

---

### 3. [release-process.instructions.md](./release-process.instructions.md) 🆕
**Purpose**: Defines the **mandatory** release process to prevent publishing broken packages.

**Key Requirements**:
- Run `npm run validate:all` before any release
- Use `pnpm nx release [patch|minor|major] --yes` (never manual versioning)
- Verify `validate:types` passes (no stray dist/**/*.d.ts files)
- Test installation in clean project after publishing
- Push tags to GitHub after successful npm publish

**Why It Exists**: v4.1.0 was published with broken type declarations. This must never happen again.

**When to Consult**: **EVERY TIME** before releasing any version to npm.

---

### 4. [type-declarations-fix.md](./type-declarations-fix.md)
**Purpose**: Documents the root cause and solution for the v4.1.0 type declaration bug.

**Key Context**:
- Nx's typeDefinitions plugin generates incorrect re-export files
- package.json `files` array must exclude `dist/**/*.d.ts`
- Verification script (`scripts/verify-no-broken-dts.sh`) prevents regression

**Why It Exists**: Provides historical context and technical details for the fix applied in v4.1.1.

**When to Consult**: When troubleshooting TypeScript resolution issues or modifying package.json files arrays.

---

## How AI Agents Should Use These Instructions

### Before Starting Work

1. **Read the `applyTo` frontmatter** to see which files the instruction applies to
2. **Understand the context** - why does this instruction exist?
3. **Check for related instructions** - some instructions reference others

### During Work

1. **Validate compliance** - does your planned change violate any instruction?
2. **Ask clarifying questions** if instructions seem to conflict with requirements
3. **Document exceptions** if you must deviate (with explicit justification)

### Critical Scenarios

#### Releasing a New Version
→ **MUST** follow `release-process.instructions.md` step-by-step

#### Modifying Build Configuration
→ **MUST** comply with `build-pipeline.instructions.md`

#### Adding New Package
→ **MUST** follow both `build-pipeline.instructions.md` AND `nx.instructions.md`

#### Troubleshooting Type Errors
→ **SHOULD** review `type-declarations-fix.md` for known issues

## Adding New Instructions

If you need to document a new mandatory process:

1. Create `[topic].instructions.md` in this directory
2. Add frontmatter with `applyTo: '**'` (or specific glob pattern)
3. Structure as:
   - **Purpose** - What does this instruction govern?
   - **Key Requirements** - What are the mandatory rules?
   - **Why It Exists** - What problem does this prevent?
   - **When to Consult** - When should developers read this?
4. Update this README with a section for the new instruction

## Questions?

If these instructions are unclear, outdated, or conflicting:

1. **Ask the user** before proceeding
2. **Suggest updates** to clarify the instruction
3. **Document your reasoning** if you must deviate

**Remember**: These instructions exist to prevent real problems that have occurred in production. Respect them.
