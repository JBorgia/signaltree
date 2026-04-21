# Install

Version and install steps derived from each package's `peerDependencies` in `packages/<pkg>/package.json` (tiebreaker: `package.json` itself).

## Required runtime

- **Angular 20 or 21** — every Angular-consuming package declares
  `@angular/core: ^20.0.0 || ^21.0.0` in `peerDependencies`. SignalTree runs on
  both Angular 20 and 21 unchanged.
- **TypeScript** — whatever your Angular project already pins.
- **Node / package manager** — your normal Angular toolchain.

Never instruct consumers to install `@signaltree/shared`, `@signaltree/types`, or `@signaltree/utils`. These are **private** packages bundled into the public `@signaltree/*` packages at build time.

## Core

```bash
npm install @signaltree/core
```

Required peer deps (from `packages/core/package.json`):
`@angular/core ^20.0.0 || ^21.0.0`, `tslib ^2.0.0`. `@angular/compiler`, `@angular/platform-browser-dynamic`, and `zone.js` are declared optional peers.

## Optional packages

Install only what you need. Each package declares `@signaltree/core` as a peer.

### `@signaltree/ng-forms`

```bash
npm install @signaltree/ng-forms
```

Adds `@angular/forms ^20.0.0 || ^21.0.0` and `rxjs ^7.0.0` as peers. Read [`../ng-forms/SKILL.md`](../ng-forms/SKILL.md).

### `@signaltree/enterprise`

```bash
npm install @signaltree/enterprise
```

Licensed under BSL-1.1 (see the package `package.json`). Peers: `@angular/core ^20.0.0 || ^21.0.0`, `@signaltree/core`. Read [`../enterprise/SKILL.md`](../enterprise/SKILL.md).

### `@signaltree/callable-syntax`

```bash
npm install --save-dev @signaltree/callable-syntax
```

Build-time-only transform — **install as a dev dependency**. Zero bytes at runtime. Wire into your build via the Vite plugin (`@signaltree/callable-syntax/vite`) or the Webpack plugin (`@signaltree/callable-syntax/webpack`). Detailed setup lives in [`../callable-syntax/SKILL.md`](../callable-syntax/SKILL.md).

### `@signaltree/guardrails`

```bash
npm install --save-dev @signaltree/guardrails
```

Development-only package. Its `exports` map resolves to `./dist/noop.js` under the `production` condition, so production bundles contain only no-ops. Peers: `@signaltree/core ^9.0.0`, `tslib ^2.0.0`. Read [`../guardrails/SKILL.md`](../guardrails/SKILL.md).

### `@signaltree/events`

```bash
npm install @signaltree/events zod
```

**ESM-only.** Zod is a required runtime peer. Optional peers (install only when using the matching subpath): `@nestjs/common`, `bullmq`, `ioredis`, `@angular/core`, `rxjs`, `reflect-metadata`, `socket.io-client`. Read [`../events/SKILL.md`](../events/SKILL.md).

### `@signaltree/realtime`

```bash
npm install @signaltree/realtime
```

Peers: `@angular/core ^20.0.0 || ^21.0.0`, `@signaltree/core ^9.0.0`, `tslib ^2.0.0`. `@supabase/supabase-js ^2.0.0` and `firebase` are **optional** peers — install the one that matches your backend. Read [`../realtime/SKILL.md`](../realtime/SKILL.md).

## Verifying the install

After installing, a minimal smoke test:

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({ ok: true });
console.assert(tree.$.ok() === true);
```

If that typechecks and runs, `@signaltree/core` is wired correctly. Repeat per optional package as you add it.
