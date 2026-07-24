---
name: signaltree-schema
description: Guides AI agents attaching @signaltree/schema for StandardSchema-driven validation against SignalTree leaf paths. Async-first, observe-only (never blocks writes), supports wildcard + ancestor schemas. Triggers on @signaltree/schema, schema validation, Zod integration, Valibot integration, StandardSchema, validation enhancer, errorsAt, isValid, async validation, schema registry, wildcard paths.
---

# Using @signaltree/schema

Enhancer for schema-driven validation. Register StandardSchema-compatible schemas (Zod / Valibot / ArkType / Effect Schema / any StandardSchemaV1) against dotted leaf paths; read errors per path or in aggregate. Observe-only: never blocks writes. Async-first with a write-sequence guard that drops stale verdicts.

Install:

```bash
npm install @signaltree/schema @signaltree/core @standard-schema/spec
npm install zod   # or valibot, arktype, etc.
```

Peer: `@signaltree/core ^9`, `@standard-schema/spec ^1`, `@angular/core ^20 || ^21`.

## Basic — sync leaf schemas

```ts
import { signalTree } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

interface State { user: { email: string; age: number } }

const tree = signalTree<State>({ user: { email: '', age: 0 } }).with(
  schemas({
    schemas: {
      'user.email': z.string().email(),
      'user.age': z.number().int().min(0),
    },
  }),
);

tree.$.user.email.set('not-an-email');
tree.schemas.errorsAt('user.email')();  // 'Invalid email'
tree.schemas.isValid();                  // false
```

## Async schemas — pending state + write-sequence guard

```ts
import { z } from 'zod';

const usernameSchema = z.string().refine(
  async (value) => {
    const r = await fetch(`/api/check-username?u=${value}`);
    return (await r.json()).available;
  },
  { message: 'Username taken' },
);

const tree = signalTree({ user: { username: '' } }).with(
  schemas({ schemas: { 'user.username': usernameSchema } }),
);

tree.$.user.username.set('jonathan');
tree.schemas.isPendingAt('user.username')();  // true (in flight)
// On settle:
tree.schemas.errorsAt('user.username')();      // null or 'Username taken'
```

