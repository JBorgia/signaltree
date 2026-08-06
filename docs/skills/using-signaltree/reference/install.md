# Install

Version and install steps derived from each package's `peerDependencies` in `packages/<pkg>/package.json` (tiebreaker: `package.json` itself).

## Required runtime

- **Angular 20, 21, or 22** — every Angular-consuming package declares
  `@angular/core: ^20.0.0 || ^21.0.0 || ^22.0.0` in `peerDependencies`.
  SignalTree runs on Angular 20, 21, and 22 unchanged.
- **TypeScript** — whatever your Angular project already pins.
- **Node / package manager** — your normal Angular toolchain.

Never instruct consumers to install `@signaltree/shared`, `@signaltree/types`, or `@signaltree/utils`. These are **private** packages bundled into the public `@signaltree/*` packages at build time.

## Core

```bash
npm install @signaltree/core
# yarn:  yarn add @signaltree/core
# pnpm:  pnpm add @signaltree/core            # in a single-package repo
#        pnpm add -w @signaltree/core         # in a pnpm workspace, install at the workspace root
#        pnpm --filter <pkg> add @signaltree/core   # in a pnpm workspace, install in one package only
```

> **pnpm workspaces:** plain `pnpm add @signaltree/core` from the workspace root fails with `ERR_PNPM_ADDING_TO_ROOT`. Use `-w` for the workspace root, or `--filter <pkg>` to scope to one workspace package.

Required peer deps (from `packages/core/package.json`):
`@angular/core ^20.0.0 || ^21.0.0 || ^22.0.0`, `tslib ^2.0.0`. `@angular/compiler`, `@angular/platform-browser-dynamic`, and `zone.js` are declared optional peers.

## Optional packages

Install only what you need. Each package declares `@signaltree/core` as a peer.

### `@signaltree/ng-forms`

```bash
npm install @signaltree/ng-forms
```

Adds `@angular/forms ^20.0.0 || ^21.0.0 || ^22.0.0` and `rxjs ^7.0.0` as peers. Read [`../ng-forms/SKILL.md`](../ng-forms/SKILL.md).

### `@signaltree/enterprise` — DEPRECATED, do not install

Deprecated in 13.5.0 and superseded by `tree.updateAndReport()`, built into `@signaltree/core` (there is NO `onPathChange` in core). It is measurably slower than the core methods that replaced it and has an unfixed array data-loss defect. Read [`../enterprise/SKILL.md`](../enterprise/SKILL.md) only to migrate an existing dependency off it.

### `@signaltree/callable-syntax` — DELETED in 14.0.0, do not install

The package is gone and there is no replacement, because there was nothing to
replace: it existed to rewrite `tree.$.leaf(value)` into `tree.$.leaf.set(value)`
at build time, and **it could not run inside an Angular app at all**
(`@angular/build:application` exposes no `plugins`; `codePlugins` runs after
ngtsc has claimed every `.ts`; ngtsc's transformer list is hardcoded; ts-patch
goes inert under `isolatedModules`). So for Angular users that call
type-checked and then silently did nothing.

`@signaltree/core@14` removes the type overloads too, making it a compile error.
Write leaves with `.set()` / `.update()`; branches and the root remain callable
natively.

Its `/augmentation` entry is also gone. It globally augmented Angular's
`WritableSignal<T>`, which re-introduced the `@ngrx/signals` invariance conflict
core had deliberately removed (~30 `TS2345` errors in mixed codebases). There is
no supported way to make a raw Angular signal callable-as-setter, and asking for
one is a sign the leaf/branch distinction has been missed.

### `@signaltree/guardrails`

```bash
npm install --save-dev @signaltree/guardrails
```

Development-only package. Its `exports` map resolves to `./dist/noop.js` under the `production` condition, so production bundles contain only no-ops. Peers: `@signaltree/core ^9.0.1`, `tslib ^2.0.0`. Read [`../guardrails/SKILL.md`](../guardrails/SKILL.md).

### `@signaltree/events`

```bash
npm install @signaltree/events zod
```

**ESM-only.** Zod is a required runtime peer. Optional peers (install only when using the matching subpath): `@nestjs/common`, `bullmq`, `ioredis`, `@angular/core`, `rxjs`, `reflect-metadata`, `socket.io-client`. Read [`../events/SKILL.md`](../events/SKILL.md).

### `@signaltree/realtime`

```bash
npm install @signaltree/realtime
```

Peers: `@angular/core ^20.0.0 || ^21.0.0 || ^22.0.0`, `@signaltree/core ^9.0.0`, `tslib ^2.0.0`. `@supabase/supabase-js ^2.0.0` and `firebase` are **optional** peers — install the one that matches your backend. Read [`../realtime/SKILL.md`](../realtime/SKILL.md).

## Verifying the install

After installing, a minimal smoke test:

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({ ok: true });
console.assert(tree.$.ok() === true);
```

If that typechecks and runs, `@signaltree/core` is wired correctly. Repeat per optional package as you add it.
