# @signaltree/schema Changelog

## 9.2.3 (2026-05-28)

### Initial Release

Schema-driven validation for SignalTree. StandardSchema-compatible
(Zod, Valibot, ArkType, Effect Schema, …), async-first, observe-only —
reports verdicts via signals, never blocks writes.

#### Highlights

- **Single registration site.** Register schemas once via `schema({ schemas: { 'user.email': z.string().email() } })`; read errors per path or in aggregate from `tree.schema.*`. No more drift between form validation, server-action checks, and ad-hoc Zod calls.
- **StandardSchema interop.** Works with any [`StandardSchemaV1`](https://github.com/standard-schema/standard-schema)-compatible library — no per-library adapter code.
- **Async-first.** Schemas may return Promises. The write-sequence guard drops stale verdicts when a newer write supersedes an in-flight async run.
- **O(1) `isValid()`** — counter-backed, safe in button-disabled bindings without per-keystroke performance concerns.
- **Wildcard paths** for entity collections (`users.*.email`) with lazy match-on-write — no upfront entity enumeration.
- **Ancestor schemas** validate subtrees with per-leaf staleness guards (race-safe across slow ancestor + fast leaf writes).
- **Suppression via ambient context** — devtools time-travel and `withWriteContext` replays bypass validation when configured.
- **~4.3 KB gzipped** (well under the 6 KB budget). Angular peer dependency.

#### Public API

```ts
import { schema } from '@signaltree/schema';

const tree = signalTree(state).with(
  schema({
    schemas: { /* path → StandardSchemaV1 */ },
    mode: 'accept' | 'warn',      // optional
    validateOnAttach: boolean,    // default true
    suppressIntents: [...],       // optional
    suppressSources: [...],       // optional
    onError: (path, msg) => ...,  // optional
    formatIssue: (issue, path) => string, // optional
  }),
);

// Read errors
tree.schema.errors();              // Record<path, string | null>
tree.schema.errorList();           // readonly string[]
tree.schema.isValid();             // O(1) — counter-backed
tree.schema.pending();             // any async runs in flight?
tree.schema.errorsAt(path);        // memoized per-path signal
tree.schema.isValidAt(path);
tree.schema.isPendingAt(path);

// Imperative
await tree.schema.validate();
await tree.schema.validatePath(path);
tree.schema.compact();             // manual GC

// Bridge integration (for future Signal Forms bridge)
tree.schema.schemaFor(leafPath);
tree.schema.boundPaths;
```

#### Known Limitations

- **No Signal Forms bridge yet.** Angular Signal Forms is still in RFC and not shipped in any stable Angular release. Wire `errorsAt(path)` into your template manually for now. See `packages/ng-forms/spike/signal-form-bridge-spike.md`.
- **No "reject" mode.** Schemas report verdicts; they don't block writes. The right place to gate input is the form layer. Full rationale in the package README.
- **Manual `compact()` required for entity-churning workloads.** Registry retains `PathState` for distinct leaf paths ever written. Long-lived `users.*.email` over a session that churns many entities should call `tree.schema.compact()` periodically.

#### Peer Dependencies

- `@signaltree/core ^9.0.1` (uses `UpdateMetadata`, `withWriteContext`, `interceptLeafSignals` — see core 9.2.3+ release notes)
- `@standard-schema/spec ^1.0.0`
- `@angular/core ^20.0.0 || ^21.0.0`
- `tslib ^2.0.0`
