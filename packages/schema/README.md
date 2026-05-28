# @signaltree/schema

Schema-driven validation for SignalTree. StandardSchema-compatible, async-first, observe-only.

```ts
import { signalTree } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

const tree = signalTree({ user: { email: '', age: 0 } }).with(
  schemas({
    schemas: {
      'user.email': z.string().email(),
      'user.age': z.number().int().min(0),
    },
  }),
);

tree.$.user.email.set('not-an-email');
tree.schemas.errorsAt('user.email')(); // 'Invalid email'
tree.schemas.isValid(); // false
```

## Why this exists

- **One registry.** Register your schemas in one place; read errors per path or in aggregate. No more drift between form validation, server-action checks, and ad-hoc Zod calls.
- **StandardSchema interop.** Works with Zod, Valibot, ArkType, Effect Schema — anything that implements [`StandardSchemaV1`](https://github.com/standard-schema/standard-schema).
- **Async-first.** Schemas can return Promises. The write-sequence guard drops stale verdicts when a newer write supersedes an in-flight async run.
- **Observe-only.** The enhancer never blocks writes. Verdicts populate signals; that's it. (See [Why no reject mode](#why-no-reject-mode) below.)

## What it does NOT do

- **Does not block writes.** This is intentional — see [§Why no reject mode](#why-no-reject-mode).
- **Does not duplicate `@signaltree/guardrails`.** Guardrails is about performance and anti-patterns; schema is about data-shape conformance. Different jobs.
- **Does not yet integrate with Angular Signal Forms.** Signal Forms hasn't shipped in stable Angular yet. See [spike result](../ng-forms/spike/signal-form-bridge-spike.md). Wire `errorsAt(path)` into your template manually for now.

## Install

```sh
pnpm add @signaltree/schema @signaltree/core
# plus your schema library:
pnpm add zod    # or valibot, arktype, etc.
```

## API

### `schemas(config)`

Returns an enhancer. Apply via `.with(schemas({...}))`.

```ts
interface SchemaConfig {
  schemas: Record<SchemaPath, StandardSchemaV1>;
  mode?: 'accept' | 'warn'; // default 'accept'
  validateOnAttach?: boolean; // default true
  suppressIntents?: ReadonlyArray<NonNullable<UpdateMetadata['intent']>>;
  suppressSources?: ReadonlyArray<NonNullable<UpdateMetadata['source']>>;
  onError?: (path: string, message: string) => void;
  formatIssue?: (issue: StandardSchemaV1.Issue, path: string) => string;
}
```

### `tree.schemas.*` (after `.with(schemas({...}))`)

| Member | Type | Purpose |
|---|---|---|
| `errors` | `Signal<Record<path, string \| null>>` | Path → last-settled error message (or null) |
| `errorList` | `Signal<readonly string[]>` | Flat list of current error messages |
| `isValid` | `Signal<boolean>` | True iff every path's last-settled verdict is valid. **O(1) per read.** |
| `pending` | `Signal<boolean>` | True iff any path has an in-flight async run |
| `pendingPaths` | `Signal<readonly string[]>` | Paths with in-flight async runs |
| `errorsAt(path)` | `Signal<string \| null>` | Memoized per-path error signal |
| `isValidAt(path)` | `Signal<boolean>` | Memoized per-path validity |
| `isPendingAt(path)` | `Signal<boolean>` | Memoized per-path pending state |
| `validate()` | `Promise<boolean>` | Re-run all schemas, resolve to current `isValid()` |
| `validatePath(path)` | `Promise<boolean>` | Re-run schemas for one path |
| `compact()` | `void` | Manual GC — evict bound paths that no longer resolve |
| `boundPaths` | `Signal<readonly string[]>` | All currently-bound leaf paths (reactive) |

## Entity collections — register at fields, not the collection root

Use wildcard schemas (`users.*.email`) to validate **individual entity fields**. Do NOT register a schema at the collection root itself (`users`):

```ts
// ✅ CORRECT — wildcard schemas validate each entity's fields
schemas({
  schemas: {
    'users.*.email': z.string().email(),
    'users.*.age': z.number().int().min(0),
  },
});

// ❌ AVOID — registering at the collection root receives the entityMap's
// full marker value (an object with `all`/`ids`/`entities` internals),
// not an array of users. Your Zod array schema will fail.
schemas({
  schemas: {
    users: z.array(userSchema),  // gets the entityMap value, not the user array
  },
});
```

Entity collections (markers like `entityMap()`) are normalized state, not arrays. They're meant to be queried via `.all()`, `.byId(id)`, `.where(...)`. Individual fields within entities are the validation surface.

## Wildcard paths

Use `*` segments to match entity collections:

```ts
schemas({
  schemas: {
    'user.email': z.string().email(),         // specific leaf
    'users.*.email': z.string().email(),      // wildcard — every users entity
    'orders.*.items.*.qty': z.number().int(), // nested wildcards
    'profile': profileSchema,                 // ancestor schema (whole subtree)
  },
});
```

**Precedence** (D4 in the architecture plan):
- **Specific > wildcard > ancestor.** A schema at `users.42.email` always wins over `users.*.email`, which always wins over a `users` ancestor.
- Each leaf has exactly one owner. The owner is chosen at first-match time and cached.

## Ancestor schemas

A schema registered at a non-leaf path (e.g., `user`) validates the whole subtree at that path. The schema runs against a fresh snapshot every time a covered leaf is written. Issues are distributed to the leaves they reference via `issue.path`.

```ts
schemas({
  schemas: {
    user: z.object({
      email: z.string().email(),
      age: z.number().int().min(0),
    }),
  },
});

tree.$.user.email.set('bad');
tree.schemas.errorsAt('user.email')(); // 'Invalid email'
tree.schemas.errorsAt('user.age')();   // depends on current age value
```

Issues from ancestor schemas use the leaf's nearest-match path via `issueToLeafPath`. The per-leaf staleness guard ensures slow ancestor runs can't clobber faster leaf writes that happened mid-flight.

## Async semantics

Async schemas (Valibot, custom uniqueness checks, etc.) return Promises. Behavior:

- **Pending state:** while a schema is in flight, `pending()` is true, `pendingPaths()` includes the path, `isPendingAt(path)()` is true.
- **Last-settled verdict:** `errorsAt`, `isValid`, etc. read the **last settled** verdict — they don't flicker to null during in-flight runs.
- **Write-sequence guard:** if a newer write happens while an older schema run is in flight, the older verdict is dropped on settle (orphaned). The promise still resolves to completion (we can't abort it); only its verdict is discarded.

### Debounce `validate()` for I/O-bound schemas

`validate()` called repeatedly during typing piles up orphaned network requests that all run to completion before being discarded. If your schemas hit a server, debounce the caller:

```ts
const debouncedValidate = debounce(() => tree.schemas.validate(), 300);
```

## Suppression — skip validation for replays

By default, validation runs on every write — including time-travel replays, hydration, and migrations. To suppress for specific intents/sources:

```ts
schemas({
  schemas: { ... },
  suppressIntents: ['hydrate', 'migration'],
  suppressSources: ['time-travel'],
});
```

The suppression reads the ambient write-context set via `withWriteContext()` from `@signaltree/core`. Devtools time-travel and the time-travel enhancer already wrap their replays in `withWriteContext({ source: 'time-travel' })`.

**Do not suppress `source: 'serialization'`** — deserialize is the canonical ingest case validation exists for.

## Compaction (`compact()`)

The registry's `boundPathsSet` is bounded by **distinct leaf paths ever written that matched a schema**, not by current entity count. A long-lived `users.*.email` over a session that churns 10,000 user rows will retain 10,000 `PathState` entries.

Call `tree.schemas.compact()` periodically (e.g., on tab visibility change, or after entity-bulk-removal) to evict bound paths that no longer resolve in the tree.

```ts
// After removing entities:
tree.schemas.compact();
```

## Why no reject mode

Some readers reach for `mode: 'reject'`. We don't offer it. Reasons:

1. **Async schemas can't gate synchronously.** A Promise-returning schema means the write has already notified subscribers before the verdict arrives. "Reject" would mean silently rolling back state subscribers already saw.
2. **Sync schemas don't save it either.** The enhancer observes writes via `interceptLeafSignals` — *after* the underlying signal has updated. There's no pre-write hook.
3. **It's not a validation problem.** The right place to gate input is the form layer (Signal Forms' field validators, ReactiveForms' validators). The store edge is a reporter, not a gate.

If you genuinely need to refuse a write: gate it in the form, in a guardrails rule, or in a wrapper around your write site.

## Bundle size

~4.3 KB gzipped. Tree-shakable. Angular is a peer dependency.

## Migration: `UpdateMetadata` lifted to core

In v9.3, `UpdateMetadata` was lifted from `@signaltree/guardrails` to `@signaltree/core`. If you imported it from guardrails, update the import:

```ts
// Before (still works as deprecated re-export)
import type { UpdateMetadata } from '@signaltree/guardrails';

// After
import type { UpdateMetadata } from '@signaltree/core';
```

## See also

- [Architecture plan](../../docs/architecture/validation-enhancer-plan.md) — design decisions and trade-offs
- [`@signaltree/core`](../core) — base library
- [`@signaltree/guardrails`](../guardrails) — performance and anti-pattern detection (different concern)