The write-sequence guard drops stale verdicts. If a newer write arrives mid-flight, the older schema run is orphaned — its promise still resolves (we can't abort it), but its verdict is discarded.

**Debounce `validate()` for I/O-bound schemas.** Calling `validate()` per keystroke piles up orphaned network requests. Wrap in a debounce.

## Wildcard schemas — entity collections

**Register at entity fields, NOT at the collection root.** Entity-marker signals (`entityMap()`, etc.) hold normalized state — an object with internal `.all` / `.ids` / `.entities` — not an array. A schema registered at the collection root receives that internal shape and won't validate as expected.

```ts
// ✅ CORRECT — validate each entity's fields via wildcards
schemas({
  schemas: {
    'users.*.email': z.string().email(),
    'users.*.age': z.number().int().min(0),
    'orders.*.items.*.qty': z.number().int().positive(),
  },
});

tree.$.users.u42.email.set('bad');
tree.schemas.errorsAt('users.u42.email')();  // 'Invalid email'

// ❌ AVOID — registering at the collection root
schemas({
  schemas: { users: z.array(userSchema) },  // receives entityMap marker, not an array
});
```

Patterns are matched lazily on first write — no upfront entity enumeration cost.

## Ancestor schemas — validate a whole subtree

```ts
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

const tree = signalTree({ user: { email: '', age: -1 } }).with(
  schemas({ schemas: { user: userSchema } }),
);

tree.$.user.email.set('bad');
tree.schemas.errorsAt('user.email')();  // 'Invalid email'
tree.schemas.errorsAt('user.age')();    // 'Invalid age' (initial state)
```

The ancestor schema validates the whole subtree at the registered path. Issues are distributed to the leaves via `issue.path`.

## Precedence (D4) — specific > wildcard > ancestor

```ts
schemas({
  schemas: {
    user: userSchema,                          // ancestor
    'users.*.email': z.string().email(),       // wildcard
    'users.admin.email': z.string().email(),   // specific
  },
});
```

A write to `users.admin.email` runs ONLY the specific schema (`users.admin.email`). Wildcard and ancestor schemas don't claim that leaf.

A write to `users.u42.email` runs the wildcard schema; ancestor doesn't claim it.

A write to `user.age` runs the ancestor schema (no more-specific match).

## Suppress validation for replays — time-travel, hydration

```ts
import { withWriteContext } from '@signaltree/core/authoring';

const tree = signalTree(initialState).with(
  schemas({
    schemas: { 'user.email': z.string().email() },
    suppressIntents: ['hydrate', 'migration'],
    suppressSources: ['time-travel'],
  }),
);

withWriteContext({ intent: 'hydrate' }, () => {
  tree.$.user.set(serverPayload);  // skipped by validation
});
```

**Do NOT suppress `source: 'serialization'`** — deserialize is the canonical ingest case validation exists for.

## Imperative — `validate()`, `validatePath()`

```ts
const isValid = await tree.schemas.validate();
// Re-runs every registered schema; resolves to current isValid() after all settle.

await tree.schemas.validatePath('user.email');
// Re-runs schemas bound to one leaf.
```

Both **supersede** in-flight runs by bumping version. Orphaned promises still run to completion; their verdicts are dropped on settle.

## Reading errors — patterns

```ts
// Per-path
tree.schemas.errorsAt('user.email')();  // string | null
tree.schemas.isValidAt('user.email')(); // boolean
tree.schemas.isPendingAt('user.email')(); // boolean (async runs only)

// Aggregate
tree.schemas.isValid();           // O(1) — counter-backed
tree.schemas.pending();           // any leaf in flight?
tree.schemas.pendingPaths();      // readonly string[]
tree.schemas.errors();            // Record<path, string | null>
tree.schemas.errorList();         // readonly string[] (non-null only)
```

`isValid()` is O(1) per read — backed by an invalid-count counter maintained inside the verdict applier. Safe to use in button-disabled bindings without performance concern.

## `compact()` — manual GC

The registry retains `PathState` for every leaf path that's ever been written and matched a schema. For a long-lived `users.*.email` over a session that churns 10k user rows, that's 10k `PathState` entries.

```ts
// After bulk-removing entities:
tree.schemas.compact();
```

`compact()` walks bound paths and evicts any that no longer resolve in the current tree.

## What this enhancer does NOT do

- **Does not block writes.** No `mode: 'reject'` — async schemas can't gate synchronously. Use the form layer for gate-style validation.
- **Does not replace `@signaltree/guardrails`.** Guardrails = performance budgets, hot-path detection, memory leaks. Schema = data-shape conformance. Different concerns.
- **Does not integrate with Angular Signal Forms yet.** Signal Forms isn't shipped in stable Angular. Use `errorsAt(path)` manually in your template; revisit when Signal Forms ships. See [PR3 spike result](../../../packages/ng-forms/spike/signal-form-bridge-spike.md).

## Bundle

~4.3 KB gzipped. Tree-shakable. Angular is a peer dependency.

## Architecture reference

Full design in [docs/architecture/validation-enhancer-plan.md](../../../docs/architecture/validation-enhancer-plan.md).

## Common pitfalls

1. **Importing `validation()` instead of `schemas()`** — the enhancer factory is `schemas()`. (`validation` was the working-name during planning.)
2. **Reading `tree.validation.*`** — namespace is `tree.schemas.*`.
3. **Expecting reject mode** — doesn't exist. The enhancer reports; it doesn't block.
4. **Forgetting `compact()` in entity-churning sessions** — bounded by distinct paths written, not current entity count.
5. **Not debouncing `validate()` with async schemas** — orphaned network requests pile up.
