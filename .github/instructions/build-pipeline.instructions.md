---
applyTo: '**'
---

# SignalTree Build & Packaging Directive

## Context

Historical issues with the Nx `@nx/js:tsc` pipeline and ad-hoc post-build copy scripts allowed incomplete `dist/` folders to be published. To eliminate this failure mode permanently, all SignalTree libraries must ship using a bundler that emits the final publishable layout directly. The chosen strategy is to adopt an ESM-preserving bundler configuration (e.g. tsup, Rollup, or esbuild) with `preserveModules` enabled so tree-shaking remains fully effective.

## Mandatory Approach

- **Executor**: Use an Nx bundler executor (`@nx/rollup:rollup`, `@nx/esbuild:esbuild`, or equivalent) instead of `@nx/js:tsc` for publishable packages.
- **Module Format**: Emit pure ESM with `preserveModules: true` (or the equivalent flag). The bundler must generate one output file per source module (e.g. `dist/enhancers/batching/index.js`), preserving compatibility with consumer tree-shaking.
- **Output Layout**: Configure the bundler so `dist/` contains the final artifacts referenced by each package manifest (`main`, `module`, `types`, `exports`). Manual `src -> dist` copy steps are forbidden.
- **Consolidated Target**: Each package’s `build` target must be a single bundler invocation that produces ready-to-publish output. No separate “post-build” scripts are allowed.
- **Release Hook**: Workspace release automation must rely solely on these bundler-based build targets. Additional file-system manipulations (copying, pruning) require explicit justification and review.

## Required Optimizations

When configuring the bundler, enable production optimizations that TypeScript’s compiler does not provide:

- Strip console/debugger statements for production bundles (`drop: ['console', 'debugger']` or equivalent).
- Define `__DEV__ = false` (or similar guard) so dead dev-only branches can be removed.
- Emit consolidated `.d.ts` bundles (`dts: true`, Rollup `@rollup/plugin-typescript`, etc.) matching the preserved module layout.

## Rationale (summarize for future maintainers)

1. **Tree-Shaking Preserved**: With `preserveModules: true`, consumers still import individual ESM modules. Modern bundlers tree-shake these modules exactly as before; no functionality is lost.
2. **Reliability**: A single tool owns the build pipeline, eliminating fragile post-build copy scripts and timing issues. `dist/` is always in the correct shape before publishing.
3. **Production Hygiene**: Bundlers provide hooks to strip dev-only code, drop logging, and inject compile-time flags—capabilities the raw `tsc` pipeline lacks.
4. **Diagnostics & Maintenance**: Fewer moving parts mean clearer build failures and lower maintenance overhead. This is now the standard approach across the project.

## Compliance Checklist

Any future change to library build pipelines must:

- Justify deviations from this directive in the PR description.
- Demonstrate that tree-shaking remains intact (e.g. via `scripts/test-tree-shaking.js`).
- Show an `npm pack --dry-run` output confirming that `dist/` contains the expected module files with no extra post-processing.

Adhering to this directive ensures every release contains complete, optimised artifacts without relying on brittle manual steps.
