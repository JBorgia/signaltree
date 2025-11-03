# Remove Logs Codemod — dry-run instructions

## Purpose

This codemod safely removes direct `console.*` calls and neutralizes simple E2E console handlers under `apps/demo`.

Files added

- `tools/codemods/remove-console.js` — jscodeshift transform that removes `console.*` expression statements and simple inline patterns.

## How to run (dry-run preview)

Install jscodeshift (if you don't have it):

```bash
npx jscodeshift -v || pnpm dlx jscodeshift@0.13.0 --version
```

Run a dry-run to preview edits (no files changed):

```bash
npx jscodeshift -t tools/codemods/remove-console.js apps/demo --extensions=ts,tsx,js,jsx --parser=tsx --dry
```

To apply changes (after review):

```bash
npx jscodeshift -t tools/codemods/remove-console.js apps/demo --extensions=ts,tsx,js,jsx --parser=tsx
```

## Safety notes

- This codemod purposely avoids touching complex expressions; it removes only top-level console expression statements and simple inline patterns (if statements, logical && used as statements).
- It comments-out `page.on('console', ...)` calls in E2E files so manual review can confirm whether to remove or replace them.
- Before running a mass apply, create a snapshot branch or archive of files to allow easy rollback.

## Next steps

1. Run a dry-run and inspect changes.
2. If results look good, run on a small set of files and run tests.
3. Apply to full `apps/demo` in a topic branch and follow the PR checklist.
