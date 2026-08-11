## 14.1.0 (2026-08-11)

> **Why a MINOR version carries a BREAKING section, stated plainly because it is a
> semver anomaly and not an accident.**
>
> **14.0.0 was published on 2026-08-10 and has been unpublished.** It was never meant
> to be more than a release candidate: it shipped while the audit that produced this
> release was still generating findings, and several of the things it published were
> wrong (see
> [docs/audits/2026-08/14.0.0-what-actually-happened.md](docs/audits/2026-08/14.0.0-what-actually-happened.md)).
> `14.0.0-rc.1` remains on npm under the `rc` tag.
>
> So the breaking changes below are relative to **14.0.0, a version that no longer
> exists**. Measured against the last version anyone could install and keep,
> **13.5.0**, this release removes 25 barrel exports plus `map()` and `removeAll()` —
> genuinely major-scale, and `13.x -> 14.1.0` crosses the major boundary, so no
> `^13.5.0` range resolves to it and nobody is auto-updated into a break.
>
> The only affected users are those who installed 14.0.0 during its ~24 hours on the
> registry. For them the delta is: `equal` removed (use `deepEqual`), `map()` ->
> `asMap()`, `removeAll()` -> `clear()`, and
> `pauseRecording()`/`resumeRecording()`/`isRecordingPaused()` removed with no
> replacement.

### BREAKING

- **The entity-node callable REPLACES instead of merging.** `byId(id)(value)` and
  `byId(id)(updater)` now assign the whole entity. They always documented replace —
  `entity-signal.ts` said "full entity replace via updateOne" while the code called
  `updateOne`, which spreads — so the code changed to match the contract.

  The updater form is why there was no alternative: an updater returns a full `E`, so
  under merge semantics REMOVING a key is impossible to express, because the spread
  puts the old value straight back. Merge cannot host that signature.

  Migrating: if you relied on the merge, call `updateOne(id, changes)`, which is
  unchanged and is the patch half of the surface.

- **`entityMap({ history })` is RENAMED to `entityMap({ recordHistory })`.**

  The old name collided with `form({ history: history() })`, and the first plan here was
  to unify them under one spelling. **That was wrong** — they answer different questions:

  | Option                                | Question                                                                                   |
  | ------------------------------------- | ------------------------------------------------------------------------------------------ |
  | `form({ history: history() })`        | this form OWNS a scoped stack — opt IN to a new history                                    |
  | `entityMap({ recordHistory: false })` | participation in the AMBIENT `timeTravel()` stack — opt OUT of a history someone else owns |

  One word for "own a history" and "be recorded into a history" _is_ the collision. Two
  concepts, two names. Behaviour is unchanged: the collection stays out of `timeTravel()`
  and remains in every other snapshot — `serialization()`, `persistence()`, devtools,
  audit.

- **`removeAll()` is removed from `entityMap`.** It was a pure alias — its body was
  `api.clear()`. Use `clear()`. One operation, one name.

- **`pauseRecording()` / `resumeRecording()` / `isRecordingPaused()` are REMOVED.**
  Deleted rather than deprecated: the API was a silent-data-loss footgun, so a
  deprecation window is a window in which more call sites acquire it.

  It could express "record nothing", never "one undo step". Pausing alone was
  destructive — nothing recorded, so `undo()` stepped back PAST the bulk and its result
  became unreachable — and the documented fix was a synthetic sealing write landing on a
  field you had to invent. It was also a GLOBAL mode: an unrelated write inside the
  window was suppressed too, so correctness required sole ownership of the tree for its
  whole duration.

  Nothing replaces it yet, and nothing needs to for the common case: writes sharing a
  microtask are already one entry. Verified after removal — 25 `addOne` calls in one
  loop record 1 entry, `undo()` returns to 3 rows, `redo()` returns to 28.

- **`__provisional` / `finalizeProvisional()` are REMOVED**, along with `addEntry`'s
  third parameter. A half-built coalescing scheme with no caller anywhere in
  `packages/*/src`.

- **`treeName` is REMOVED from `DevToolsConfig`.** It was an alias the source itself
  labelled "legacy support", and `name ?? treeName` meant `name` always won. Use `name`.

- **`TreeConfig.enableTimeTravel` is REMOVED.** It had zero consumers and silently did
  nothing, while a working flag of the same name lives on `DevToolsConfig` — so the one
  a user reached for first was the dead one. Attach `timeTravel()` as an enhancer.

- **`equal` is removed from `@signaltree/core` and `@signaltree/shared`.** It was a
  literal alias — `shared/src/lib/deep-equal.ts` read `export const equal = deepEqual;`
  and the two were the identical function object. Import `deepEqual`.

  Removed rather than kept because the word was doing two jobs: `equal` is also the
  OPTION key throughout the library — `linked({ equal })`, `compared(value, equal)`,
  `entityMap({ load, equal })` — where it means "your comparator," not "deep equality."
  One word cannot mean both.

- **`@signaltree/events`: `validateEvent` is renamed to `parseEvent`, and the old
  `parseEvent` to `safeParseEvent`.** The names were INVERTED relative to Zod, which this
  package re-exports as `z`:

  |                    | before 14.1.0   | now                                       |
  | ------------------ | --------------- | ----------------------------------------- |
  | throws on failure  | `validateEvent` | **`parseEvent`** (like `z.parse`)         |
  | returns a result   | `parseEvent`    | **`safeParseEvent`** (like `z.safeParse`) |
  | boolean type guard | `isValidEvent`  | `isValidEvent` (unchanged)                |

  The audience for a Zod-based event package is people who know Zod, so both old names
  mispredicted for exactly the people using them. Our own events SKILL doc had it wrong
  in a code comment — `validateEvent(...) // never throws` — which is what the inversion
  costs in practice.

  The return types differ enough (`z.infer<T>` versus `SafeParseReturnType`) that a
  caller of the old `parseEvent` gets a compile error rather than a silent behaviour swap.

- **`@signaltree/events`: `ConnectionState` is renamed to `WebSocketConnectionState`.**
  It collided with a different public type of the same name in `@signaltree/realtime`,
  where `ConnectionState` is a bag of signals (`status`, `error`, `isConnected`, …) while
  this is a plain status union — so an app importing both got one name for two
  incompatible shapes. The prefix also matches its siblings (`WebSocketConfig`,
  `WebSocketMessage`, `WebSocketService`). Realtime is unchanged: its `ConnectionState`
  and `ConnectionStatus` are genuinely two concepts.

- **`entityMap`'s `map` is renamed to `asMap`.** `map` read as a PROJECTION beside
  `all()` — `.map(fn)` means "transform each element" to every JS developer, and reaching
  for that is a documented failure class (the `WRONG_ENTITY_METHODS` table exists for it).
  `asMap()` says what it returns. Renamed across core, `readonly`'s reader allowlist, and
  `@signaltree/events` (including the `EntitySnapshotAccessor` interface that mirrors it).

- **[ST2032]** — `timeTravel({ maxHistorySize })` below 2, or non-finite, cannot support
  undo and now says so. `maxHistorySize` is a buffer LENGTH, not a step count: N entries
  yield N-1 undo steps. MEASURED after 10 writes — omitted: 10, 5: 4, 2: 1, **1: 0,
  0: 0**. `0` reads as "no limit" and `1` reads as "one step"; both left `canUndo()`
  permanently false, and `NaN` was silently unbounded because `length > NaN` is never
  true. Any such value now falls back to 50 and reports ST2032.

### Added

- **`replaceOne(id, entity)`** on `entityMap` — the missing half of `updateOne`.
  `updateOne` spreads and therefore cannot remove a key; before this the only replace
  path was `setAll(all().map(...))`, whole-collection work to change one row.
  `replaceOne` is O(1) and position-preserving.

  It takes the id explicitly and deliberately: a `setOne(entity)` deriving the key via
  `selectId(entity)` would write to whatever slot the entity's own id field names, and
  `changeId` can leave `entity.id` disagreeing with the storage key — a silent
  wrong-slot write. A test pins that drift so the reason survives.

- **[ST2031]** — a node held from `byId(id)` and read after `changeId` retired that id
  resolves `undefined` and always will. `changeId` drops the old per-entity signal on
  purpose (aliasing would share one signal with a future `addOne` of the retired id, a
  worse failure), so this is correct behaviour that was impossible to debug from the
  call site. Dev-only, once per retired id.

### Fixed

- **`entityMap({ history: false })` no longer produces PHANTOM undo steps.** Five
  excluded-only writes produced five history entries with `canUndo() === true`, and the
  undo changed nothing a user could see — a dead Ctrl+Z, which is worse than no undo
  because it spends a step the user believes they had.

  Cause: the dedupe was `last.state === entry.state`, exact for unpruned snapshots
  because structural sharing returns the identical object when nothing changed. Pruning
  breaks that identity — a write to an excluded collection still makes a new root, and
  pruning copies every node on the path down to the excluded key, so two snapshots
  differing only inside excluded state come back structurally identical and
  referentially distinct.

  Fixed with `prunedEqual`, a reference-short-circuiting structural compare, **guarded
  behind an O(1) test for whether anything was pruned at all** (`pruneHistoryExcluded`
  returns the identical object when it prunes nothing). So a tree without exclusions
  still runs only the `===`, and where the walk does run it runs once per recorded
  entry rather than per write. MEASURED: per-flush cost is indistinguishable between
  the exclusion and no-exclusion arms at 1,000 and 10,000 rows and at 4 and 20 root
  keys (1.18–1.26 ms, medians of 9).

  Verified by outcome, including the nested case a shallow compare would miss: an
  excluded collection under a branch produces 0 entries, while a sibling write to that
  same branch still produces 1.

- **`coalesce()` no longer silently drops `.update()` calls.** Updaters were deferred
  under the key `` `${path}:update:${Date.now()}` ``, so two in the SAME millisecond
  collided on that key and one was discarded. Three `+1` updaters inside one
  `coalesce()` produced `n = 1` when they ran fast and `n = 3` when spaced 2 ms apart —
  same code, result decided by machine speed.

  An updater is a read-modify-write and cannot be coalesced at all: keeping only the
  last of three `+1`s means `+1`. Updaters now apply immediately, after draining any
  pending coalesced `set` on the same path so they read the value a caller expects.
  `set` still coalesces, which is sound because the last value wins and none of them
  read the previous one.

## 14.0.0 (2026-08-10)

### BREAKING

- **`HydrateMode` gains a fourth value, `transfer`**, and `deserialize()` gains
  `{ transfer: true }`. Additive at runtime, but listed here because anyone who
  switches on `HydrateMode` exhaustively now has a case to handle.

  `rehydrate` covered two situations that want OPPOSITE answers. A
  `localStorage` payload may be days old and the local loader will fetch
  something better, so a source-owning marker is right to decline it. A server
  payload was fetched milliseconds ago and the local loader has NOT run, so
  declining it ships the bytes into the page and refetches anyway — measured at
  **54.3KB wasted on a 500-row collection**
  (`node tools/bench-ssr-payload.mjs`). `asyncSource` and loader-backed
  `entityMap` now ACCEPT under `transfer` and still decline under `rehydrate`.

  Deliberately unchanged under `transfer`: an in-flight `LOADING` status is
  still normalised, and a form's `touched` is still not restored. Freshness is
  an argument about DATA — not about believing a request is in flight in a
  process where nothing runs, nor about resurrecting interaction state without
  the focus and cursor that gave it meaning. RFC 0014;
  `docs/guides/ssr-and-hydration.md`.

- **`deepEqual` is stricter about object identity.** The default leaf
  comparator now gates on `a.constructor !== b.constructor` instead of
  comparing prototypes and `Object.prototype.toString` tags. Four pairs that
  compared EQUAL now compare unequal: a class instance vs a plain object with
  the same fields, `Object.create(null)` vs `{}`, a cross-realm `{}` vs a local
  one, and a prototype-forged `Object.create(Date.prototype)` vs `{}`. Every
  one of those flips toward "changed", which is the recoverable direction — a
  wrongly-equal verdict from a signal's `equal` DROPS the write and nothing
  downstream learns; a wrongly-unequal one costs a redundant notification. This
  comparator has shipped two false-equal defects and zero false-unequal ones.
  It is also 17% faster on the object path (168.5µs → 140.0µs over 1,000-row
  entity arrays, 14.4ns per object node), and it can no longer throw out of a
  write when handed a hostile Proxy. If you were relying on a class instance
  comparing equal to its plain-object twin, pass `compared()` on that leaf.
  Rationale and measurements: RFC 0013 §5.1.

- **`@signaltree/enterprise` is no longer published.** Deprecated in 13.5.0 and
  removed in 14.0.0. Its replacement is `tree.updateAndReport()` in core, which
  needs no enhancer, adds no bundle, and measured faster in every workload — the
  diff engine walked the whole state to decide which writes to skip, and core
  leaves already short-circuit a reference-equal write, so those writes were
  no-ops before it looked at them. It also silently dropped writes targeting
  arrays, which was never fixed.

  13.x remains on npm, marked deprecated, so existing lockfiles resolve. It will
  not receive a 14-compatible release: it imports `isBuiltInObject` and
  `isTraversableNode`, which moved to `@signaltree/core/authoring`, so
  `enterprise@13.x` cannot work against `core@14`. The demo page, the benchmark
  arm that ran `updateOptimized()`, and every pipeline entry are removed with it.

- **25 symbols moved from `@signaltree/core` to `@signaltree/core/authoring`.**
  Nothing was deleted and nothing changed shape — the import path moves.

  ```ts
  // before
  import { isNodeAccessor, FORM_MARKER, ENTITY_READERS } from '@signaltree/core';
  // after
  import { isNodeAccessor, FORM_MARKER, ENTITY_READERS } from '@signaltree/core/authoring';
  ```

  Moved: the eight `*_READERS` allowlists, `FORM_MARKER` / `ASYNC_SOURCE_MARKER`
  / `ASYNC_QUERY_MARKER`, the six `is*Marker` guards, `isNodeAccessor`,
  `isAnySignal`, `isTraversableNode`, `isBuiltInObject`, `isSignalTree`,
  `parsePath`, `SIGNAL_TREE_CONSTANTS` and `SIGNAL_TREE_MESSAGES`.

  Found by an invariant worth stating: _if everything usable is demoed, then
  everything exported appears in the demo app._ It did not — 26 of 59 root
  runtime exports were absent, and the absentees were not a scattering of
  overlooked features. They were all one kind: the READER allowlists exist to
  TYPE `asReadonly`, the marker symbols are brands for writing a marker
  processor, the guards answer questions you only ask while walking a tree.
  None of it is app code, and all of it sat on the entry point an app imports.

  So the failure was not an incomplete demo — it was the root barrel mixing the
  app API with authoring plumbing. `/authoring` already existed for exactly this
  distinction. The root barrel is now 34 symbols, all of them demonstrated, and
  `tools/check-demo-coverage.mjs` gates it so the mixing cannot return.

  `isDev` and `withKind` deliberately stayed: an app legitimately branches on
  the first, and the second is how you tag a custom `form()` validator. `withKind`
  was the one root export the demo genuinely lacked, and the demo now uses it.

- **Calling a leaf is no longer a setter.** `tree.$.count(5)` is a compile
  error; the `(value: NotFn<T>): void` and updater overloads are gone from
  `CallableWritableSignal<T>`. Use `.set()` / `.update()`. Branches and the root
  remain callable, unchanged.

  It never worked. A leaf **is** a real Angular signal, and calling a signal is
  a READ that discards its argument — measured, `tree.$.count(5)` on a leaf
  holding `0` returned `0` and left it at `0`. The same expression one level up
  (`tree.$.user({ name: 'Bob' })`) does work, because a branch is SignalTree's
  own accessor and we own its call semantics. So the type promised a uniformity
  the runtime never had, and the failure was invisible at compile time AND at
  run time — which is why this is a removal rather than a deprecation.

  Making it true at runtime was measured and rejected on IDENTITY, not speed: a
  callable wrapper costs ~4% on a set+get (inside noise), but `isSignal()`
  returns `false` for it and `Symbol(SIGNAL)` is absent, so `toObservable`,
  `model()`/`input()` interop and everything else guarding on `isSignal` would
  break.

  Migration is mechanical: `tree.$.x.y(value)` → `.set(value)`,
  `tree.$.x.y(fn)` → `.update(fn)`. The compiler finds every site.

- **`@signaltree/callable-syntax` is deleted.** The build transform that would
  have made the above real cannot run inside an Angular app at all (RFC 0008 §4,
  verified against a real build): `@angular/build:application` exposes no
  `plugins`; `codePlugins` runs after ngtsc has claimed every `.ts` — a probe
  received ZERO files; ngtsc's transformer list is hardcoded; ts-patch goes
  inert under `isolatedModules`. It also could not distinguish a leaf from a
  branch, so it rewrote branch calls into `.set()` on an accessor that has none,
  throwing at runtime. Its `/augmentation` entry globally augmented Angular's
  `WritableSignal`, re-introducing the `@ngrx/signals` invariance conflict core
  had deliberately removed.

- **Snapshot payload shape changed**, and the format version (`2.0.0`) is now
  written into the payload. Markers emit values rather than their API surface.

- The unexported `asyncStream` marker is removed; accumulate into a plain leaf
  with `update()` (see `docs/guides/streaming-accumulation.md`).

### Added

- **Newly public in `@signaltree/events`.** Six symbols existed and shipped but
  were unreachable from any entry point, so no consumer could name them:
  `createOptimisticUpdateManager` plus its siblings in the same module —
  `composeHandlers`, `conditionalHandler`, `createHandlerRegistry`,
  `debouncedHandler` — and `DLQ_SERVICE`, the injection token that pairs with
  the already-exported `DlqService`, which a NestJS consumer injecting by token
  could not reference. Found by the dead-export scan; no behaviour changed.

- **Collection APIs from the capability audit** — `prependOne`/`prependMany`,
  `activeId`/`activeEntity`/`setActiveId`/`clearActiveId`, and `changeId`.
  Sourced by reading the shipped type declarations of `@ngrx/signals`, elf,
  Akita and NGXS rather than their docs; prepend was the one capability every
  other library had and we did not.

  `activeEntity` resolves through the per-entity signal rather than the
  collection, so an unrelated row changing does not recompute it — a hand-rolled
  `computed(() => all().find(...))` recomputes on every collection change, which
  is the reason to build it in. `changeId` states its limitation: a node already
  HELD from the old id resolves to `undefined`, because a node closes over its
  id and aliasing the old key would let a later `addOne({ id: oldId })` share one
  signal between two entities.

- **`pauseRecording()` / `resumeRecording()` / `isRecordingPaused()`** on
  `timeTravel`, plus a `shouldSkip(prev, next)` comparator. Without pause a bulk
  import writes a hundred history entries and the user's next undo reverts one
  row of it. `isRecordingPaused` is reactive — the same lesson as `canUndo`,
  applied before shipping this time. The comparator runs on every recorded
  write, so it is documented to compare the few fields you mean.

- **`onTreeError`** (`@signaltree/core/authoring`) — one place to observe every
  error the library catches. Markers still handle their own errors exactly as
  before; this is additive, and a listener that throws cannot damage the
  operation that reported to it. **ST2025** reports a throwing listener.

- **ST2026** — the inline-predicate trap. `where`/`find` memoise per predicate
  IDENTITY, so an inline arrow in a template allocates a new one per
  change-detection cycle, misses the cache and re-filters the collection:
  measured 0.27 ms hoisted against 20.54 ms inline over 1,000 entities. It is not
  a leak (the cache is a `WeakMap`), which is why it needed a diagnostic —
  nothing breaks, the app is just slow forever.

- **`@signaltree/guardrails` no longer clones state to detect change**, and
  **ST2030** changed meaning with it. `tree()` returns a memoised, structurally
  shared snapshot — the identical object when nothing changed — so reference
  identity answers "did anything change" exactly, in O(1). The clone was doing
  that job at O(state), and it also destroyed the fast path in the two walks
  that follow, because `deepEqual` and the path diff both short-circuit on
  `a === b` and a clone shares nothing with the live snapshot. Measured on the
  idle poll, which guardrails runs 20 times a second whether or not anything
  happened: **32.5µs → 0.080µs at 100 branches, 122.8µs → 0.045µs at 400**.
  Snapshot plus diff together: 189µs → 70.6µs at 300 branches.

  In-place mutation — `tree.$.rows().push(x)`, which notifies nothing — is the
  one thing reference identity cannot see, so each array/`Map`/`Set`/`Date` is
  copied and re-checked instead of the whole tree. ST2030 now reports one
  container that could not be copied, with its shape still watched, rather than
  the whole snapshot degrading. The JSON fallback it used to take is GONE: JSON
  turned a `Date` into a string, so `previousState` could never deep-equal the
  live state again and every poll reported a change, forever, out of nothing.

- **ST2026 is rate-based, not count-based.** Byte-identical predicate source is
  necessary but not sufficient: `v => v.x > threshold`, rebuilt when
  `threshold` changes, looks the same. Counting distinct identities eventually
  accused that shape too — during any long session — and the advice it gave
  ("hoist it") was actively wrong for it, because the closure really does
  differ. It now needs 12 distinct identities **within 2 seconds** (~6/second),
  which is far above anything a user drives and far below a change-detection
  loop. The rate is derivable from the data; the raw count never was.

- **`@signaltree/guardrails` no longer speculates about change-blindness, and no
  longer relies on a strategy that may see nothing.** PathNotifier is precise
  but blind to plain-leaf writes unless devtools is attached — so it used to
  warn every plain-object user that monitoring "is change-blind", whether or not
  it was, and tell them to go disable it. A polling backstop now runs alongside
  it and the warning fires only when the backstop has personally caught a change
  the notifier missed. That backstop is affordable only because the change check
  stopped cloning: 0.045µs per idle poll at 400 branches, against the 122.8µs
  that made polling a "last resort" in the first place.

- **`changeDetection: { strictImmutability: true }`** (guardrails, opt-in).
  Freezes each snapshot so an in-place mutation throws a `TypeError` **on the
  mutating line with a stack**, instead of being noticed up to a poll later with
  its path inferred by diffing. Off by default because it makes dev diverge from
  production — the same reason NgRx ships `strictStateImmutability` opt-in. With
  it on, per-container copying is skipped entirely.

- **ST2027** — the no-op copy write. The new value is a DIFFERENT object that
  deep-equals the current one, so the comparator walks the whole structure to
  conclude nothing changed and the write is discarded: ~2.8 ms on a 50,000
  element array, to do nothing. The shape a re-fetched payload takes. ST2003
  already covered re-setting the identical reference; this is the expensive
  twin, and it corrupted this repo's own benchmarks twice before anyone noticed.
  Gated to 32+ elements/keys, deduped per path, dev-only.

- **`createEditSession`'s clone fallback is lossless**, and **ST2028** narrowed
  with it. `structuredClone` throws on a function, so one callback anywhere in
  the edited value dropped the whole object onto `JSON.parse(JSON.stringify())`
  — silent corruption of an undo stack. Measured, after `applyChanges` then
  `undo`: `Date` came back a string, `Map` and `Set` came back `{}`, an
  `undefined` key was dropped, and the callback itself was gone.

  JSON was never the only fallback. It is now a type-aware walk that preserves
  `Date`, `Map`, `Set`, `RegExp`, `undefined`, cycles, and class prototypes —
  an `ApiError` comes back an `ApiError`, with its non-enumerable `message`
  intact (own property DESCRIPTORS, not `Object.keys`, which is the same trap
  `deepEqual` documents one file over). What remains is narrow: a function is
  shared by reference rather than copied, which is the right answer since a
  function has no state to restore.

- **`history?: boolean` on `entityMap`**, plus **ST2029**. A history entry holds
  the tree's snapshot, and a collection's snapshot is an N-pointer array rebuilt
  on every change — so `timeTravel()` over a big collection made every
  collection-mutating write O(collection), permanently. Measured over 50 writes:
  24.73 MB retained at 50,000 rows, against 5.61 MB with `history: false`. The
  flag scopes exactly one thing — what `undo()` can reach. The collection still
  appears in `tree()` and still round-trips through `serialization()`; use
  `transient: true` to drop it from those too. **Undo becomes partial** for an
  excluded collection, which is a product decision the library cannot make for
  you, which is why it is opt-in. ST2029 warns once past ~500k retained pointers
  (~5MB), judged on `entries x width` rather than row count and checked at
  RECORD time — an app attaches `timeTravel()` when it builds the tree and the
  rows arrive later, so an attach-time check sees an empty collection.

- **Newly exported types.** `persistence(config)` REQUIRED a `PersistenceConfig`
  and `serialization(config?)` accepts a `SerializationConfig`, and neither was
  exported — you could call both and declare neither the object passed nor the
  methods gained. Now exported with `SerializationMethods`, `PersistenceMethods`
  and `SerializedState`. From `/authoring`: `HydrateMode` and `HydrateReason`,
  which `HydrateDecisionEvent` already used in its public shape.

- **ST2023** — a marker that declares `snapshot` but no `hydrate`, whose node is
  not a writable signal. It serialises perfectly and silently discards every
  write, so `tree(tree())` loses its value. ST2022 cannot see this, because a
  `snapshot` hook is a valid answer to the question ST2022 asks. Reported at
  materialisation (where the node's shape is knowable), once per processor, off
  the write path.

- **`onHydrateDecision`** (from `@signaltree/core/authoring`) — observe when a
  marker DECLINES a rehydrate payload because its loader owns that data, or
  NORMALISES one because no request survives a process boundary.

  Deliberately not a warning: both decisions are correct, and warning on correct
  behaviour trains people to ignore the channel. It is an observation seam, the
  same shape as `getPathNotifier`.

  It ships in this release rather than after it because every other silence
  14.0.0 fixes was pre-existing, while the loader-declines rule is silence this
  release INTRODUCES — a brand-new silent decision inside the release whose
  thesis is "make the silence loud".

  The event carries a stable machine-readable `reason` that reaches production
  listeners, plus a `detail` prose string that folds away under
  `ngDevMode: false` — _advisory prose is removable, identity is not_. Listeners
  fire in production: an API that silently does nothing in a production build is
  the defect class this release removed `tree.$.count(5)` for.

- A dev/prod split in the bundle-budget gate. The single budget was measured on
  the dev build and had moved five times in two releases, each bump noting that
  production was unchanged. Prod (`ngDevMode: false`) is now the tight
  constraint; dev is a loose ceiling for diagnostics.

- `npm run typecheck` now covers every package's source plus the demo. It
  previously checked only core's `*.typing.spec.ts` files — which is why it
  reported zero errors for a breaking type change that broke 22 call sites.

### Fixed

- **`canUndo()` / `canRedo()` / `getHistory()` are reactive.** They read a plain
  number and a plain array, so `computed(() => tree.canUndo())` evaluated once
  and cached `false` forever. Zone change detection re-read the method every
  cycle and hid it completely — in a **zoneless** app the undo button never
  enabled. Found by reading elf's `StateHistory`, which exposes `hasPast$` as an
  observable, and asking why theirs was shaped differently; every existing
  time-travel test called the methods imperatively, which is the one way this
  cannot show up.

- **`tree({ rows: [...] })` no longer half-applies.** `entityMap` accepted only
  `{ all: [...] }`, the shape a snapshot emits, so a bare array left the
  collection unchanged while sibling leaves in the same payload took their new
  values. Dev warned (ST2024); production did nothing at all. A partial hydrate
  is worse than a failed one, because the parts that did apply make it look like
  it worked.

- **`byId()` no longer allocates permanently.** The node cache was a strong
  `Map`, so merely READING every row cost 4,149 B/entity — 39.6 MB at 10k. It is
  a `WeakRef` cache with a `FinalizationRegistry` now: a walk that keeps nothing
  costs 844 B/entity, 4.9x less. Holding the nodes still costs 3,573 B/entity,
  because a materialised per-entity node is real state.

- **A marker's snapshot wrapper no longer churns on unrelated writes.**
  `unwrap` rebuilt it whenever any child changed, so `tree().rows !== previous.rows`
  after writing an unrelated leaf — enough to make `computed(() => tree().rows)`
  recompute and an OnPush component re-render. Memoised with a `computed`.

- **`entityMap` restore diffs instead of calling `setAll`.** Restore rebuilt the
  storage map, the id index and every per-entity signal to apply a one-entity
  change: 4,368 µs per undo at 10k entities, now tens of µs. Reproduce the
  whole-workload figure with
  `node --expose-gc tools/bench-compare.mjs --n 10000`; the per-undo breakdown
  and its provenance are in `docs/compare/real-implementations.md`.

- **`.derived()` values were reaching snapshots, and whether they did depended
  on TOUCH ORDER.** `finalize()` (the `$` getter) runs `applyDerivedFactories`
  while the `tree()` call path runs only `materializeOnly()`, so:

      tree() first, never touch `$`  ->  absent   (correct, by accident)
      touch `$` at all, then tree()  ->  PRESENT  (wrong)

  Every real application is the second case — you write state through `$`, then
  persist — so derived values were being written to localStorage, devtools and
  audit, and going STALE there: a snapshot taken at `a=2` kept `sum: 5` while
  the live value became `103`. Not absent data, wrong data.

  This is the exact rule 14.0.0 is about — a snapshot carries state, and
  anything recomputable is structure — and a derived value is the canonical
  recomputable thing. Derived signals are now stamped and skipped by `unwrap`,
  so `tree()` is **order-independent**. Only NON-writable signals are stamped: a
  writable signal placed in `.derived()` is real state and is still captured.

  Confirmed PRE-EXISTING against the `v13.5.0` tag (identical output), so this
  is inherited, not introduced by the marker work. Fixed here because 14.0.0
  already changes the payload shape — deferring it would make it a SECOND
  breaking payload change, which is what the deadline on
  `SNAPSHOT_FORMAT_VERSION` exists to prevent.

  The existing test covered only the passing order (`signalTree(...).derived(...)`
  then immediately `expect(tree())`, never touching `$`), which is why this
  survived.

- **`ST2022` was being emitted from three unrelated conditions.** Besides its
  documented meaning (a marker registered without declaring what of it is
  state), it also fired when `entityMap.hydrate` got a payload with no `all`
  array and when `status().hydrate` got an unrecognised state string. Both of
  those are PAYLOAD problems at restore time, not registration problems, so a
  user grepping the code was told to fix a `registerMarkerProcessor` call they
  may never have written. Codes are append-only and never reused; the two
  hydrate cases are now **ST2024**.

- **The legacy-payload upgrade path is pinned** (`legacy-payload.spec.ts`).
  14.0.0 changes the snapshot shape, so every payload already in a user's
  localStorage is now the wrong shape, and nothing tested what happens. It
  degrades best-effort and loudly: no throw, plain leaves restore, an unreadable
  marker is left unchanged (not reset) and reports ST2024, and a marker absent
  from the payload keeps its initial value. A legacy `entityMap` payload is not
  recoverable — it emitted `map`, which JSON renders as `{}`, so the entities
  were never in the file.

- Three comments in `materialize-markers.ts` described an `owns()` hook that
  does not exist. Source ownership is decided inside each marker's `hydrate`,
  which already receives the mode. A research doc had picked the phantom API up
  and restated it as fact.

- Snapshot aliasing of `Date`/`Map`/`Set`/`Array` is documented and pinned. A
  snapshot is read-only **all the way down**: the dev-mode freeze is per node
  and does not reach leaf values. Not "fixed" by copying (55x on a 50k array) or
  freezing (`Object.freeze` protects `Array.push` and nothing else — `Date`,
  `Map` and `Set` mutate through internal slots), both measured.

- The core typing harness did not compile. Deleting `asyncStream` cut two rows
  out of the middle of a type-level tuple, so `npm run typecheck` was red on
  main; the nested-marker assertion it also removed is restored.

### Documentation

- **A fabricated research bibliography is removed from six surfaces**, including
  `packages/core/README.md`, which ships to npm. The benchmark orchestrator's
  frequency weights were documented as derived from State of JS 2023 survey data
  covering 40,000+ developers, automated analysis of 10,000+ GitHub
  repositories, enterprise profiling studies and aggregated React DevTools
  Profiler data, and cited three academic papers with no author, venue or DOI.
  None of it exists — the doc and its bibliography arrived together in one
  commit in September 2025 with no supporting artifact, and none was ever added.
  State of JS could not have supported it in any case: it measures library
  awareness and sentiment, not per-operation frequency.

  The weights are kept and relabelled as maintainer estimates, which is what
  they always were. The docs now also disclose that they are not neutral — they
  feed `weightedTotalScore`, which ranks SignalTree against other libraries, so
  the `equal` preset (all weights 1.0) is documented as the setting to use for
  any comparison you intend to rely on. A further 20 invented app-prevalence
  figures ("89% of apps", precise to the point) went with it.

- **Every measured figure on every live surface now names the tool that
  produces it.** The `numeric-claims` gate was ratcheted, not clean: 69
  published numbers named no generator, grandfathered in when the gate was
  written. Paying them off found four that were simply wrong:

  - `docs/performance/bundle-optimization.md` claimed the core package alone
    compresses to 25.63KB against a real bare tree of 5.79 KB, plus a 36.31KB
    ecosystem total and a breakdown naming the removed `enterprise` package.
  - `docs/performance/dropping-dev-code.md` understated the dev-code saving by
    about half — it is 2.0-2.7 KB, not 0.8-1.2 KB.
  - `packages/ng-forms/README.md` headlined "3.38KB gzipped" with no statement
    of what was measured; the package's own code is 12.15 KB across 19 chunks.
  - The ST2018 comparison table reported NgRx SignalStore at 46.56 ms, within
    noise of the array-leaf figure beside it. Measured with
    `@ngrx/signals/entities`, its own best idiom, it is 745 ms at that fixture —
    sixteen times the array leaf, not parity with it.

- **Two new generators**, for the figures that justify a runtime diagnostic and
  so should never have been folklore: `tools/bench-array-leaf.mjs` (ST2018) and
  `tools/bench-predicate-memo.mjs` (ST2026). Both interleave arms, rebuild the
  fixture each round, and refuse to print a ratio when the gap falls inside the
  round-to-round spread. ST2026's published "75x" is replaced by absolutes —
  0.30 ms hoisted against 33.8 ms inline over 5,000 reads of a 1,000-entity
  collection — because the ratio reads anywhere from 104x to 112x across runs
  while both absolutes hold steady.

- Known blind spots in the gates are recorded in `tools/GATES.md` rather than
  discovered later, including the two found here: the numeric-claims detector
  matches performance figures, not provenance claims, and its surface list
  omitted `docs/performance/**` and `apps/demo/README.md`.

### Changed

- **Devtools replay no longer has side effects on the user's storage.** A
  `stored()` value persists on every write, so rewinding one rewrote the user's
  localStorage. That is CORRECT for an undo — the user is undoing the persisted
  change too — and wrong for a devtools scrub, where they are inspecting history
  and would be astonished to find their settings rewritten by dragging a slider.

  The two were indistinguishable because devtools tagged its replays
  `source: 'time-travel'`, exactly as undo does. It now sends `'devtools'` — a
  value that was already in the `UpdateMetadata['source']` union and simply
  unused. So this needed **no new mode and no new option**; `stored()` skips its
  write-through for devtools-sourced writes, and the live signal still shows the
  scrubbed-to state, so the timeline displays correctly.

### Changed

- **A loader-backed `entityMap` now declines tree-level rehydration.** The
  loader already owns that collection's persistence, and owns it better:
  `loader({ persist: { adapter, key, hydrateThenRevalidate } })` seeds rows from
  its own store, marks them stale and revalidates in the background, with
  per-scope keys and touch-ordered GC.

  Writing a tree snapshot over that was not a second opinion, it was a
  **clobber** — measured, a collection seeded by its loader and then hydrated
  from a tree snapshot still held the tree's rows after revalidation. The
  mechanism that knows least about freshness was simply last.

  This also settles an inconsistency nobody had noticed: `asyncSource` already
  declined here while `entityMap` accepted, for the identical situation. The
  rule is now one sentence — **on `rehydrate`, a marker that owns a source
  declines; one that does not, accepts. `restore` always writes**, because
  undo/redo is not competing with a loader.

  No new configuration: "payload or source wins" is `hydrateThenRevalidate`,
  which already exists, is already per-instance, and is already documented.

### Changed

- **Snapshot format version bumped `1.0.0` → `2.0.0`,** written but not yet
  enforced. One bump for two payload changes — markers gained snapshots, and
  `serialize()` stopped using its private walker — because nothing published
  between them, so they reach users as a single transition.

  The two halves have opposite reversibility, which is why the tag ships now and
  the policy does not: **writing the tag is irreversible** (payloads already in a
  user's localStorage can never be given one retroactively), while enforcing is
  fully reversible. ⚠️ When a policy lands, `1.0.0` means **legacy/unknown**, not
  "format 1" — every payload ever written says it, including all of them written
  while the field was decorative, so "reject unknown versions" would reject the
  entire installed base.

### Removed

- **`asyncStream` deleted.** It existed in-repo, unexported, for several
  releases and never shipped, because the API question — a distinct marker
  versus an `accumulate` option on `asyncSource` — was never settled. Leaving
  372 lines of one candidate in the tree biased that decision toward itself
  without anyone choosing.

  What it did is composition:

  ```ts
  for await (const chunk of llm.stream(prompt)) {
    chat.$.reply.update((text) => text + chunk);
  }
  ```

  A plain leaf is captured by `timeTravel()`, appears in `tree()` and persists
  with no marker contract to satisfy — which a marker has to earn individually.
  New guide: [streaming-accumulation.md](docs/guides/streaming-accumulation.md),
  covering cancellation, conversation state and SSE. Nothing was exported, so
  no public API changed.

### Fixed

- **`asyncSource` / `asyncQuery` / `asyncStream` lost their values entirely.**
  Same defect `form()` had, in three more markers: `tree()` returned
  `{"n":1}` with the marker simply gone, ST2008 reporting it at read time.
  All three now declare a snapshot.

  `asyncSource` can also be written directly, so it restores on undo/redo and
  declines on `rehydrate` — a new process has already re-run the loader, so the
  recorded value is stale by definition. `asyncQuery` and `asyncStream` expose
  no value setter, so they CAPTURE but explicitly do not restore: being visible
  and documented as not-restorable beats vanishing.

### Added

- **ST2022 — a marker registered without declaring what of it is state.** This
  is the guard against the defect class that produced four separate bugs, all
  sharing one cause: nothing ever forced a marker author to answer the question.

  Three answers are valid and silence is not one: `snapshot` (+ optional
  `hydrate`), `transient: true` for a marker that deliberately has none, or a
  node that is already a real Angular signal. Enforced at REGISTRATION, because
  `materializeMarkers` swallows `create()` throws (RFC 0005 §7) so a
  materialiser-level guard fails open — the lesson `entityMap({ load })` learned
  with ST2004. Warns rather than throws for now, since `registerMarkerProcessor`
  is public; it should become a throw in the next major.

- **`stored()` declares `transient: true` explicitly.** It needs no snapshot
  hook — it materialises to a real `WritableSignal`, so the ordinary walk
  already handles it, and it re-reads its own storage at construction before any
  snapshot arrives. Declared rather than left blank so it does not read as an
  oversight.

### Documentation

- **Four dead mechanisms documented in place** rather than left to be
  rediscovered: the serialization envelope's `version` (hardcoded `'1.0.0'` at
  two sites, read only into a debug log), its `timestamp` (same, and explicitly
  excluded from the change-detection key), and `appVersion` (declared in the
  type and never written or read by anything — it exists only as a type).

  The `version` note records the two things that will matter when a policy
  lands: writing the tag is IRREVERSIBLE (payloads already in a user's
  localStorage can never be given one retroactively) while enforcing it is
  fully reversible; and `'1.0.0'` is NOT a clean baseline, so a
  "reject unknown versions" policy would reject the entire installed base.

### Fixed

- **`serialization()` could not round-trip a tree containing `status()` or
  `entityMap` — it THREW** (`targetSignal.set is not a function`), and had since
  those markers existed. Persisting a collection has never worked.

  Three writers, one key. `serialize()` had a PRIVATE second materialiser,
  `unwrapObjectSafely`, three hundred lines from `toJSON()` which already
  delegated to `tree()` — so the enhancer disagreed with itself about what a
  snapshot is, and the private copy never learned the marker rule. It emitted
  **17 keys** for a `status()` node: 2 state, 6 computeds and 9 setter METHODS.
  `deserialize()` then tried to `.set()` each one back, and a computed has no
  setter.

  `serialize()` now calls `tree()`; `deserialize()` routes markers through
  `hydrate` in `rehydrate` mode; and the nodeMap pass no longer blind-`.set()`s
  a marker's raw payload through whatever `set()` method it happens to expose.
  The private walker is deleted — **133 lines**, and the bundle got smaller
  despite the new code path.

  The reason it was kept — "serialize() needs type-preserving markers" — was
  never true: `tree()` returns live `Date`/`Map`/`Set`/`RegExp`/`bigint`
  instances and `encodeSpecials` does the marking. Verified for all six,
  nested included, before and after.

### Added

- **Undo/redo actually works.** `timeTravel()` undo/redo now restores form
  values, collection entries and status alongside plain leaves. Two silent
  defects made it not:

  1. **Restore dropped markers.** `recursiveUpdate` had no idea how to write a
     marker node, so undo moved the scalars and left the collection behind:
     `n=3 rows=3` → undo → `n=2 rows=3`. The user landed in a state the app was
     never in, and it reported success.
  2. **Capture missed marker writes entirely.** `interceptLeafSignals` requires
     both `set` and `update`; a `form()` has `set`/`patch`, an `entityMap` has
     `addOne`/`setAll`, a `status()` has `setLoading`. None qualified, so none
     marked the tree dirty and none were recorded. **Undo cannot restore what
     was never captured.**

- **`hydrate(node, value, mode)` — mode is a property of the CALL SITE**, the
  only place that knows whether a process boundary was crossed. `merge` is
  `tree(partial)`; `restore` is undo/redo (same process, a request may still be
  running); `rehydrate` is deserialize/SSR/storage (new process, nothing is in
  flight).

  **`restore` is exact, `rehydrate` is opinionated.** Form `touched` is restored
  on undo and dropped on rehydrate; `status()` `LOADING` is kept on undo and
  normalised to `NotLoaded` on rehydrate; `submitting` is never restored in any
  mode. See
  [undo-redo-vs-devtools.md](docs/architecture/undo-redo-vs-devtools.md).

### Security

- **`stored()` could leak its storage into any snapshot.** The marker held the
  caller's `options` — including their `storage` object — as an ENUMERABLE
  property, and `unwrap` deep-copies a raw marker by enumerating own keys. So
  wherever a raw marker reached a snapshot it carried the CONTENTS of that
  storage into `tree()`, and from there into `serialization()`,
  `persistence()`, devtools payloads and audit logs:

  ```json
  { "list": [{ "key": "k", "options": { "storage": { "auth-token": "SECRET-JWT" } } }] }
  ```

  13.4.0 closed the top-level and nested-object routes; a marker inside an
  **array** still escaped, because array elements are never traversed.
  `options` is now non-enumerable, so the payload is invisible to enumeration on
  every path — including any not yet found. `createStoredSignal` reads it
  directly and is unaffected. Verified on all five paths plus a plain object
  spread. (RFC 0008 item 1.)

### Changed

- **`entityMap` snapshots contain entities only.** `tree()` emitted `all`,
  `ids`, `count`, `map` and `empty`; only `all` is state. `ids` duplicated every
  key (48,891 of 486,733 bytes at 10k rows), and `map` — a `Map`, which JSON
  cannot represent — serialised as `{}`, so a persisted snapshot claimed the
  collection was EMPTY while holding 10,000 entities. That is wrong data, not
  just waste.

  Restore reads only `snapshot.all` (verified identical before and after), so
  round-trips are unaffected. Read `ids`/`count` off the live node
  (`tree.$.rows.ids()`), where they are correct and current.

  ⚠️ Breaking for anything reading `snapshot.rows.ids` / `.count` / `.map`.
  Keeping them as non-enumerable properties was measured and rejected: they must
  be computed eagerly to exist, costing **+12.2µs against 14.7µs** per
  materialisation at 10k rows. See RFC 0011 §1 for all 13 options.

### Added

- **[ST2021] — a marker inside an array.** Array elements are never traversed,
  so a marker in one is never materialized: `tree.$.list()[0]` stays a raw
  object, is not a signal, and writes to it are lost. Silent until now.
- **[ST2020] — duplicate `stored()` keys.** Two markers on one key each make
  their own signal; neither observes the other, so one holds a stale value and
  they race on write. Warned rather than interned — two calls may carry
  conflicting `defaultValue`/`version`/`migrate` with no correct merge, and a
  per-key generation counter would put a map lookup on `sig()`, the hottest path
  in the library, and make a signal read perform I/O. (RFC 0008 item 2.)

### Documentation

- **Recovering from corrupt stored data.** `reload()` already returns
  `'ok' | 'default' | 'error'`; the `onError` recovery recipe was the missing
  half. Added to the persistence guide, including why SignalTree does NOT write
  the default back to make signal and storage agree — that makes the invariant
  true and permanently destroys recoverable user data on boot. (RFC 0008 item 3.)
- **Corrected: incremental materialization does not cost writes "nothing".**
  Leaf writes are unaffected, but a partial update at the ROOT is ~17ns slower,
  because the root's cached materialization is now a consumer of every leaf
  beneath it. Confirmed with the versions in alternating order across 23 runs —
  non-overlapping ranges, so not machine noise.

### Internal

- `lint-skills` no longer warns on every run about `@signaltree/core/presets`,
  a subpath removed back in v9. The only doc that still names it is the v8→v9
  migration guide showing what to migrate FROM, now marked `@skip-lint`.
- Bundle budgets raised 0.1KB for the two new diagnostics. Entirely dev-only
  text: production is unchanged, and the foldability gate confirms consumers
  reclaim ~1.67KB per tree.

## 13.5.0 (2026-08-05)

Retires `@signaltree/enterprise` and moves the two capabilities worth keeping
into core. See [RFC 0010](docs/rfcs/0010-retiring-enterprise.md) for the full
decision record.

### Added

- **`compared()` / `byKeys()` — per-leaf equality.** A tree has ONE equality
  function for every leaf, which is the right default and the wrong answer for a
  handful of positions: the default cannot know which fields matter, or that a
  `version` field already answers the question.

  ```ts
  user: compared(initialUser, byKeys<User>('id', 'version'));
  ```

  Measured, 2M writes to one leaf — `deepEqual` vs a comparator: object
  `{id,name,email,version}` **53.8ns → 8.9ns (6.0x)**; the same object
  re-fetched over HTTP (equivalent value, new identity) **110.3ns → 9.0ns
  (12.2x)**; nested 3 levels **60.5ns → 9.5ns (6.4x)**.

  The point is not the speed. A comparator reaches the reference-equality floor
  (`Object.is`, 8.6ns) while KEEPING re-fetch correctness — which is exactly why
  defaulting leaves to `Object.is` is still rejected and an opt-in comparator is
  not the same trade. `byKeys()` is O(keys), so a version counter makes equality
  constant-time however large the value grows.

  Not useful on primitives: `deepEqual`'s first line is `if (a === b) return
true`, so on a changing number it measures **6.5ns against `Object.is`'s
  8.1ns** — the general function is faster and there is nothing to specialise.
  `compared()` makes its position a LEAF even for an object value (a bare object
  would have become a branch).

- **ST2018 — a dev warning when a collection is modelled as a plain array
  leaf.** The most expensive idiom mistake available, and it does not look like
  one. Same task, 1000 updates to a 50k collection: `entityMap` **1.63ms**,
  plain array leaf **49.80ms**, NgRx SignalStore **46.56ms** — the array leaf
  lands at parity with the store SignalTree otherwise beats ~28x.

  Documentation demonstrably did not prevent this: SignalTree's own demo
  benchmark shipped the array-leaf idiom while the entity cookbook sat in the
  repo. Deliberately conservative — silent below 32 elements, and for
  primitives, objects with no identity key, non-unique ids, non-primitive ids,
  nested arrays, nulls, and anything wrapped in `compared()`. Bounded 64-element
  sample, once per array at construction, dev only.

### Bundle size

- **The dev-mode floor grew ~1.0KB gzip; a production build grows 0.37KB.**
  Budgets raised deliberately (bare 5.8 → 6.9, entities 8.7 → 9.8, form
  7.9 → 9.0) with the attribution recorded in `tools/check-bundle-budget.mjs`.

  Minified bytes in the bare bundle: `signal-tree.js` +2137 (the ST2018
  diagnostic, the `compared()` marker interception, the materialisation
  wiring), `shared/deep-equal.js` +538 (the Error / primitive-wrapper /
  prototype-gate correctness fixes), `utils.js` +241 (the memo),
  `markers/compared.js` +113.

  It is **not** a tree-shaking regression — `compared.js` contributes 113 bytes
  because only its type guard survives. Roughly 0.7KB of the growth is dev-only
  text that folds: the same bundles built with `ngDevMode: false` grow only
  0.37KB, and the foldability gate confirms consumers reclaim ~1.49KB per tree.

### Performance

- **Time travel no longer scales with state size.** Recording a write cost
  O(state) four times over: materialise the tree, `structuredClone` it,
  `deepEqual` it against the previous entry, and — on every root write — a
  further full-state `deepEqual` just to decide whether to record at all. On top
  of that, `getHistory()` deep-cloned every entry on every call.

  With materialisation memoised and structurally shared, an unchanged subtree is
  the SAME object across snapshots, so an entry can hold the reference and every
  comparison collapses to `===`. 50 writes each changing ONE number:

  | rows   | before    | after                       |
  | ------ | --------- | --------------------------- |
  | 100    | 2.85 ms   | 0.13 ms (95.4% faster)      |
  | 1,000  | 29.51 ms  | 0.08 ms (99.7% faster)      |
  | 10,000 | 340.60 ms | **0.04 ms (99.99% faster)** |

  It is now **flat in state size** — the qualitative change, not the percentage.
  Memory per entry drops from a full copy of state to only the nodes that
  changed.

  ⚠️ Consequences: `getHistory()` returns entry states BY REFERENCE (the entry
  objects are still copied, so history metadata cannot be rewritten), and two
  snapshots that are structurally equal but referentially distinct are no longer
  collapsed into one entry — that needs a write that changed something and a
  later write that changed it back, in separate flushes, which is arguably two
  user actions.

- **Serialisation change detection no longer stringifies the tree.** `autoSave`
  polled `JSON.stringify(tree())` — materialise AND serialise everything, every
  100ms, to answer a yes/no question. `tree()` now returns the identical object
  when nothing changed, so an identity check is exact and O(1). Slightly more
  sensitive in the right direction: a write that JSON collapses
  (`{a: undefined}` vs `{}`) now triggers a save where it was previously
  dropped; it can never be less sensitive.

- **Every snapshot consumer was bypassing the cache.** `snapshotState()` called
  `unwrap` on the raw store, missing the memo entirely — so time travel,
  devtools and serialisation each rebuilt the whole tree on every call while
  `tree()` next door returned a memoised result.

- **`tree()` is incremental — it rebuilds only what changed.** Materialising is
  O(state), and doing that on every read when a write touched ONE leaf is the
  full-state-work-per-change anti-pattern this library exists to avoid. Each
  node now memoises its materialisation in a `computed`, so a node rebuilds only
  when a signal beneath it actually changed and clean subtrees are returned BY
  REFERENCE.

  Cost of reading the whole state, by how much actually changed:

  | shape                     | all leaves | one leaf        | nothing changed        |
  | ------------------------- | ---------- | --------------- | ---------------------- |
  | grid 100x100 (10k leaves) | 1807.8us   | 149.2us (12.1x) | 0.044us (**40,740x**)  |
  | grid 1000x20 (20k leaves) | 3665.8us   | 389.8us (9.4x)  | 0.051us (72,412x)      |
  | grid 20x1000 (20k leaves) | 5066.4us   | 311.6us (16.3x) | 0.045us (**111,558x**) |

  The "all leaves" column includes the memo's own overhead, so it understates
  the gain. Built on `computed()` rather than hand-rolled dirty flags, so the
  invalidation rides on Angular's existing write path. **Leaf writes are
  unaffected**; a partial update at the ROOT measures ~17ns slower (0.065 →
  0.082 µs), because the root's cached materialisation is now a consumer of
  every leaf beneath it and invalidating it is not free. Verified with the two
  versions in alternating order across 23 runs — non-overlapping ranges, so it
  is a real effect and not machine noise. No gain on deep-narrow shapes — this is a WIDTH optimisation.

  ⚠️ **BREAKING for anyone who mutates a snapshot.** `tree()` no longer returns
  a freshly allocated object, so mutating the result would corrupt the cache and
  survive into every later read. Snapshots were always meant to be read-only;
  that is now load-bearing, so each node is `Object.freeze`d in dev — mutation
  becomes an immediate `TypeError` instead of a corrupted tree found much later.
  If you mutate a snapshot, copy it first. Nothing in this repo did: all 751
  pre-existing core tests pass with the freeze active.

- **A wasted deep copy on every read of every branch.** After a child accessor
  returned its already-materialised object, `unwrap` called `unwrap()` on it
  again, deep-copying a plain object that was already plain. Every parent read
  minted a fresh copy of every child, so no subtree was ever reference-stable
  and the memo above shared 0 of 100 subtrees. Removing it took sharing to 99 of 100. The identical-looking recursion in the `isSignal` branch is load-bearing
  and was kept — a leaf's VALUE is user data, and copying it is what stops a
  snapshot aliasing live state.

### Fixed

- **A memoised snapshot of a non-reactive object would have been stale forever.**
  `snapshotState()` is public and accepts anything; memoising a plain object
  wraps it in a `computed` with NO dependencies, which can never invalidate, so
  the first read would be returned for the life of the process. Memoisation is
  now restricted to registered tree stores and node accessors, and everything
  else takes the plain walk. Caught by devtools' mock-tree tests, which hand it
  a plain object and mutate it in place.

- **A held `byId()` reference died permanently across remove → re-add.**
  `createEntityNode` captured the per-entity signal once; removing the entity
  deleted it and a re-add created a new one, leaving the held node reading an
  orphan forever while a fresh `byId()` worked. Holding a reference to a nested
  position is the capability this library has and immutable stores do not, so it
  has to survive the collection churning underneath it. Node reads now resolve
  through the map.

- **`timeTravel()` charged you for other trees.** It subscribes to the GLOBAL
  PathNotifier flush, so every time-travelled tree materialised and
  `structuredClone`d ITSELF whenever ANY tree in the process flushed, then threw
  the result away. Measured on one small tree's write: 0.008ms with no other
  trees alive, then 3.749 / 7.165 / 9.701ms as one, two and three unrelated
  10k-leaf trees were kept alive. Now gated on a self-dirty flag; flat at
  ~0.003ms regardless.

- **Enhancers silently dropped every tree method, losing writes.**
  `.with(timeTravel())` made `updateAndReport({count:1})` return `[]` and never
  write — the value did not change, nothing threw, and an empty report is
  indistinguishable from "nothing changed". Same for `batchUpdate()`.
  `timeTravel` and `batching` build a new tree object and copied the base tree
  across with `Object.assign`, which takes only ENUMERABLE own properties — and
  every tree method is defined `enumerable: false`. They now copy property
  DESCRIPTORS. A missing forward target is also no longer silent: it reports
  `[ST2017]` naming the cause, because that silence is what let this survive.

- **`deepEqual()` — three defects in the function every leaf write runs
  through.** It is the signals' `equal`, so each of these was silent and
  system-wide.

  `deepEqual(Object.create(Date.prototype), new Date(0))` **threw**: the object
  passes `instanceof Date` but has no `[[DateValue]]`, so `.getTime()` raised
  out of the comparison. `deepEqual(new Error('a'), new Error('b'))` was
  **true** — `name`/`message` are own but NON-enumerable, so key comparison saw
  nothing and a leaf holding an error never reported a change. Same for
  primitive wrappers: `new Number(1)` equalled `new Number(2)`. And a built-in
  against a keyless plain object (`new Date(0)` vs `{}`) compared equal, so a
  malformed payload was swallowed _and_ honestly reported as no change.

  Measured after the fix, interleaved against the previous implementation:
  arrays **−7.1%** (they now short-circuit before the built-in checks), plain
  objects +2.6%, Dates +9.2% for the try/catch that stops the throw, primitives
  and strings within noise. An intermediate revision that dispatched on
  `Object.prototype.toString` was **discarded on measurement** — +60% on Dates,
  +43% on arrays — because `a instanceof X && b instanceof X` short-circuits
  after one check and `||` does not.

- **`batching()` narrowed `batchUpdate()`'s signature.** Core accepts an object
  or an updater function; the batching override accepted only a function, so
  `.with(batching())` turned `batchUpdate({ count: 1 })` — the shape the docs
  use — into `TypeError: updater is not a function`. Restored to parity.

- **`updateAndReport()` reported writes that never happened.** Leaves are
  `signal(value, { equal })`, so a new-reference-but-deep-equal value is
  rejected by the leaf and notifies nobody — but the path was reported as
  changed anyway. The ordinary case is a re-fetched server payload identical to
  what you already hold: every key in it was reported.

  Audit trails, change feeds and targeted persistence all consume that list to
  decide what work to do, and the failure was silent — state stayed correct, so
  nothing looked broken; you simply synced, logged and wrote far more than
  necessary. It now reports only paths whose leaf accepted the write.

- **A state key named `prototype` crashed tree construction.** Nodes are
  callable functions and carry state keys as their own properties, and an
  ordinary function expression owns a non-configurable `prototype`, so
  `signalTree({ cfg: { prototype: 1 } })` died with
  `TypeError: Cannot redefine property: prototype` from inside
  `makeNodeAccessor`. Node accessors are now built as concise methods, which
  are not constructors and have no `prototype` at all. The reserved-name list
  for state keys is now empty.

- **`unwrap()` silently deleted state stored under `set` or `update`.** A leaf
  signal _is_ a function, and the guard skipped those keys by name whenever
  their value was a function — so a permission `set` or an `update` timestamp
  vanished from every snapshot, every persisted payload and every
  `structuredClone`. The general plain-function skip already covered the case
  the guard was written for, and covers it by value rather than by name. Keys
  named `length` and `prototype` were dropped the same way on the accessor path
  and are fixed alongside.

- **`deepEqual(NaN, NaN)` returned `false`** (`@signaltree/shared`), so a leaf
  holding `NaN` — a failed parse, a `0/0`, `Number('')` on a blank field —
  counted as changed on every rewrite of the same `NaN` and notified every
  dependent computed and effect. Now SameValueZero for primitives, matching
  `lodash.isEqual` and `Object.is`.

### Security

- **Prototype pollution in `updateOptimized()`** (`@signaltree/enterprise`).
  Patch application walked and assigned with plain bracket access, so a
  top-level `__proto__` key reached the prototype setter and polluted
  `Object.prototype` process-wide. `JSON.parse` creates a real own `__proto__`
  key, making this reachable from any untrusted server or user payload:
  `tree.updateOptimized(JSON.parse('{"__proto__":{"isAdmin":true}}'))` set
  `({}).isAdmin`. Traversal is now own-property-only and the final write uses
  `Object.defineProperty`, so a hostile key lands as inert data. Five tests,
  verified to fail against 13.4.0.

### Deprecated

- **`@signaltree/enterprise` is deprecated.** Use `tree.updateAndReport()` and
  `tree.updateAndReport()` from `@signaltree/core`. The package stays published so
  existing installs keep resolving, and receives security fixes only. Full
  migration table in the [package README](packages/enterprise/README.md).

  **The headline performance claim was inverted.** Measured against
  `tree.updateAndReport()`, which returns the same changed paths,
  `updateOptimized()` is slower in every workload measured — at 2,000 leaves,
  **~7x** when 10% of leaves change, **~2x** on an identical re-fetch and
  **~160-190x** when every leaf changes (at 500 leaves: ~4x, ~1.5x, ~43x) — and
  the ratio grows with tree size in all of them. The "2-5x faster" claim was never
  measured against core. This is structural rather than a tuning problem: core
  leaves already use deep equality plus a reference-equality short-circuit, so
  "only write what changed" is core behaviour for free — the diff engine pays
  O(state) to skip writes that were already no-ops. The claim has been
  corrected in the package README, the agent skill, the enhancer JSDoc and the
  demo page.

  The package also has no independent runtime dependency, which puts it on the
  wrong side of the packaging rule in RFC 0007.

  **Bundle cost corrected to ~3.8KB gzipped** (previously documented as 2.4KB,
  then 3.1KB). CI never caught either figure because
  `scripts/consolidated-bundle-analysis.js` measures this package's 235-byte
  re-export barrel rather than its bundled output.

  **Two migration rows are an upgrade, not an equivalence.** `restore()` and
  `updateAuto()` (with a threshold configured) both inherit the array defect;
  the core forms handle arrays correctly. See RFC 0010.

### Removed

- **`@signaltree/enterprise/scheduler` and `@signaltree/enterprise/thread-pools`
  subpath exports.** Both were dead: no caller anywhere in the repo, no tests,
  no documentation. `thread-pools` only ever exported `createMockPool()`, a test
  double that should not have shipped to production consumers, and `scheduler`'s
  advertised "yield to the event loop" was `await Promise.resolve()` — a
  microtask, which does not yield.

### Known issue (not being fixed)

- **`updateOptimized()` silently drops array writes** (`@signaltree/enterprise`).
  An array in a SignalTree is a single leaf — one `WritableSignal<T[]>`, never
  per-index signals — but the diff engine emits element-level change paths
  (`users.1`). The apply step cannot resolve a segment past an array leaf, so
  the patch is dropped while the caller is told `changed: true` with that path
  listed. Object patches are unaffected.

  **Workaround:** write the array through its leaf
  (`tree.$.users.set(newUsers)`), or migrate to `tree.updateAndReport()`, which
  handles arrays correctly.

  Two fixes were attempted and both withdrawn before release, each having
  introduced defects worse than the one it closed.

  The first reconstructed the array from element patches: a shorter intended
  value left the stale tail in place (`[1,2,3]` + `[9,2]` produced `[9,2,3]`),
  class instances were downgraded to plain objects by the clone, `__proto__`
  became an injection path, and the signal was written once per changed element
  rather than once per array — 652x slower than a plain `.set()` on a
  2000-element array.

  The second took arrays whole from the payload, which fixed all four, but added
  a second traversal that duplicated the differ's job while honouring none of
  its contracts: sibling keys containing a literal dot were silently dropped
  (`{ items: [...], 'items.count': 3 }` wrote the array and lost the count),
  unchanged arrays from `JSON.parse` compared unequal forever and reported 30 of
  30 no-op polls as changes, circular payloads crashed it, and `maxDepth`,
  `ignoreArrayOrder` and `equalityFn` were bypassed. Given the package is now
  superseded, the defect is documented rather than fixed.

## 13.4.0 (2026-08-05)

Closes the traversal gap that made markers invisible to the tree's own snapshot
and write paths — including a case that leaked unrelated storage contents into
serialized output — and adds the diagnostics that would have surfaced it years
earlier. See [RFC 0009](docs/rfcs/0009-13.4.0-implementation-plan.md).

### Security

- **An explicit `storage:` option no longer reaches snapshots — for markers
  nested under OBJECT parents.** Such a marker used to surface as its RAW
  MARKER from `tree()`, carrying `options.storage` with it, and `unwrap`
  deep-copied that storage object, enumerating unrelated keys into the
  snapshot. Anyone passing `storage:` explicitly _and_ using `serialization()`,
  `persistence()`, devtools or `createAuditTracker` was emitting that storage's
  contents into those payloads. The default path was never affected (the
  marker's `options` stays empty because `createStoredSignal` resolves storage
  itself).

  **Still leaking, not fixed here:** a marker placed inside an ARRAY or a `Map`
  (`{ list: [stored(...)] }`). `createSignalStore` hands arrays and built-ins
  straight to `signal(value)` without walking into them, so materialization
  never sees the marker. Do not put markers inside arrays or Maps; if you pass
  an explicit `storage:`, treat that combination as unsafe to snapshot until a
  later release extends traversal.

- **Markers in LAZY trees now throw in dev instead of corrupting snapshots.**
  A lazy tree resolves values through a Proxy that never runs marker
  materialization, so a marker there stayed a placeholder. Before this release
  that leaked a raw marker; after it, the placeholder simply reads as an opaque
  getter and its value is dropped from every snapshot **silently** — strictly
  worse. `[ST2012]` now fails loudly at the point of use.

### Fixed

- **`stored()` leaves are visible to tree traversal** (`@signaltree/core`). A
  materialized `StoredSignal` was a plain callable satisfying neither
  `isSignal` nor `isNodeAccessor`, and every traversal branches on exactly
  those two guards — so a top-level stored leaf was omitted from
  `tree()`/`unwrap()`, a deep-merge write through a parent was silently
  dropped, and `applyState()` (the devtools replay path) REPLACED the live
  signal with a raw value, after which reading it threw. The stored signal now
  _is_ the Angular signal.
- **Nested markers no longer emit their raw marker object.** `makeNodeAccessor`
  copies a store's properties onto the accessor while its call path closes over
  the original store; materialization wrote only to the accessor, so the store
  kept the raw marker forever. This affected **every** marker — nested
  `status()`, `entityMap()`, `form()` and `asyncSource()` all leaked raw
  markers into `tree()`; only `stored()` was noticed, because its marker
  carries a `Storage` handle.
- **`tree()` called before `tree.$` now finalizes.** Every other entry point
  (`$`, `with`, `updateAndReport`, `batchUpdate`) did; the builder's own call
  path was the sole omission, so `tree()` as a first operation returned raw
  markers and wrote through unmaterialized ones.

### Added

- **Dev-mode diagnostics for writes and snapshots that go nowhere**
  (`ngDevMode`-guarded, deduped per path, zero production cost):
  `ST2010` a write to a key absent from the tree's initial shape (it has no
  signal to land on and is discarded); `ST2005` a write to a value that is
  neither a writable signal nor a node accessor; `ST2008` such a value being
  omitted from a snapshot; `ST2009` `applyState` overwriting a live callable.
  Every one of these was previously silent — `ST2010` in particular is what
  made a guardrails rule appear broken for hours.
- **`reload()` returns `'ok' | 'default' | 'error'`** (was `void`; additive).
  `'error'` means the stored data could not be read or migrated: the signal
  falls back to its default while storage is left **intact**, because
  destroying data a human might still recover is the caller's policy choice.
  `StoredReloadResult` is exported.

### Changed

- `tree()`/`unwrap()` output now contains stored leaves and real marker values
  where omissions or raw markers used to be, and a merge write through a parent
  now reaches stored leaves — and therefore writes to storage. Both are the
  fix; code relying on the previous behaviour is the compatibility risk, which
  is why the diagnostics above ship in the same release.
- **A merge write REPLACES an object-valued stored leaf, it does not merge into
  it.** `tree({ cfg: { prefs: { theme: 'dark' } } })` where `prefs` is a
  `stored()` holding `{ theme, lang }` leaves `{ theme: 'dark' }` — `lang` is
  gone from memory and from storage. A plain nested namespace in the same
  position deep-merges. Previously the write was dropped entirely, so this is a
  change from silently-skipped to destructive: audit merge writes that cross an
  object-valued stored leaf.
- **Persisted values now appear in time-travel and devtools payloads.** They
  were absent only because the leaf was invisible to traversal. Since `stored()`
  is the documented home for drafts and tokens, review what your history and
  devtools frames now carry.

### Considered and rejected

- **A duplicate-storage-key dev warning.** Implemented, then removed: the
  registry can only see that a key was claimed before, not whether the earlier
  signal is still alive, so it fired on the legitimate pattern of a per-route
  tree being destroyed and recreated on navigation. A warning that cries wolf
  on normal usage is worse than none.

## 13.3.1 (2026-08-05)

Correctness follow-up to 13.3.0. An independent audit of that release found two
real defects in the shipped `stored()` durability work — one of them undermining
the exact guarantee 13.3.0 was written to provide. **Anyone on 13.3.0 who uses
`stored()` with `version`/`migrate`, or who creates and destroys trees, should
take this patch.**

### Fixed

- **`stored()`: `clear()` and `reload()` are no longer undone by a migration
  re-persist** (`@signaltree/core`). When a stored value is migrated on load,
  the migrated data is written back in a queued microtask. `clear()` and
  `reload()` cancelled the debounce/maxWait _timers_, but a microtask cannot be
  cancelled and its guards still passed — so calling `clear()` in the same tick
  that a tree materialized with a version migration removed the key, and one
  microtask later the migrated value was written straight back. `reload()` had
  the mirror form, leaving the signal on its default while storage silently
  held stale migrated data — reintroducing precisely the signal/storage drift
  13.3.0 claimed to eliminate. Both operations are authoritative now: they bump
  the write generation the deferred re-persist checks, so it becomes a no-op.
  The window was narrow (same-tick, migration-only), but `clearStoragePrefix()`
  on logout during bootstrap hits it.
- **`stored()`: the lifecycle-drain registry no longer retains destroyed trees**
  (`@signaltree/core`). Every debounced stored signal registered its flush
  closure in a module-level `Set` that was never cleaned, on the stated premise
  that stored signals "live as long as their tree, typically the app". That
  premise was wrong — `signalTree()` has `destroy()`, and per-route or
  per-dialog trees are routine. Each stale entry retained the `Storage`
  backend, the marker's `defaultValue`, the signal's current value, and any
  `serialize`/`deserialize`/`migrate`/`onError` callbacks, so a `stored()`
  holding a cached list leaked that payload for the life of the page (measured:
  ~4 MB across 20 short-lived trees), and every drain walked signals nobody
  could reach. Membership is now scoped to **pending writes** rather than to
  signal lifetime: a signal enrols when a debounced write is armed and leaves
  the moment it commits or is cancelled. Idle signals are never registered, so
  there is nothing to leak, while anything unpersisted stays reachable by the
  drain. No API change.

  (A `WeakRef`-based version of this fix was written first and rejected in
  review: `WeakRef` to the signal watches the wrong object — the drain needs
  the commit closure, which does not reference the signal, so a signal could be
  collected while its write was still armed and the value silently dropped.
  Page-hide is precisely when a mobile WebView both collects and stops firing
  timers, making that the common case rather than a corner one. Weakness must
  not be able to outrace durability.)

- **`stored()`: one failing signal no longer abandons the rest of a drain**
  (`@signaltree/core`). `flushAllStoredSignals()` had no isolation between
  signals, so an exception escaping one commit — e.g. an instrumented
  `console.warn` from Sentry/LogRocket/Datadog on the no-`onError` path — left
  every signal after it in the iteration unpersisted and propagated out of the
  `pagehide`/`visibilitychange` listener. Each commit is now isolated.
- **`stored()`: removal failures report `operation: 'remove'`** instead of the
  misleading `'write'`. `StoredErrorContext['operation']` gains `'remove'` — a
  widening, so existing exhaustive handlers keep compiling but should add the
  case if they switch on it.
- **`createFormTree()`: `getFieldError()` / `getFieldAsyncError()` now resolve
  concrete array-index paths validated via glob keys** (`@signaltree/ng-forms`).
  The per-field error map was pre-seeded only from the validator map's literal
  keys — so a validator registered as `phones.*.value` produced errors keyed by
  concrete paths (`phones.0.value`) that `getFieldError('phones.0.value')`
  could never see: it fell into an always-`undefined` stub while the form-level
  `errors()` summary showed the message, leaving the two error surfaces on one
  form disagreeing. Both lookups now lazily create (and cache) a computed for
  any requested concrete path, reading the same `errors()` source of truth.
  Found via the ng-forms demo page, which exercises exactly this pattern.
  (`createFormTree` remains deprecated in favor of `form()` + `signalForm()`;
  the fix keeps the legacy bridge honest for existing consumers.)
- **`createFormTree()`: field lookups no longer resolve `Object.prototype`
  members** (`@signaltree/ng-forms`). The per-field error caches, the
  `errors()`/`asyncErrors()` snapshots, and `findValidator()` were all plain
  object literals indexed by caller-supplied field paths — so a field named
  `toString`, `constructor`, or `valueOf` resolved to the inherited method.
  `getFieldError('toString')()` returned `"[object Undefined]"` where an error
  message belonged; `valueOf`/`hasOwnProperty`/`toLocaleString` threw inside
  change detection; and worst, `findValidator()` could hand
  `Object.prototype.toString` back to be **invoked as a validator**. All three
  now use null-prototype records or an own-property guard.
- **`createFormTree()`: the per-path error cache is bounded and released**
  (`@signaltree/ng-forms`). Only paths a validator actually covers are cached —
  errors can only originate from a validator, so uncovered paths share one
  constant signal instead of accumulating a `computed` per path — and
  `destroy()` now clears the cache. Without this, a template calling
  `getFieldError()` per row of a long or virtualised `FormArray` retained one
  computed per index ever rendered, for the life of the form.
- **`createFormTree()`: glob validator keys are no longer seeded into the public
  `fieldErrors` / `fieldAsyncErrors` records** (`@signaltree/ng-forms`). Those
  records are keyed by concrete paths, so a `phones.*.value` entry could only
  ever read `undefined` — publishing a signal that looked broken. The records
  are now documented as lazily-populated caches whose key set depends on which
  fields have been queried; `getFieldError(path)` is the supported per-field
  accessor and `errors()` the complete map. Do not enumerate the records.

### Known limitations (documented, not changed)

- **`stored()` leaves are invisible to tree traversal.** A materialized
  `StoredSignal` is a plain callable — neither an Angular signal nor a
  `NodeAccessor` — so `tree()`/`unwrap()` skip it (a nested one can surface the
  raw marker object, `Storage` instance included), and a deep-merge write
  through a parent (`tree.$.settings({ theme })`) is silently dropped rather
  than reaching the stored leaf. Read and write stored values directly. Two
  stored signals sharing a key are also independent, with no coherence between
  them. These predate 13.3 and are now documented on `stored()` itself; fixing
  the first two requires changing core traversal, which does not belong in a
  patch release.

### Changed

- **Documentation: the leaf-vs-node contract is now stated at the source.**
  `NodeAccessor`, `makeNodeAccessor`, `@signaltree/callable-syntax`'s transform,
  and the agent skill each carry it explicitly: only leaves are Angular signals;
  nodes are callable by nature (`node()` reads, `node({partial})` deep-merges,
  `node(fn)` updates) and deliberately have no `.set()`/`.update()`. Repeated
  incorrect "fixes" in this area motivated writing it down where the code is.
- **`@signaltree/callable-syntax`: known defects are documented and pinned by
  tests.** The rewrite is purely syntactic, so it also rewrites branch writes,
  `entityMap`/marker methods, and marker reads that take an argument, producing
  `.set`/`.update` on targets that have neither. These are transform defects,
  not constraints on core; fixing them needs a type-aware rewrite. 68 tests now
  pin the real behavior, including the defects, so a fix is a visible change.
  No behavior change in this release.

## 13.3.0 (2026-08-04)

Durability release for the `stored()` marker (`@signaltree/core`), prompted by
a field report from a Capacitor app: a value `.set()` right before the app was
backgrounded/killed could be lost, because the debounced storage write
(default 100 ms) had not fired yet and nothing drained it on teardown. The
debounce/coalescing model is unchanged — this release makes draining safe and
gives durability-critical keys explicit levers.

### Fixed

- **`stored()`: `clear()` and `reload()` now cancel a pending debounced
  write.** Previously `clear()` removed the key synchronously but left the
  write timer armed, so the cleared value was written back ~100 ms later —
  resurrecting it in storage while the signal held the default (signal/storage
  drift). `reload()` had the same hazard: the stale pending value could
  overwrite what was just read. Both now treat their own operation as the
  source of truth.
- **`stored()`: `reload()` now runs migrations.** It previously applied stored
  data regardless of its `__v`, so reloading a key written by an older app
  version (e.g. another tab) bypassed the `migrate` function that initial load
  would have run. `reload()` and initial load now share one code path.
- **`stored()`: a deferred migration re-persist can no longer clobber newer
  data.** The microtask that re-saves migrated data now skips itself if the
  app wrote (or has queued) a newer value since it was scheduled.

### Added

- **`stored()`: `flush()`** — synchronously commits a pending debounced write
  and cancels the timer. No-op when nothing is pending.
- **`flushAllStoredSignals()`** (exported from `@signaltree/core`) — drains
  every live stored signal. Wire it to native lifecycle hooks the DOM can't
  see, e.g. Capacitor's `App.addListener('pause', …)`.
- **Automatic lifecycle drain.** Every stored signal with debounced writes is
  drained on `visibilitychange` → `hidden` and `pagehide` (one shared listener
  pair, installed lazily, SSR-safe). This closes the reported loss window with
  no consumer changes: by the time a mobile WebView is suspended or a tab is
  closed, pending values are in storage.
- **`stored()`: `maxWaitMs` option** — bounds how long successive updates can
  delay a write. Plain debouncing resets the timer on every update, so a key
  updated faster than `debounceMs` never persisted until updates stopped;
  `maxWaitMs` guarantees a write at most that long after the first unpersisted
  update.
- **`stored()`: `onError` option** (+ exported `StoredErrorContext` type) —
  callback for storage failures (`read` / `write` / `migrate`). Without it,
  failures only `console.warn` in dev mode and are compiled out of production
  builds — quota errors silently dropped data with no programmatic signal.

### Changed

- **`stored()`: `debounceMs: 0` now writes synchronously in the caller's
  stack** (previously deferred one microtask). `set()` returning now means the
  value is in storage — equivalent durability to calling `storage.setItem`
  yourself, for keys that must never sit in a debounce window.
- **`stored()`: debounced writes commit directly in the timer callback**
  (previously deferred one extra microtask inside the `setTimeout`, which
  bought nothing and complicated cancellation).

## 13.2.0 (2026-07-28)

> **Heads-up for `signalForm()` users:** this release changes the **default error
> shape** emitted by the Angular Signal Forms bridge (`nativeErrors` now defaults
> to `true`). That is a behavior change in a minor — see "Changed" below. Pass
> `nativeErrors: false` to keep the previous shape. Everything else in 13.2 is
> additive. Upgrade notes: [`docs/guides/migration-v13.2.md`](docs/guides/migration-v13.2.md).

### Changed

- **`signalForm()`: `nativeErrors` now defaults to `true`** (`@signaltree/ng-forms`).
  Built-in marker validator failures (`required`, `email`, `min`, `max`,
  `minLength`, `maxLength`, `pattern`) bridged into Angular Signal Forms are
  emitted as Angular's **branded** validation errors (`requiredError()`,
  `minError(min)`, …) — so `error instanceof NgValidationError` holds and
  constraint values are typed properties — instead of plain `{ kind, message }`
  objects. This is the flip announced in 11.6.0 and deferred through 12.x and
  13.x; branded errors are the Angular-native shape, so they are what a fresh
  caller should get by default.

  **Why a minor, not a major:** the flip was announced two versions ago and has
  been emitting a one-time dev-mode notice for callers who left the option unset
  ever since, so it is not arriving unannounced. The affected surface is narrow —
  the `signalForm()` marker overload requires Angular 22 — and opting out is a
  one-word change. Being explicit about it here rather than hiding it in a major
  is the trade being made.

  **Migration:** `kind` and `message` are present on **both** shapes, so code
  reading only those two is unaffected. What needs updating: narrowing on the
  plain object shape, serializing errors (a branded error is a class instance, so
  `JSON.stringify` output differs), and deep-equality assertions in tests
  (`toEqual({ kind, message })` against a branded instance fails — assert on
  properties or `toBeInstanceOf`). Or pass `nativeErrors: false` to keep the
  pre-13.2 behavior. Custom/untagged validators are **unaffected** — they emit
  `{ kind: 'signalTree', message }` in both modes, as before.

### Added

- **Documented + gated: how to drop SignalTree's dev-only code in production**
  (`docs/performance/dropping-dev-code.md`, `tools/check-devmode-foldable.mjs`).

  The dev-mode guardrails sit behind `ngDevMode`, which is a **runtime global
  Angular assigns — not a compile-time constant a bundler substitutes in library
  code**. So `typeof ngDevMode === 'undefined' || ngDevMode` is unresolvable at
  build time, the branch survives minification, and the advisory message strings
  ship to production by default. That was never written down.

  One line reclaims them — Angular `"define": { "ngDevMode": "false" }` (its
  `define` explicitly applies to libraries), or the equivalent in Vite / esbuild /
  webpack. Measured, own code only, gzip: bare **5.55 → 5.04 KB**, with
  `entityMap()` **8.48 → 7.61 KB**, with `form()` **7.69 → 7.00 KB**.

  A new blocking gate (`10c`) keeps the escape hatch working: it builds each
  target twice and fails if defining `ngDevMode: false` stops shrinking the
  output, or if any advisory code survives it. That catches the regression where
  a dev gate becomes un-foldable (`if (isDev())`, a helper call — anything that
  isn't a bare `ngDevMode` comparison), which would silently charge every consumer
  for prose they can no longer remove.

  **Deliberately unchanged:** thrown-error messages (`ST1xxx`, plus `ST2004`–
  `ST2006`) still ship in production. `constants.ts` keeps one table for both
  modes with each string under ~25 chars, because an exception identified only by
  an opaque integer is useless in a production stack trace. Advisory prose is
  removable; error identity is not.

- **New guide: `docs/guides/composition-recipes.md`** — the resolved forms of three
  capabilities that get requested as features and are deliberately _not_ API: a
  standard enhancer policy, a reusable entity-CRUD Ops base, and a selection
  read-model. Each composes primitives that already ship. Includes the two traps
  the audit surfaced: gating `timeTravel()` on a runtime boolean defeats
  tree-shaking (it's the RFC 0005 §0 mistake — gate structurally instead), and
  optimistic rollback must snapshot _prior values_ and restore the whole of what
  an operation touched.

- **Corrected an inaccurate `updateAndReport()` claim** in the root README. It was
  described as providing "a changed-paths report for rollback"; it returns changed
  **paths**, not previous values, so it cannot restore state on its own. Rollback
  is snapshot → write → restore. The paths report is for partial server-payload
  sync, audit trails, and targeted persistence — which is what its own JSDoc says.

- **`[ST2007]` dev-mode guardrail: `.derived()` no longer drops values silently**
  (`@signaltree/core`). The merge walked each derived value and ignored anything
  that wasn't a signal, a derived marker, or a plain object — with a
  `// shouldn't happen` comment and no diagnostic. It does happen, and the usual
  cause is brutal to find: if an app or test runner loads **two copies of
  `@angular/core`**, each has its own `Symbol(SIGNAL)`, so `isSignal()` inside
  `@signaltree/core` rejects a `computed()` the caller just created and **every**
  derived value is discarded. The feature simply appears not to work.

  Now warns, and distinguishes the two cases: a value carrying an own
  `Symbol(SIGNAL)` that `isSignal()` still rejects is reported as a duplicate
  `@angular/core` with the bundler fix (Vite `resolve.dedupe`, Jest
  `moduleNameMapper`) and an explicit note that the caller's `.derived()` code is
  not at fault; anything else gets the generic "expected a signal, got X".
  Dev-mode only, so production is unaffected.

  Found the hard way while reviewing a real consumer whose test suite had exactly
  this duplication — 12 domains' worth of derived selection state was missing from
  the tree with no warning of any kind.

### Fixed

- **`DevToolsMethods` and `OptimizedUpdateMethods` are now exported from
  `@signaltree/core`** — they existed as `export interface` in `lib/types.ts` but
  were never re-exported from the barrel, while their siblings
  `BatchingMethods`/`TimeTravelMethods`/`EffectsMethods` were. That inconsistency
  broke a real consumer pattern: `.with()` returns `this & TAdded`, so a
  **library** that wraps an enhancer chain —

  ```ts
  export function withStandardEnhancers<T extends object>(tree, opts) {
    const enhanced = tree.with(batching()).with(devTools({ treeName }));
    return opts.isProduction ? enhanced : enhanced.with(timeTravel());
  }
  ```

  — infers a return type referencing those interfaces. With them off the barrel,
  the consumer's own declaration emit cannot name them, so the helper is forced to
  annotate a narrower return type and **erase the enhancer methods for all its
  callers** (`.batch()`, `.undo()`, … become unreachable). Found in a downstream
  library that had done exactly that, with a comment explaining why.

  Verified by compiling a simulated consumer library against the built package:
  its emitted `.d.ts` now names the types through `import("@signaltree/core")`
  rather than failing. Purely additive — two type exports, no runtime change.

- **`entityMap().computed()` slice names are now typed on `tree.$`**
  (`@signaltree/core`). Reading a slice used to require throwing away type
  safety — `(tree.$.users as any).active()` — which the docs taught as the
  official access pattern. `TreeNode<T>` now threads the builder's accumulated
  slice record through materialization, so `tree.$.users.active()` is
  `Signal<User[]>` with no cast, `.computed()` chains type each name
  independently, and loader-backed collections keep their loader surface
  alongside the slices.

  Type-only — the runtime already attached slices to the entity signal; nothing
  about the emitted JS changes. A slice-free `entityMap()` still resolves to
  exactly `EntitySignal<E, K>` (asserted as a regression row in
  `marker-resolution.typing.spec.ts`, alongside rows for chained slices and the
  loading variant).

  The subtlety worth recording: `.computed()` accumulates slices by
  intersection over a `Record<string, never>` seed, so a collection with two
  slices types as `Record<string, never> & Record<'a', A> & Record<'b', B>`.
  A bare `keyof` on that is `string`, and an `extends Record<string, never>`
  emptiness test matches it — so the implementation filters the index signature
  out (`LiteralKeys`) before mapping. Getting this wrong silently grafts an
  index signature onto every plain collection.

  No runtime surface is added, so this needed no major. Strictly, resolved types
  gain an intersection member — assignments to `EntitySignal<E, K>` still work
  (an intersection is assignable to its member), but an exact-type assertion in
  consumer code (`Equal<$['users'], EntitySignal<User, number>>`) would now see
  the slice-bearing type on a collection that has slices.

### Changed (dev-mode notice)

- The one-time dev-mode `console.info` about the _upcoming_ `nativeErrors` flip is
  replaced by one about the _completed_ flip: an unset caller is now told once that
  the default is `true` and how to opt out. Kept precisely because the flip lands
  in a **minor** — a caller who upgrades without reading this file would otherwise
  get different objects out of `field().errors()` with no signal at all. Setting
  the option either way silences it, and it is `ngDevMode`-gated so production
  pays nothing. (`__resetNativeErrorsAdvisoryForTests` is renamed
  `__resetNativeErrorsNoticeForTests`; module-internal, never on the barrel.)

## 13.1.1 (2026-07-25)

### Fixed

- **Packaging**: `@signaltree/schema` no longer ships `src/__tests__/test-helpers.d.ts`
  in its published tarball (a non-`.spec` test helper its `files` glob swept up).
  Excluded `__tests__`/`*.spec.d.ts` from the package `files`.

### Internal

- Replaced the unused `verify-size-claims.js` byte-count rubber-stamp with
  `verify-package-hygiene.js`, which inspects the real packed tarball
  (`npm pack --dry-run`) and fails if a package ships test specs / source maps /
  raw `.ts` / `tsconfig` / `__tests__` / fixtures, or is missing a declared entry
  (`main`, `exports` subpaths, `.d.ts`). Wired into `validate.yml` and the
  `ci-publish.sh` pre-publish preflight.

## 13.1.0 (2026-07-24)

### Added

- **`trackHistory(model, options?)` (`@signaltree/core`)** — the marker-free
  counterpart to `history()`: attaches the same signal-native undo/redo
  engine to ANY `WritableSignal`, not just a `form()` marker's values signal.
  Point it at the model behind a plain Angular Signal Forms `form(model,
schema)` (or any writable signal) and get `undo()`/`redo()`/
  `clearHistory()`/`canUndo: Signal<boolean>`/`canRedo: Signal<boolean>`/
  `history: Signal<{ past, present, future }>` — the identical
  `FormHistoryApi<T>`/`FormHistoryOptions<T>` shapes `history()` uses. Runs
  an internal `effect()` that records every model change, whatever the write
  source (`model.set`/`.update()`, or a Signal Forms field edit through a
  bound `FieldTree`, which writes the model directly); requires an injection
  context or an explicit `injector` option.
- **`signalForm()` marker overload — `SignalFormOptions.schema` widened to
  `SchemaOrSchemaFn<T>`** (`@signaltree/ng-forms/signals`) — now accepts a
  cached `Schema` object from Angular's `schema()`, not just a `SchemaFn`.
  Lets a schema built once be reused across multiple bridged forms; composes
  with marker validators exactly as before (`apply()`, on the shared model).
- **`signalForm()` marker overload forwards `name`, `submission`, and
  `experimentalWebMcpTool`** to Angular's `form(model, schema, options)` —
  including WebMCP AI-agent tool registration (pair with Angular's
  `provideExperimentalWebMcpForms()`). A schema-level `validateAsync` is
  unaffected by the marker's `[ST2005]` single-async-authority guard, which
  only fires when the MARKER ITSELF carries `asyncValidators`.

## 13.0.1 (2026-07-24)

### Fixed

- **`form()` marker: nested-object deep field accessors** (`form.$.a.b`) read and
  wrote the ROOT path instead of the nested path — `form.$.profile.address.city()`
  returned `undefined` and `.set()` wrote a stray root key, corrupting shape.
  Accessors are now path-aware. (Flat forms were unaffected; regression-guarded
  by a new shape suite.)
- **`form()` marker: a nested field named `name` or `length`** crashed marker
  materialization (`Object.assign` onto the function-typed accessor hit a
  function's non-writable `name`/`length`). Now uses `Object.defineProperty`, so
  nested fields may be called `name`, `length`, etc.
- Added comprehensive control-SHAPE test coverage — primitives, nested objects,
  arrays, array-of-objects, and record/map fields — across the `form()` marker,
  `history()`, `signalForm()`, and `createFormTree` (the classic FormArray/nested
  paths were previously untested; confirmed correct).
- `createAuditTracker` (moved to `@signaltree/core` in 13.0.0) typed its `tree`
  parameter as `ISignalTree<T>`, but `signalTree()` returns a
  `SignalTreeBuilder<T>` that isn't structurally assignable to it — so callers
  had to write `createAuditTracker(tree as unknown as ISignalTree<T>, log)`.
  The parameter is now typed `NodeAccessor<T>` (what the tracker actually needs
  — it only reads the tree via `tree()`), so `signalTree()` output is accepted
  directly with no cast. Behavior unchanged.

## 13.0.0 (2026-07-24)

> RFC 0007's packaging principle — _independent dependency/runtime → its own
> package; a within-tree mechanic (needs only `@signaltree/core` +
> `@signaltree/shared`) → core_ — applied to two capabilities that were filed
> under the wrong tree, plus a new signal-native undo/redo feature for
> `form()` and an events↔`entityMap` bridge. Breaking because the
> core↔ng-forms moves change canonical import paths.

### Added

- **`history()` (`@signaltree/core`) — signal-native undo/redo for `form()`
  markers.** `form({ history: history({ capacity?: 10, exclude?: (keyof T)[] }) })`.
  Materializes as `tree.$.myForm.history?` → `{ undo(), redo(), clearHistory(),
canUndo: Signal<boolean>, canRedo: Signal<boolean>, history: Signal<{ past,
present, future }> }`. Attaches to the marker's values signal — the same
  signal `signalForm()` uses as its Angular Signal Forms `FieldTree` model —
  so undo/redo drive BOTH the marker API and any bound Signal Forms field
  tree from one engine, including edits made _through_ the field tree.
  `exclude` is a security feature: excluded fields never enter the snapshot
  buffer and keep their live value across an undo (a stripped secret can
  never be resurrected). A raw object passed as `history` (instead of
  `history()`'s output) throws `[ST2006]` at the `form()` call site
  (fail-closed, not a silent no-op). Injected-feature shape identical to
  `security()`/`loader()` — tree-shakeable: a bundle that never imports
  `history()` doesn't pay for the snapshot/undo engine (measured Δ ≈ 0.69KB
  gzip for `form()` + `history()` vs `form()` alone).
- **`entityEventHandler(entities, mapping)` (`@signaltree/events/angular`)** —
  maps a _batch_ of domain events onto `entityMap`'s batch mutation ops
  (`upsertMany`/`updateMany`/`removeMany`), collapsing what used to be one
  signal notification + one O(size) Map clone per event into a handful of
  calls per batch. `mapping = { match?, upsert?, update?, remove?, selectId? }`.
  Compose with `batchedHandler` to turn a live event stream into periodic
  coalesced flushes. Coalescing rules (same-id touches fold in arrival order,
  removal wins over upsert/update to the same id in the same batch,
  structurally-identical `update` deltas collapse into one `updateMany` call)
  are documented on the export.
- **`applyOptimisticEntityChange(entities, id, change)` (`@signaltree/events/angular`)**
  — applies an optimistic change to one entity in an `entityMap` collection
  and derives the `rollback` closure automatically from the collection's
  current entry (restore the prior entity, or remove it if the change was a
  fresh optimistic create). Drops straight into
  `OptimisticUpdateManager.apply()`'s `rollback` field — existing hand-written
  closures keep working unchanged.

### Changed

- **`createAuditTracker`/`createAuditCallback` (+ `AuditEntry`/`AuditMetadata`/
  `AuditTrackerConfig` types) moved from `@signaltree/ng-forms` to
  `@signaltree/core`.** They never depended on `@angular/forms` — only on
  `@signaltree/shared`'s `getChanges` and the core tree type — so they're a
  within-tree mechanic per RFC 0007, not a forms concern. Import from
  `@signaltree/core`. The old `@signaltree/ng-forms/audit` path still
  re-exports them as a `@deprecated` back-compat shim.
- **`OptimisticUpdateManager` (`@signaltree/events/angular`) is now O(n)**
  instead of O(n²) for a burst of N pending updates — it mutates a private
  `Map` in place and bumps a `signal<number>` version counter instead of
  cloning the whole pending-updates `Map` on every apply/confirm/rollback.
  Public API unchanged.

### Deprecated

- **`withFormHistory` (`@signaltree/ng-forms`)** — scoped to the legacy
  `createFormTree` (`FormGroup`) substrate; structurally cannot attach to a
  `signalForm()` `FieldTree`. Use `form({ history: history({ capacity,
exclude }) })` from `@signaltree/core` instead. Retained (not removed) for
  `createFormTree` users; will be removed with the legacy `FormGroup` bridge.
- **`createWizardForm` (`@signaltree/ng-forms`)** — built on `createFormTree`,
  with no `signalForm()` bridge. Use the `form()` marker's built-in `wizard`
  config (`{ steps, stepConfig: { name: { validate, canSkip } }, stepFields }`,
  navigate via `tree.$.myForm.wizard!.next()`/`.prev()`/`.goTo()`), which is
  `signalForm()`-compatible.

### Docs

- New RFC: [`docs/rfcs/0007-packaging-principle-and-ng-forms-reslice.md`](docs/rfcs/0007-packaging-principle-and-ng-forms-reslice.md)
  — the governing packaging principle (independent dependency/runtime → own
  package; within-tree mechanic → core) and the measured classification that
  drove the `history`/`audit` moves.
- New guide: [`docs/guides/migration-v12-v13.md`](docs/guides/migration-v12-v13.md).

All packages bumped to **13.0.0** (`@signaltree/shared` was at 9.2.2; now
aligned with the rest of the workspace).

## 12.1.0 (2026-07-24)

### Added

- **`status().idle()` + `status().settled()` — the standard composite predicates.**
  `idle` is `!loading() && !loaded()`, so it is true for **both** `NotLoaded`
  and `Error`. Guards/resolvers should use `idle()`, not `notLoaded()`:
  `notLoaded()` is strictly `state === NotLoaded`, so a `notLoaded()`-gated
  fetch **silently never retries after an error** (the collection is in the
  distinct `Error` state). Also steers off `state() === LoadingState.X`
  enum comparisons (a codegen hallucination magnet). `settled()` is
  `loaded() || hasError()` ("done, stop the spinner"); note `idle` and
  `settled` deliberately overlap in the Error state (errored = done AND
  retryable). This is the closed standard set — bespoke composites use
  `.derived()`, different state machines use a custom marker (RFC 0006).
  Both added to the readonly view's `STATUS_READERS`.

- **`persist.maxScopes` — persisted-scope garbage collection** for scoped
  cache-aware collections (`entityMap({ load: loader(fn, { persist }) })`).
  Each scope persists under its own storage key
  (`key::<stableStringify(params)>`), so high-cardinality scopes (tenants,
  customers, searches) previously accumulated entries forever — the
  feature-level gap flagged by two external audits. With `maxScopes` set, the
  loader keeps a touch-ordered index under `key::__scopes` and, on each
  successful write-through, evicts the least-recently written scope entries
  beyond the cap (best-effort, like write-through itself — adapter failures
  never break the load path; a pruned scope just misses hydration and loads
  fresh). Unset = previous behavior (no GC; the app owns cleanup — see the
  persistence guide's "Persisted-scope cleanup"). Storage GC only: the
  in-memory cache stays single-scope; multi-scope LRU caching remains
  deferred (RFC 0003 §5). A non-positive-integer `maxScopes` fails closed at
  the `loader()` call site (dev).

### Changed

- **`signalForm()` emits a one-time dev-mode advisory when `nativeErrors` is
  left unset**, noting the default is `false` in 12.x and flips to `true` in
  v13 — set it explicitly to pin either error shape now. Explicitly setting
  either value silences it. Advisory only (`console.info`); no behavior
  change. The v13 default flip is documented at every promise site.

### Release engineering

Release-pipeline hardening — closes the bypass routes two external audits
confirmed (RFC 0004, v12 audit intake):

- `release.sh skip-tests` no longer bypasses validation: it sets
  `FAST_VALIDATE=1`, which skips only the slow steps (unit tests, coverage,
  benchmarks) with a loud banner; every correctness gate (builds, barrel +
  export parity, tarball-consumer, taught-symbols, version-claims,
  guardrails-exports, size, release-state) still runs and still blocks.
- `npm run publish:all` now runs the full `npm run validate` suite before
  publishing (was the lighter `prepublish`).
- The guardrails conditional-exports gate now also runs in
  `pre-publish-validation.sh` (was CI-only).
- `release.yml` verifies the exact tagged commit (full gate set incl. the
  tarball-consumer and changelog gates) before creating a GitHub release.
- New `publish.yml` + `scripts/ci-publish.sh`: the sanctioned publish path is
  now CI — reruns the full gate set against the tag, then publishes all
  packages with `NPM_TOKEN` and provenance. `release.sh` remains for
  emergencies. See `docs/guides/releasing.md`.
- New demo route-smoke job in `validate.yml`: Playwright visits 8 key demo
  routes against a static production build and fails on any console error or
  missing h1/main (`npm run smoke:routes` locally).

## 12.0.0 (2026-07-23)

> **Correction (2026-07-24, post-release):** 11.6.0 announced the
> `nativeErrors` default would flip to `true` in this major; v12 shipped with
> it still `false`. The flip is explicitly postponed to **v13** — set the
> option explicitly if you depend on either error shape. (Caught by an
> external post-release audit.)

> The first "earned major" under RFC 0004 §3 V-MAJOR: a major exists to carry
> accumulated deliberate breakage with a concrete user-visible payload. This
> one's payload is the entityMap loader tree-shake reclaim (RFC 0005 §6).

### Breaking

- **`entityMap({ load })` now requires the `loader()` helper.** The raw
  `entityMap({ load: () => api.list$(), staleTime, swr, tags, … })` form is
  removed. Wrap the fetch and move the loader-family options into `loader()`:

  ```ts
  // before (11.x)
  entityMap<Plant, string>({ selectId, load: () => api.list$(), staleTime: '30m', tags: ['plants'] });
  // after (12.0)
  import { entityMap, loader } from '@signaltree/core';
  entityMap<Plant, string>({ selectId, load: loader(() => api.list$(), { staleTime: '30m', tags: ['plants'] }) });
  ```

  `selectId`/`sortComparer` stay on the `entityMap` config; `staleTime`/`swr`/
  `tags`/`persist`/`equal`/`lazy`/`clearOnParamsChange` move into `loader()`'s
  second argument. A raw function on `load` now **fails closed** at
  construction with a coded error ([ST2004]) — it can never silently no-op.

- **`signalForm()` fails closed on a marker with `asyncValidators`
  (`@signaltree/ng-forms`).** Bridging a `form()` marker that carries
  `asyncValidators` into Signal Forms now **throws** (`[ST2005]`) instead of
  emitting a one-time dev warning. The marker's async path and Signal Forms'
  `validateAsync`/`validateHttp` are two independent authorities that would
  disagree during any async window; the caller must pick one (Signal Forms on
  the returned FieldTree, or the marker's own unbridged `validateField()`/
  `submit()`). Sync validators remain fully unified.

### Added

- **`loader(fn, options?)` (`@signaltree/core`)** — the tree-shakeable way to
  make an `entityMap` cache-aware. Exact `security()` precedent: the returned
  branded `LoaderFeature` is the _only_ module-level reference to the loader
  machinery (`attachLoader`), so importing `entityMap` without `loader` shakes
  the loader/cache/SWR/persist code out entirely. `LoaderFeature`/`LoaderOptions`
  are the public types.

### Removed (deprecation backlog cleared — "earned major")

All public APIs previously marked `@deprecated … removed next major` are gone.
Migration guide: [`docs/guides/migration-v11-v12.md`](docs/guides/migration-v11-v12.md).

- **`effects()` enhancer** (`@signaltree/core`) — use Angular's native
  `effect(() => tree.$.path())`. The legacy global batching helpers
  `flushBatchedUpdates()` / `hasPendingUpdates()` / `getBatchQueueSize()` are
  also gone (use the tree's `flushNotifications()` / `hasPendingNotifications()`).
- **Legacy `with*` enhancer aliases** — `withBatching`, `withDevTools`,
  `withSerialization`, `withPersistence` (core), `withEnterprise`,
  `withGuardrails` (packages), and `createRealtimeEnhancer` (realtime). Use the
  canonical `batching()` / `devTools()` / `serialization()` / `persistence()` /
  `enterprise()` / `guardrails()` / `realtime()`.
- **Enhancer/marker-author plumbing removed from the `@signaltree/core` root
  barrel** — `withWriteContext`, `getActiveWriteContext`, `interceptLeafSignals`,
  `getPathNotifier`, `registerMarkerProcessor`, `composeEnhancers`,
  `createEnhancer`, `resolveEnhancerOrder`, `ENHANCER_META`, `EnhancerMeta`.
  All still available from **`@signaltree/core/authoring`**.
- **`@signaltree/ng-forms`** — `markerSignalForm` / `signalFormBridge` aliases
  (use `signalForm()`), the bare `required`/`email`/`min`/… validator exports
  (use `ngFormValidators.*`), and the guardrails `createFormTree` alias (use
  `createGuardedFormTree`).

### Internal

- **Canonical `visitTree` traversal skeleton.** The two walkers that wrap leaf
  `.set`/`.update` — `interceptLeafSignals` (devtools/time-travel/schema) and
  batching's `wrapSignalSetters` — now share one `visitTree(root, visitor,
{ maxDepth, skipKey })` helper instead of each re-implementing the
  `isTraversableNode` guard + `Object.keys` + cycle-guard + depth-cap + recurse
  boilerplate. No behavior change (walker-conformance suite + the
  `[ST2002]`-asserting entity-method-guard spec both green; `skipKey` preserves
  the entityMap-proxy get-trap avoidance). The remaining walkers were left as-is
  on purpose: the live-`$`-tree ones (`invalidateTag`, serialization's
  `walkAlias`) each carry bespoke proxy-safe access, and the dual-structure
  "zip" walkers (`recursiveUpdate`, `updateSignals`, `mergeDerivedState`) plus
  the path-cursors are genuinely distinct algorithm families — forcing them
  through one skeleton would distort load-bearing (and hot-path) code for a
  maintainability-only gain.

### Changed

- **Plain `entityMap()` is ~1.5 KB gzip smaller.** `entity-map.ts` no longer
  statically imports `attachLoader`; a collection that never uses `loader()`
  no longer pays for the loader machinery. Measured: the `entityMap`-using
  bundle dropped **9.89 KB → 8.36 KB** gzip (own-code, `@angular`/`rxjs`/`tslib`
  external). The bundle-budget gate's `signaltree-entities` target was lowered
  9.9 → 8.6 KB to lock the reclaim in.

## 11.6.0 (2026-07-23)

> Published 2026-07-23 (owner-recorded §5 cooling override). The first release to pass the full gate pipeline: every change below
> went design-review → implement → adversarial review → fix before landing,
> and the release was measured by the M3 fresh-agent acceptance test
> (80% strict first-attempt success against the llms docs, up from ~0%
> baseline; RFC 0004 §7).

### Added

- **`signalForm()` (`@signaltree/ng-forms/signals`)** — one name for the
  Angular Signal Forms bridge, with two overloads: `signalForm(marker,
options?)` for `form()` markers and `signalForm(tree, rootPath, subtree)`
  for schema-registry trees. `markerSignalForm`/`signalFormBridge` remain as
  deprecated warned aliases (removal next major); `SignalFormOptions` is the
  canonical options type.
- **`nativeErrors` option on the Signal Forms bridge** — built-in validator
  failures emit Angular's branded error factories (`requiredError`,
  `minError`, `patternError`, …), so `instanceof NgValidationError` and typed
  `getError()` genuinely work. Default `false` (additive); the default flips
  in the next major.
- **`asReadonly(tree)` / `ReadonlyStore`** — type-only read-only views over
  the tree's accumulated type: leaf `.set`/`.update` and every marker mutator
  (`upsertOne`, `setLoading`, loader triggers, …) are genuinely absent from
  the type; derived computeds survive, including derived state deep-merged
  into marker nodes; `byId` re-signed as deep-readonly. `defineStore(factory,
{ expose: 'readonly' })` is honest sugar over the same type — misuse on a
  non-builder factory is a compile error, never a silent no-op.
- **`withKind()`** — tag custom validators with a semantic kind for the
  Signal Forms bridge (wraps, never mutates); `validators.when()` now
  forwards the wrapped validator's kind and constraint params.
- **`entityMap` loader: `loadOrThrow(params?)`** — same guard as `load()`,
  but rejects with the loader's error for imperative `await`/`try-catch` call
  sites (`load()` never rejects). There is deliberately no `refreshOrThrow`
  (see the cookbook's imperative error-handling recipe).
- **Export-parity barrel gate** — `tools/verify-built-barrels.mjs` now also
  compares each built `dist/index.js` barrel's export names against its
  source `src/index.ts` barrel (esbuild metafile on both sides) and fails
  with the exact missing/extra names. The resolution-only smoke let the
  three stale stub barrels (realtime/ng-forms/guardrails, below) pass —
  they resolved fine while missing exports. Negative-tested (hand-dropping
  an export from a dist barrel fails the gate); wired where the gate
  already ran: pre-publish step 7b and `validate.yml`.
- **`@signaltree/core/authoring` subpath** — enhancer/marker-author plumbing
  moved off the root barrel (`withWriteContext`, `getActiveWriteContext`,
  `interceptLeafSignals`, `getPathNotifier`, `registerMarkerProcessor`,
  `createEnhancer`, `resolveEnhancerOrder`, `composeEnhancers`,
  `ENHANCER_META`/`EnhancerMeta`, and the `createFormSignal`/
  `createAsyncSourceSignal`/`createAsyncQuerySignal` factories), leaving a
  root barrel teachable end-to-end. Root re-exports remain for one minor as
  deprecated aliases (the three zero-consumer `create*Signal` factories are
  authoring-only and were removed from the root outright). Internally, the
  serialization enhancer's storage adapters also split into their own module
  so `@signaltree/core/storage` no longer enters through the 1300-line
  enhancer file (public surface unchanged).

### Removed

- **`externalDerived`** — deprecated alias of `derivedFrom` whose JSDoc
  promised removal in v8; use `derivedFrom`.
- **`enhancers/entities/` tombstone** — unexported v7-era source that only
  threw "entities() has been removed"; `entityMap` markers have been
  auto-processed since v7.
- **`core/src/lib/dev-proxy.ts`** — `wrapWithDevProxy`/`shouldUseDevProxy`
  had zero consumers and no barrel export (the "helpful missing-method
  hints" it promised never fired anywhere); dead code deleted.

### Deprecated

- **`effects()`** — use Angular's native `effect(() => tree.$.path())`
  instead (the README's own guidance); removal next major. Known limitation,
  documented rather than fixed: `tree.effect()`/`tree.subscribe()` call
  `effect()` with no injector handling and throw NG0203 outside injection
  contexts. One-time dev-mode warning on use.

### Fixed

- **`@signaltree/realtime`'s main barrel had NEVER actually built** — nx's
  rollup input map keys entries by basename, so the `supabase/index.ts`
  additional entry silently overwrote the main `src/index.ts` entry; a
  local rollup plugin papered over it by fabricating `dist/index.js` from a
  hardcoded export list, so every published version shipped a stale stub
  (and would have silently resurrected removed APIs forever). Input keys
  are now unique (root-fixed in the shared rollup config for all three
  affected packages), the fabrication plugins are deleted — ng-forms'
  published barrel had been missing `ngFormValidators` while its own d.ts
  declared it — and CI runs the barrel gate.

- **`@signaltree/enterprise`: built-in leaf replacement was silently
  inert** — DiffEngine recursed into `Date`/`Map`/`Set` leaves as empty
  objects and `isEqual`'s JSON.stringify fallback saw every Map/Set as
  `{}`, so `updateOptimized` reported `changed: true` while dropping the
  write. Built-ins now diff and compare as the atomic leaves core
  materializes them as; Map/Set/Date regression tests added.
- **`SignalTreeBuilder` type omitted `destroyed`/`registerCleanup`** — both
  exist at runtime on every `signalTree()` return and were documented, but
  doc-faithful code failed to compile (found by M3 run 2).
- **When-wrapped built-in validators now bridge their real kind** — a
  `validators.when(cond, validators.required())` field reports
  `kind: 'required'` instead of the generic `'signalTree'`. Breaking only
  for consumers matching `kind === 'signalTree'` on when-wrapped fields
  (bridge was public for two days in 11.5.x).
- **rxjs is now a type-only dependency of the entityMap loader**
  (`takeUntilDestroyed` was redundant with the loader's own `onDestroy`
  teardown — now pinned by destroy-path tests for both Observable and
  Promise loaders, mutation-verified).
- **ng-forms legacy-bridge dev warning** no longer claims removal "in v6.0"
  (five majors ago).
- **`@signaltree/guardrails` reporting was largely dead** — three defects,
  each pinned by a mutation-verified spec: (1) `reporting.console: false`
  early-returned out of the report cycle, silencing `customReporter` too —
  the custom channel now fires regardless of the console setting; (2)
  console reporting gated on a `context.issues` array nothing ever populated
  (issues live in `issueMap`), so `reportToConsole` was unreachable — the
  gate now reads the issueMap-derived report; (3) `mode: 'throw'` violations
  from custom rules were swallowed by `evaluateRule`'s rule-error safety net
  and degraded to a `console.warn` — deliberate guardrails throws are now
  branded and rethrown past that catch (async rules surface as unhandled
  rejections). Also: with no reporting channel configured, issues are no
  longer silently cleared every interval — they accumulate for `getReport()`.
- **Plain-object trees are change-blind under guardrails' default
  PathNotifier strategy** (it only fires for entity collections, or leaf
  writes when devtools' interceptor is attached) — now surfaced honestly:
  a one-time dev warning when the strategy is selected, plus README/JSDoc
  guidance to force polling via `changeDetection: { disablePathNotifier:
true }`. Automatic fallback was rejected: entity nodes hide behind the
  lazy proxy tree and devtools may attach after guardrails, so attach-time
  detection is unreliable in both directions.

### Documentation & tooling

- **The Signal Forms story now exists on every AI-facing surface**
  (llms.txt, llms-full.txt, SKILL.md) — previously zero mentions, while the
  docs simultaneously taught three phantom APIs (`asyncStream` root import,
  `bindToFormGroup`, `createIndexedDBAdapter` at root — all resolved; the
  persist example now compiles as taught, from `@signaltree/core/storage`).
- **Verified-docs gates** wired as blocking pre-publish sections, each with
  a self-test proving it can fail: taught-symbols reverse diff + 30-symbol
  golden list, Angular-version-claims check, CHANGELOG-entry gate (this
  entry exists because the gate refused to release without it).
  `validate:doc-snippets` deleted (validated nothing for three months);
  `validate:size-claims` wired blocking after refreshing 8-month-stale
  claims to measured values.
- **One loader vocabulary**: "cache-aware (single-scope)" everywhere, with
  the A→B→A refetch clarifier; the tree-shaking claim on the loader module
  corrected to the measured truth (~1.5 KB min+gzip ships with `entityMap`
  regardless of `load`; RFC 0005 §6 keeps the shape and archives the
  injected-helper split as the fallback design).
- **Walker-conformance suites** across core/enterprise/schema/ng-forms
  (deep callable-branch fixtures with markers and built-in leaves) plus an
  ESLint AST rule replacing the inert grep script — the fixture family whose
  absence hid the entire v11.4/11.5 inert-walker bug class.
- NgRx comparison claims re-stamped to the actually benchmarked
  `@ngrx/signals` 21.1.

## 11.5.2 / 11.5.3 (2026-07-22)

> Second sweep of the bug classes found in 11.5.0/11.5.1 — this time across
> every package, with browser-interaction coverage of all 43 demo routes.

### Fixed

- **`@signaltree/enterprise`: `updateOptimized()` was inert-or-destructive for nested state** — two instances of the same walker defect fixed in batching (11.5.0): `PathIndex.buildFromTree` and `applyPatch`'s fallback both rejected callable nodes, but SignalTree NodeAccessors are functions, so nothing below the root was ever indexed and nested patches either silently no-oped or — worse — plain-assigned an object OVER the branch accessor, destroying the accessor tree (`tree.$.profile.name` stopped being a function). Nested object patches are now distributed into leaf signals (`isSignal` leaves set through the signal; branch accessors are never replaced). Existing specs only exercised flat state or hand-built plain-object fixtures, which is why CI never caught it; a nested-real-tree regression spec now pins values, accessors, and indexing.
- **`asyncStream` marker: NG0600 on materialization** — the experimental (unexported) stream marker auto-started synchronously in its factory, writing loading/data/error signals mid-materialization; auto-start is now microtask-deferred like `asyncSource` and `entityMap`.
- **`form({ persist })`: latent NG0600 for returning users** — storage hydration did a synchronous `valuesSignal.set()` in the factory, guarded by `if (stored)` — invisible to every fresh-browser test (empty storage skips the write), but a returning user with a saved draft whose form materializes during render would throw. Hydration now happens through the signal's initial value (pure read).
- **Demo: NG0203 in the legacy signal-forms example's manual-sync fallback** — two `effect()` calls in a plain method now pass the component's injector.
- **Demo: serialization Copy button** no longer logs an unhandled error when clipboard permission is denied; it reports "Clipboard unavailable" instead.

### Audit coverage notes

- Interactive browser sweep: all 43 routes loaded and every visible button clicked against the production build — no handler crashes, no blank controls, no rendering artifacts (remaining "undefined" text hits are TypeScript code samples in docs).
- Walker sweep verdicts (correct as-is): materialize-markers, intercept-leaf-signals, utils unwrap/applyState, signal-tree recursiveUpdate, lazy-tree, merge-derived, form-bridge; NG0600-safe markers: stored, status, asyncSource, entityMap loader.

## 11.5.2 (2026-07-22)

> Audit round 2: hunting the two bug CLASSES behind 11.5.1's finds
> (accessor-walks that skip callable nodes; signal writes during lazy marker
> materialization) surfaced three more real bugs — two of which made
> `@signaltree/enterprise`'s headline feature silently inert for nested state.

### Fixed

- **`@signaltree/enterprise` was inert for nested state** — three walkers in the diff/patch pipeline gated on `typeof === 'object'`, but SignalTree NodeAccessors are callable: `PathIndex.buildFromTree` bailed at every nested namespace (nothing below the root was ever indexed), `applyPatch`'s fallback navigation returned `false` for any nested path (silent no-op), and `DiffEngine.traverse` treated accessor-vs-object as a whole-subtree REPLACE. `updateOptimized()` on nested paths now applies correctly, writes through leaf signals so reactivity fires, and reports granular `changedPaths` (`['profile.name']`, not `['profile']`). Existing specs never caught this because they used flat state or hand-built plain-object fixtures — new regression specs run the real pipeline against nested `signalTree` state.
- **`asyncStream` auto-start deferred off materialization** (`@signaltree/core`, unpublished marker) — `start()` wrote loading/data/error signals synchronously in the factory; markers materialize during template rendering, so template-first access would throw NG0600. Now `queueMicrotask`-deferred like `asyncSource` and `entityMap`. (The marker is intentionally not exported yet — zero published exposure.)
- **`form({ persist })` returning-user NG0600 landmine** (`@signaltree/core`) — storage hydration was a synchronous `valuesSignal.set()` in the factory, guarded by "storage has data": invisible to every fresh-browser test, but a returning user with a persisted draft whose form materializes during render would throw NG0600. Hydration now happens through the signal's initial value (pure read).
- **Demo: serialization Copy button** now handles clipboard permission rejection instead of logging an unhandled error.

### Audit trail

Swept all packages for both classes: `materialize-markers`, `intercept-leaf-signals`, `utils`, `signal-tree`, `lazy-tree`, `merge-derived`, `form-bridge`, guardrails, events, and ng-forms walkers verified correct (they check for callables or walk plain state); `stored`/`status`/`asyncSource`/`entityMap` materialization verified write-free or deferred; all demo `effect()` calls verified in injection contexts. Interactive browser sweep: all 43 routes, every visible button clicked, zero errors.

## 11.5.1 (2026-07-22)

### Fixed

- **`form()` marker: NG0600 on first render** (`@signaltree/core`) — 11.4.1's validate-on-write seeded validation with a signal WRITE inside the marker factory, and markers materialize lazily — often during template rendering — so the first render of a page using `form()` threw `NG0600: Writing to signals is not allowed while Angular renders` and every binding after the throw stayed blank (live on /form-marker: empty Form State panel, blank submit button). `errors`/`valid`/`errorList` are now COMPUTED over the values signal: no write hooks anywhere, validity live through every write path (including FieldTree edits via `markerSignalForm` — its sync-back effect is gone), and cross-field rules re-evaluate when any sibling changes. Async validator results merge in while the checked value is unchanged, so they self-invalidate on edit.
- **`validators.pattern` no longer flags empty values** — emptiness is `required()`'s job (matches Angular semantics and the 11.4.1 email fix); an optional phone field with a pattern no longer errors when blank.
- **Browser-rendered regression specs** for /form-marker and /marker-zoo (the NG0600 class is invisible to build/typecheck and to specs that never render the page), plus a full 43-route console-error sweep against the production build in CI-verifiable form.

## 11.5.0 (2026-07-21)

> Angular 22 + real Signal Forms support. The workspace now builds against
> Angular 22.0.7 (stable Signal Forms), the `@signaltree/ng-forms/signals`
> bridge compiles against the real `@angular/forms/signals` API instead of
> hand-written shims, and a new `markerSignalForm()` turns a `form()` marker
> into a Signal Forms `FieldTree` with one shared model. Also fixes a
> long-standing core bug: `batch()`/`coalesce()` write interception was
> silently inert.

### Added

- **`markerSignalForm()`** (`@signaltree/ng-forms/signals`, Angular 22+) — turn a core `form()` marker into an Angular Signal Forms `FieldTree` whose model IS the marker's values signal: one source of truth, edits through either API immediately visible to the other, no copying or sync loops. The marker's sync validators run as Signal Forms validators (field errors carry `kind: 'signalTree'`); cross-field rules (`validators.when`) re-run when sibling fields change; the marker's own `errors()`/`valid()` stay live for FieldTree-side writes. Async marker validators remain explicit (`validate()`/`submit()`, or register Signal Forms `validateAsync` rules). Bind with `<input [formField]="profile.name" />`.
- **`/signal-forms` demo page** — both bridges live: `markerSignalForm` (marker ↔ FieldTree, dual validity badges proving the shared model) and `signalFormBridge` (Zod schemas registered via `@signaltree/schema` auto-applied with `validateStandardSchema`).

### Fixed

- **`batch()`/`coalesce()` write interception was inert** (`@signaltree/core`) — the batching enhancer's setter-wrapping walk rejected callable nodes, but SignalTree NodeAccessors and leaf signals are functions, so no leaf setter was ever wrapped: `coalesce()` applied every same-path write instead of deduplicating to the final value, and per-write notification scheduling never engaged. The walk now descends into callable accessors; regression specs assert 100 coalesced writes → 1 applied write (top-level and nested).
- **`@signaltree/ng-forms/signals` compiles against the stable API** — the ambient `@angular/forms/signals` shim is gone; the bridge is typed against the real `FieldTree`/`validateStandardSchema` and returns `FieldTree<TModel>`. `signalFormBridge`/`applySignalTreeSchemas` accept any tree carrying `SchemaMethods` (the previous `ISignalTree<unknown> &` intersection rejected `.with(schemas())` builder types).

### Changed

- **Workspace on Angular 22.0.7 / TypeScript 6.0 / Nx 23.1** (vitest 4, jest 30, zone.js 0.16). Package peer ranges already allowed `^22`; published output is now actually compiled against it. Package tsconfigs moved from `moduleResolution: node` to `bundler` (node10 resolution cannot see `exports` maps — the reason the shim existed).
- **Demo app on built-in control flow** — `*ngIf`/`*ngFor` migrated to `@if`/`@for` via the official schematic; components that relied on the old implicit change-detection default carry an explicit behavior-preserving `ChangeDetectionStrategy.Eager`.
- **entities bundle floor documented as accepted** — measurement shows `entity-loader` is ~1.1KB gzip of the 9.67KB entities fixture; RFC 0003 deliberately traded that floor for the one-marker DX, and statically tree-shaking a config-driven branch is impossible. The 9.9KB budget stands; a sync-stub + dynamic-import split is possible follow-up if the floor ever outweighs the DX.

## 11.4.1 (2026-07-21)

> Patch release driven by the 2026-07 outside-auditor site/product audit: the
> `form()` marker now actually validates as you type, guardrails can be opted
> into production demos, the formBridge carries marker validators into the
> FormGroup, and signaltree.io deep links return HTTP 200.

### Fixed

- **`form()` marker — live validation** (`@signaltree/core`) — sync validators now run on init and on every write (`set`, `patch`, field `.set()`/`.update()`), so `valid` is live instead of "valid until proven invalid". Previously `errors` started `{}` and nothing ran validators until an explicit `validate()`/`submit()`, so an empty form with `required` validators — or a garbage email — reported `valid() === true` (visible on /marker-zoo and /form-marker). `reset()`/`clear()`/`reload()` re-validate instead of wiping errors; `clear()` also resets `touched`. Async validators still run via `validate()`/`validateField()`/`submit()` only.
- **`validators.when` was dead code** (`@signaltree/core`) — validators now receive the form's current values as a second argument, so cross-field rules (`validators.when(cond, …)`) actually fire. `Validator<T>` is now `(value, formValues?) => string | null` — backward compatible.
- **`validators.email` consistency** — the core email validator no longer flags empty values (emptiness is `required()`'s job, matching Angular semantics), and the ng-forms `email()` validator now uses the same `local@domain.tld` rule as core instead of only checking for an `@`.
- **formBridge parity** (`@signaltree/ng-forms`) — the `form()` marker's own validators are now mirrored onto the bridged FormGroup's controls (errors surface as `{ signalTree: '<message>' }`), so `formGroup.valid` agrees with `formSignal.valid()`. Signal-side writes (`patch`/`set`) now propagate to the FormGroup reactively when an injection context (or `config.injector`) is available — previously the FormSignal → FormGroup sync only happened once at creation.
- **`guardrails()` explicit opt-in for production** (`@signaltree/guardrails`) — an explicit `enabled: true` now overrides the dev-only environment check (demos, staging diagnostics); the default remains dev-only with zero production cost, and `enabled: false` disables everywhere. Fixes the /guardrails demo page rendering no controls in production builds.
- **Demo: /batching/compare crashed with NG0203** — `effect()` was created in a click handler outside an injection context. The comparison now runs with an explicit injector, destroys its effects after measuring, and reports honest metrics: elapsed time, writes applied to the underlying signal (N unbatched vs 1 with `coalesce()`), and effect runs (similar in both modes, since Angular coalesces synchronous writes natively — the copy now says so).
- **signaltree.io deep links returned HTTP 404** — GitHub Pages' `404.html` SPA fallback renders but poisons SEO/AI crawlers with 404 statuses. The deploy now generates a real `<route>/index.html` shell for every static route (41 routes → HTTP 200), keeping `404.html` only as the wildcard fallback (`scripts/generate-spa-route-shells.mjs`).
- **Demo accessibility/SEO** — nine routed demo pages had no `<h1>` (the shared example shell always rendered `<h2>`); the shell gains a `headingLevel` input and routed pages promote their heading to `<h1>`. The /marker-zoo form gates error display on `touched` (wired to blur) so the now-live validation doesn't shout at pristine forms.

## 11.4.0 (2026-07-20)

> `entityMap` gains cache-aware loading (`load`/`staleTime`/`equal`/`params`/`persist`/`tags`)
>
> - NG0600-safe deferred auto-load; the short-lived 11.3.0 `entityCollection` marker is
>   folded into `entityMap` (removed as a separate marker, not renamed). Its keyed design also
>   supersedes the 11.3.0 `key`/`currentKey`/`clearOnKeyChange` shape, corrected same day —
>   there is no separately-published 11.3.0 to preserve compatibility with. See RFC 0003 §0 in
>   [docs/rfcs/0003-keyed-entity-collection.md](docs/rfcs/0003-keyed-entity-collection.md)
>   for the full rationale.

### Added

- **`entityCollection` folded into `entityMap`** (`@signaltree/core`, [RFC 0003](docs/rfcs/0003-keyed-entity-collection.md)) — cache-aware loading is no longer a separate marker. Pass `load` in `entityMap`'s config and the collection gains the loader surface (`.load()`, `.refresh()`, `.invalidate()`, `.loading()`, `.loaded()`, `.error()`, `.lastLoadedAt()`, `.params()`); `entityMap<E, K>()` without `load` is unchanged. A separate marker didn't earn its keep — any real app has server-backed entity data, so it would import the loader surface anyway, and two markers just added a "which one?" decision. There is nothing new to import; `entityCollection` no longer exists.
- **Scoped `entityMap<E, K, P>`** (`@signaltree/core`, [RFC 0003](docs/rfcs/0003-keyed-entity-collection.md)) — `entityMap`'s cache-aware loading gains an optional `equal: (a: P, b: P) => boolean` option that parameterizes the collection by a scope (region, customer, tenant, …): a loader that declares a parameter (`load: (params) => …`) makes the collection scoped, freshness (`staleTime`) is evaluated per-scope via `equal` (default: structural value comparison), a scope change refetches and replaces the entities, and `params: Signal<P | undefined>`/`refresh(params?)`/`clearOnParamsChange` round out the surface. Before: consumers hand-wired a scope-key guard (a ref of "current region" plus manual clear/refetch on change) around every scoped `entityMap`; after, the marker does it — same-scope-fresh is a no-op, same-scope-concurrent is single-flight, and a different scope while in-flight supersedes (last-request-wins) instead of racing. `persist` now writes through per-scope storage keys. 100% backward compatible — the parameterless (global) form is unchanged. See the [core changelog](packages/core/CHANGELOG.md).
- **NG0600 fix — deferred auto-load** (`@signaltree/core`) — a non-lazy cache-aware `entityMap`'s initial auto-load and offline-first `persist` seed, and `asyncSource`'s initial auto-load, are now deferred to a microtask instead of running synchronously during marker materialization. Reading a non-lazy collection or `asyncSource` first inside a template no longer throws `NG0600: Writing to signals is not allowed while Angular renders`. Auto-load is now asynchronous — data arrives on the next microtask rather than during construction. See the [core changelog](packages/core/CHANGELOG.md).

### Compatibility

- **Angular 22 peer support** — `@angular/*` peer ranges widened to `^20 || ^21 || ^22` across all `@signaltree/*` packages. Signals APIs are stable across these majors; no code change.

## 11.2.0

### Added

- **`entityCollection<E, K>(config)` marker + `invalidateTag(tree, tag)`** (`@signaltree/core`, [RFC 0002](docs/rfcs/0002-entity-collection.md)) — a cache-aware entity-collection loader. Composes the full `entityMap` surface with a loader, load status, a `staleTime` freshness guard, single-flight dedup, tag-based invalidation, and optional offline-first persistence (`persist` reuses the existing `StorageAdapter`/`createIndexedDBAdapter`, with `hydrateThenRevalidate` for SWR). Deletes the per-consumer `entityMap` + `status` + loader + load-guard boilerplate that the v3 audit flagged as the source of redundant fetches. `.load()` is guarded (no-op if fresh or in-flight → concurrent callers coalesce to one fetch); `.refresh()` forces; `.invalidate()`/`invalidateTag()` mark stale (the push-invalidation seam for SSE/SignalR). Additive and backward-compatible — no migration. See the [cookbook](docs/guides/entity-collection-cookbook.md) and [core changelog](packages/core/CHANGELOG.md).

## 11.0.0

### Breaking

- **`security` config must be wrapped with `security()`** from `@signaltree/core/security`. The raw `SecurityValidatorConfig` kept `SecurityValidator` statically reachable, so it shipped in every bundle; it is now injected and tree-shakeable. Behavior and timing are unchanged — only the wrapper + import path differ. See [MIGRATION.md §11.0.0](docs/guides/MIGRATION.md#1100). TypeScript flags every call site (option type `SecurityValidatorConfig` → `SecurityFeature`).
- **Lazy signals are opt-in via `lazy()`** from `@signaltree/core/lazy`. Lazy mode no longer switches on automatically — `signalTree()` statically imported the lazy Proxy + `SignalMemoryManager` to do that (~2.6KB in every bundle). Inject `lazy: lazy()` to restore the auto-threshold/`useLazySignals` behavior; without it, trees are always eager (functionally identical reads/writes). See [MIGRATION.md §11.0.0](docs/guides/MIGRATION.md#1100).
- **Removed deprecated aliases** (deprecated since v10.3/v10): the `is`-prefix status predicates (`isLoading`/`isLoaded`/`isError`/`isNotLoaded`) → use bare `loading`/`loaded`/`hasError`/`notLoaded`; `entityMap().isEmpty` → `.empty`; and **`tree.state` → `tree.$`** (`state` was always an alias for `$`, same reference). All mechanical; TypeScript flags every site. See [MIGRATION.md §11.0.0](docs/guides/MIGRATION.md#1100).

### Changed

- **Bundle floor reduced ~29%** — injecting `SecurityValidator` + the lazy/memory machinery (and routing status/stored marker detection through the registry) drops the bare-tree floor 7.5KB → ~5.3KB gzip (~8.1KB with `entityMap` in use; own code, `@angular`/`rxjs`/`tslib` external).
- **`devTools()` fully prod-stripped** — the heavy implementation moved to `devtools-impl.ts`, selected at module level by an `ngDevMode`-foldable ternary. In a production build (`ngDevMode` false) esbuild folds the selection to a noop and the entire impl module tree-shakes out: a tree using `.with(devTools())` drops from ~11.3KB → **5.06KB gzip** (devtools-impl entirely gone). Dev builds keep full devtools. All wrapper factories funnel through the shell.
- **Honest bundle positioning** — corrected the false "smaller than NgRx SignalStore (~12KB)" claim (SignalStore is ~2.3KB; SignalTree is larger). `llms.txt`, `llms-full.txt`, and the benchmark now carry measured gzip numbers and frame bundle as capability-per-KB + zero-deps.

### Added

- **`linked(...)`** — derived-but-writable signal (comparable to NgRx SignalStore's `withLinkedState`). Wraps Angular's native `linkedSignal`: a value computed from a source that is also directly writable and re-derives when the source changes (e.g. "sticky selection"). Use inside `.derived($ => ({ selected: linked({ source: () => $.options(), computation: (opts, prev) => ... }) }))`, or the simple form `linked(() => $.count() * 2)`. Merges in as a real `WritableSignal` — `$.selected.set(...)` type-checks (the `ProcessDerived` type now preserves `WritableSignal`). Composes natively with serialization/persistence/snapshot.
- **`defineStore(factory, config?)`** — wraps a `signalTree(...)` factory in an injectable Angular service class (the idiomatic DI pattern, comparable to NgRx SignalStore's `signalStore()`). `inject(MyStore)` resolves to the real tree (callable, full `$`/`state`/`.with()` API); the tree's `destroy()` is tied to the host injector via `DestroyRef`. Supports `providedIn: 'root' | 'platform'`. Tree-shakes out when unused (zero floor impact).
- **Bundle-budget CI gate** (`tools/check-bundle-budget.mjs`, wired into pre-publish) — fails if the floor regresses past budget (bare ≤5.8KB, with-entities ≤8.6KB gzip), guarding against optional modules silently leaking into every bundle.
- **`tools/measure-bundle-sizes.mjs`** — reproducible own-code gzip measurement across SignalTree and 6 competitors.

### Fixed

- **`@signaltree/guardrails`** — published barrel re-exported a never-emitted `./lib/rules.js`; added `rules.ts` as an entry point so the package resolves.
- **`@signaltree/callable-syntax`** — slimmed the `.` entry to type-only augmentation so `import '@signaltree/callable-syntax'` no longer drags `@babel` (~196KB) into app bundles; build-time transform stays at the `/vite` `/webpack` subpaths.
- **Built-barrel smoke test** (`tools/verify-built-barrels.mjs`, pre-publish step 7b) — bundles every published `dist/index.js` and fails on unresolvable re-exports (the class of bug that broke guardrails@10.6.0).

## 10.6.0

### Added

- **Stable error codes** — every core message and dev-mode guardrail carries a greppable `[ST####]` code; new [`docs/errors/README.md`](docs/errors/README.md) maps each code to its cause and fix (`ST1xxx` core, `ST2xxx` entity/markers).

### Dev-mode guardrails (warn-only; tree-shaken from production)

- **[ST2001]** `entityMap` entities resolving to a `null`/`undefined` id (missing `selectId`) — they would otherwise collide under one key.
- **[ST2002]** wrong entity method names borrowed from other libraries (Akita `.upsert`/`.add`, Elf `.addEntities`/`.setProps`, RxJS `.next`) → hints the SignalTree equivalent.

### Internal

- Reactivity-contract test suite locks bounded fan-out as a regression-gated invariant; property-based fuzzing of `deepEqual`; timing benchmarks gated behind `ST_PERF=1` for deterministic CI.

## 10.5.0

### Added

- **Body-granular `entityMap`** — `byId(id).field()` reads depend only on that entity's signal, so updating one entity no longer re-runs every entity's computeds (fan-out 1). Per-entity signals are materialized lazily and released on removal.
- **`entityMap` `sortComparer`** config — keeps `all()` / `ids()` in a stable sorted order (`@ngrx/entity` parity); `map()` retains insertion order.

### Fixed (dev-mode)

- **[ST2003]** dev-mode warning when a merge write is skipped because the value is reference-identical to the current value (the in-place-mutation footgun — return a new reference).

## Unreleased

> **Note:** the items below are on `main` but **not published**. Per
> [RFC 0001](docs/rfcs/0001-ai-embedded-boundary.md), streaming is **experimental**
> and `asyncStream` is intentionally **not exported** from the public barrel; the
> F0 type-test gate and the internal tree-node variant fix are landable in any
> future minor. (All consumer-facing bug fixes already shipped in 10.4.1.)

### 🧪 Experimental (not exported): `asyncStream` — chunk-accumulating streaming

Implementation + tests are on `main` but **not public API**. It fills the gap
`asyncSource`/`asyncQuery` can't (those _replace_ the value per emission;
`asyncStream` _accumulates_). Whether it ships as a distinct marker or as an
`accumulate` option on `asyncSource` is deferred (RFC 0001 §5) until there's
demand. Shape under evaluation:

```typescript
// EXPERIMENTAL — not exported from @signaltree/core (see RFC 0001).
import { signalTree, asyncStream } from '@signaltree/core';

const store = signalTree({
  reply: asyncStream<string, string>({ initial: '', accumulate: (s, c) => s + c }),
});

store.$.reply.start(
  anthropic.messages.stream({
    /* … */
  })
); // AsyncIterable | ReadableStream
store.$.reply(); // accumulated text, updates per token
store.$.reply.loading();
store.$.reply.done();
store.$.reply.error();
store.$.reply.cancel(); // abort; .refresh() (alias .regenerate()) re-runs the stream factory; .reset()
```

- Consumes all four AI-SDK transports: **`AsyncIterable | ReadableStream | Observable | Promise`**.
- **`Object.is` equality by default** (not deepEqual) — a growing token string never pays an O(n) compare per chunk.
- switchMap-style cancellation (a superseded/cancelled stream's chunks are dropped) and error-resilience (a failed stream sets `error()` without wedging the marker; the next `.start()` recovers).
- **`AbortSignal` threaded to the `stream` factory** — `stream: (signal) => fetch(url, { signal })`. The signal aborts on `cancel()` / supersession / `reset()` / `DestroyRef`, so cancelling actually aborts the upstream request (stops LLM token billing), not just local state updates.
- `.refresh()` re-runs the configured `stream` factory (family-consistent with `asyncSource.refresh()`); `.regenerate()` is a kept alias.

### Type safety (F0)

- New compile-time type-test harness (`marker-resolution.typing.spec.ts`) + `npm run typecheck` (`tsc --noEmit`) wired into `quality:check`, asserting every marker resolves to its materialized signal type on `tree.$`. The vitest suite runs through esbuild (strips types without checking), so marker type regressions previously shipped silently — this gate closes that. Also fixed the internal `EntityAwareTreeNode` / `DeepEntityAwareTreeNode` variants, which resolved only `entityMap`.
- Attaches at any tree depth like every marker. Standalone `createAsyncStreamSignal(config)` is available for component-local streaming state without a tree.
- There is **no** `@signaltree/ai` package — SignalTree is state; wire your AI SDK in directly.

### Spec coverage

- 13 specs (9 standalone factory across all four transports + accumulate/cancel/supersede/regenerate/reset; 4 tree-materialized marker including depth-3 placement).

### Documentation

- llms.txt / llms-full.txt / SKILL.md: `asyncStream` streaming section, version-availability row, anti-hallucination rows (no `@signaltree/ai`; `asyncSource`/`asyncQuery` are not token accumulators). These ship in the `@signaltree/core` tarball.

### Breaking changes

None — purely additive.

## 10.4.1

### 🐛 Bug fixes

- **Built-in marker registration no longer emits a false "registered after tree construction" warning.** Built-in markers (`status`, `entityMap`, `stored`, `form`, `asyncSource`, `asyncQuery`) self-register lazily on first use, so in multi-store / lazy-loaded apps the first use of a given marker type after another tree already exists tripped the dev-mode post-construction warning — even though built-ins are correct-by-construction (the factory runs inside the state literal before that tree materializes). Built-ins now register via an internal path that suppresses the warning; the public `registerMarkerProcessor` still warns for genuine custom-marker registration after trees exist.
- **`asyncQuery` survives query errors.** A query that errored previously propagated through `switchMap` and terminated the outer subscription, silently killing the pipeline so no further inputs fired. Errors are now contained per-query — the marker surfaces the error and keeps responding to new inputs.
- **`asyncQuery.rerun()` now actually re-fires.** It previously pushed the current input back through `distinctUntilChanged` and was deduped away; it now flows through a dedicated path that bypasses debounce + dedup, matching the documented "rerun current input, skip dedup" behavior.

### 🧪 Internal / contributor

- Wired the Angular `TestBed` environment into the core vitest config (`src/test-setup.ts` + `setupFiles`); the `asyncSource` / `asyncQuery` specs now run (they were previously blocked by a missing test environment). Removed five orphaned enhancer `test-setup.ts` files left from the jest→vitest migration. See `docs/development/testing.md`.

### Documentation

- `llms.txt` / `llms-full.txt` hardened for AI codegen: version→API availability table, typing-the-tree section, template-usage section, testing (`provideAppTreeForTesting` / `NG0201`), a worked depth-attachment example vs `@ngrx/signals` v20.1, and self-carrying anti-pattern markers. These ship in the `@signaltree/core` tarball.

### Breaking changes

None.

## 10.4.0

### ✨ `form.data()` — value-read alias to close the last residual benchmark hallucination

The v10.3.3 AI-codegen benchmark surfaced one remaining marker-method hallucination class: **`tree.$.form.data()`** (count: 2). Models trained on form-state vocabularies (Angular FormGroup, Formik, react-hook-form) consistently reach for `.data()` to read form values rather than calling the marker directly.

Same "meet AI where it is" pattern that v10.2 applied to the `status` marker (`.start()` / `.setSuccess()` / `.succeed()` / `.fail()`): rather than fight the linguistic gravity, accept the form models reach for. v10.4 adds `.data()` on the `form` marker as a **first-class alias** that returns the same value as calling the marker itself:

```typescript
const tree = signalTree({
  profile: form<{ name: string; email: string }>({
    initial: { name: '', email: '' },
  }),
});

// Both forms work and return identical values:
tree.$.profile(); // canonical — call the marker
tree.$.profile.data(); // v10.4 alias — returns the same T

// Field-level signals still recommended for templates / computed:
tree.$.profile.$.name(); // string
```

No new state. The alias delegates to the same internal `valuesSignal()`. JSDoc on the alias documents the canonical preference. No deprecation pressure on existing code calling the marker directly.

### Spec coverage

- 2 new tests in `form.spec.ts` verifying `data()` returns identical values to calling the marker and stays in sync through field updates.

### Documentation

- Agent skill SKILL.md updated to mention the v10.4 alias in the form marker entry.
- llms.txt / llms-full.txt / packages/core/README.md will be updated in the next quarterly priming-file refresh (not blocking — agents already pick up the canonical via calling the marker).

### Why this matters for AI codegen

This is the last known residual hallucination class from the v10.3.3 benchmark. Predicted impact on next quarterly run: **~98% → 99-100% on primed averages, all 6 agents at ceiling**. The doc-patch quadrilogy (10.3.0–10.3.3) raised the ceiling from 91% to 98%; this alias should close the remaining 2pp by absorbing the one form-vocabulary reflex that survived the cleanup.

### Breaking changes

**None.** `.data()` is purely additive.

---

## 10.3.3

Documentation-only patch — fixes the SignalTree agent skill files (`docs/skills/using-signaltree/SKILL.md` + reference deep-dives + per-package sub-skills). These ship in the npm tarball at `node_modules/@signaltree/core/skills/` and are loaded by name by Cursor / Claude Code / SKILL.md-aware harnesses.

7-auditor parallel workflow surfaced 79 raw findings across 16 files. ~30 actionable after synthesis. Highlights:

**Cross-file pattern: deprecated `is`-prefix predicates taught as canonical** (in SKILL.md, reference/core.md, reference/migration-from-ngrx-signals.md, reference/patterns.md). Replaced with v10.3 canonical bare names (`.loading()` / `.loaded()` / `.hasError()` / `.notLoaded()`); the `is`-prefix forms are still documented but explicitly as `@deprecated` aliases removed in v11.

**`byId()` mislabeled as `Signal<E | undefined>`** in core.md, patterns.md, migration-from-ngrx-signals.md. Actually returns `EntityNode<E> | undefined` — a callable cursor with per-field signals. Canonical idiom is `.byId(id)?.()`. Fixed in all 3.

**Wrong / missing API in SKILL.md root file:**

- `form(fields)` placeholder → `form<T>({ initial: T })` config shape
- Branch writes called "replace" → corrected to "deep-merge partial" (both arg forms)
- `asyncQuery .results history, .rerun()` → corrected to current-result + driven via `.input.set()`, no `.refresh()` (that's on `asyncSource`)
- `form(fields)` accessor list missing `.submitting`, falsely listed `.pristine`
- Tagline reverted to v10.3 canonical "State as shape. Signals at every path."

**reference/core.md gaps:**

- `idKey` config field → real name is `selectId`
- Fabricated `@signaltree/core/presets` subpath → removed
- entityMap surface incomplete (`updateMany` shape, `.empty()`, full read/mutation list added)
- form surface incomplete (FormSignal accessors + methods documented)
- Deprecated `is`-prefix forms replaced

**reference/migration-from-ngrx-signals.md:**

- `.update()` on branches → branches are callable, no `.update()` method
- `byId` corrected
- is-prefix predicates corrected (SignalTree side); NgRx side preserved

**reference/patterns.md:**

- Templates and code examples migrated to bare-name predicates
- Legacy facade adapter sources from canonical `.loading` (re-exports as legacy `isLoading`)
- `byId` type comment corrected

**reference/testing.md:**

- Hand-seeding `entityMap` via internal `entities` field → use public API (`setAll` / `upsertOne`)
- Primitive-leaf example `isLoading: true` → `loading: true`

**reference/install.md:**

- `@signaltree/guardrails` peer range `^9.0.0` → `^9.0.1`

**Per-package sub-skills:**

- `guardrails/SKILL.md`: `autoSuppress` union conflated with intent/source enums — separated correctly (`autoSuppress` is `'hydrate' | 'reset' | 'bulk' | 'migration' | 'time-travel' | 'serialization'`).
- `schema/SKILL.md`: install command was missing `@standard-schema/spec` required peer.
- `callable-syntax/SKILL.md`: `rootIdentifiers` default was unstated — added explicit "default `['tree']` only" warning so `store`/`state` consumers don't silently get no rewrite.

These skill files are exactly what Cursor / Claude Code load when configured for SignalTree work. Every bug here directly produces residual hallucinations in the benchmark's primed-run column.

Doc-patch quadrilogy across 5 days (10.3.0 → 10.3.3):

- Root README: 22 fixes
- Tarball README: 22 fixes
- Priming files (llms.txt + llms-full.txt): 24 fixes
- Agent skill files: ~30 fixes
  = **~98 documented inaccuracies eliminated** across every AI-discoverability surface that ships in the tarball or serves from signaltree.io.

---

## 10.3.2

Documentation-only patch — fixes the dedicated AI priming files (`llms.txt`, `llms-full.txt`) that ship in the npm tarball at `node_modules/@signaltree/core/llms*.txt` and are served from `signaltree.io/llms.txt`.

Reproducible 4-auditor workflow (2 per file × signature + logic) ran against both files. 41 raw findings, ~24 actionable after synthesis. All fixed:

**Shared bugs (existed in both files):**

- `form` accessor row listed phantom `.pristine` — replaced with the real `.submitting`.
- `tree.destroy()` documented as "reverse enhancer order" — fixed to "registration order" (matches `signal-tree.ts:565-578`).
- Object-arg root calls described as "replace" — they're deep-merge partial updates; sibling keys are preserved.
- `rxMethod` row attributed only to `@ngrx/signals/rxjs-interop` — now notes the v9.6.0 removal from SignalTree itself.
- Tagline drift from v10.3 canonical — restored to "Reactive JSON for Angular. State as shape. Signals at every path."

**`llms.txt` specific:**

- `form<Profile>({ name: '', email: '' })` — missing `{ initial: ... }` wrapper; fixed to canonical config shape.
- "auto-loaded from localStorage" `stored()` comment misleading on fresh load.
- Edit-session paragraph conflated `createEditSession` (value-level) with `createTreeEditSession` (path-bound, v10.1+); split them.
- "Every wrong pattern was AI-generated" overclaimed (rxMethod was SignalTree's own removed API); softened. Replaced "GPT-5.4" wording with the actual 6-agent matrix description.
- `asyncQuery` does NOT have `.refresh()` — input-driven via `.input.set()`. Disambiguated from `asyncSource`'s `.refresh()`.

**`llms-full.txt` specific:**

- Fabricated `@signaltree/core/presets` subpath import (`TREE_PRESETS`, `createDevTree`, `createProdTree` — none exist). Removed.
- `signalTree(state, { equalityFn: Object.is })` — `equalityFn` isn't a `TreeConfig` field. Replaced with the real `useShallowComparison: boolean`.
- `updateMany([{ id, changes }, ...])` — NgRx shape. SignalTree's real signature is `(ids: K[], changes: Partial<E>)`.
- `byId(id); // Signal<User | undefined>` — actually returns `EntityNode<E> | undefined`; invoke as `.byId(id)?.()`.
- Status section taught deprecated `.isLoading()`-prefix as primary; replaced with v10.3 canonical bare-name predicates plus the v10.2 Promise-vocab aliases.
- `form<T>(config)` mis-attributed to `@signaltree/ng-forms` — it's exported from `@signaltree/core`; `@signaltree/ng-forms` is the FormGroup bridge.
- `.push({ id: 1 })` on an array leaf signal — arrays live in a `WritableSignal<T[]>`; use `.update(arr => [...arr, x])`.
- Stale myth row claimed `setSuccess` doesn't exist; updated to acknowledge v10.2 Promise-vocab aliases.
- Stale "createTreeEditSession is planned for v10.1" — it shipped in v10.1 and we're now at 10.3.2.
- `callable-syntax` plugin's `rootIdentifiers` default is `['tree']` — added the config caveat so `store`/`state` variables aren't silently skipped.

Why this matters: these are the priming files the v10.2 benchmark uses as input. The README and llms files together form the AI's view of SignalTree's API surface. Every bug in this surface was a residual hallucination in the benchmark's primed-run column. Fixing them is the most direct path to the next quarterly run's accuracy lift.

Three consecutive docs patches (10.3.0 → 10.3.1 → 10.3.2) closed:

- Root README: 22 fixes (signatures + logic + tagline)
- Tarball README: 22 fixes (signatures + logic + tagline + package description)
- Priming files: 24 fixes (signatures + logic + tagline)

Combined: 68 documented inaccuracies eliminated across the AI-discoverability surface in 4 days. Predicted impact on next quarterly benchmark: +3-7pp on primed avg, frontier code-tuned models approaching the 100/100 ceiling.

---

## 10.3.1

Documentation-only patch. No code changes.

Reproducible audit workflow ran 3 parallel auditors against
`packages/core/README.md` (the README that ships in the npm tarball and
serves as the AI priming surface). 37 raw findings, 22 actionable after
synthesis. Fixed:

**Wrong API in canonical examples (would not compile or would crash):**

- `import { ..., entities } from '@signaltree/core'` — `entities` is not exported. Replaced all 4 sites with `entityMap`.
- `form({ firstName: '', lastName: '' })` — `form<T>(config)` requires `{ initial: T }`. Fixed the canonical pattern.
- `tree.set((state) => ({...}))` — `tree.set` doesn't exist. The root accessor itself is callable: `tree(updater)`.
- `tree.$.users.updateMany([{ id, changes }])` — that's the NgRx shape. SignalTree's signature is `updateMany(ids[], changes)`.
- `tree.$.products.all.filter(...)` — `.all` is `Signal<E[]>`, not an array. Use `.where(predicate)` for a reactive filter or `.all().filter()` for a one-shot read.
- `tree.$.users.byId(id)()` — `byId` returns `EntityNode<E> | undefined`. Missing `?.` crashes on miss. Fixed 5 sites.
- `contactForm.setSubmitting(true/false)` — not public. Use `contactForm.submit(handler)` which manages the toggle internally.
- `import { batching } from '@signaltree/core/enhancers/batching'` — subpath not in `package.json` exports. Tree-shaking from the main barrel is what we ship.

**Stale tagline / deprecated APIs as primary:**

- Tagline reverted to v10.2-era "JSON branches, reactive leaves. No actions. No reducers. No selectors." — restored to v10.3 canonical "Reactive JSON for Angular. State as shape. Signals at every path." (also fixed the `package.json` description that mirrored it).
- Status section taught deprecated `.isLoading()` / `.isLoaded()` / `.isError()` as primary. Replaced with v10.3 bare-name canonical (`.loading()`, `.loaded()`, `.hasError()`) plus the v10.2 Promise-vocab aliases (`.start()`, `.setSuccess()`, `.succeed()`, `.fail()`).
- Status method-names table miscategorized `.loading` and `.error` as "v10.2 aliases" — they're canonical accessors, not aliases. Cleaned up.
- `form` row listed `.pristine` — that's a `FormControl` field, not a `FormSignal` field. Removed.
- Disambiguation row for `withProps` listed it under both `@ngrx/signals` and Elf — only Elf is correct.
- `rxMethod` row now notes the v9.6.0 removal so AI agents see the full history.

**Documented but not exported:**

- `createAsyncOperation` / `trackAsync` — re-routed to `asyncSource` / `asyncQuery` markers (the canonical async story in v10.x).

**Logic / framing:**

- Callable-syntax section reframed: branches are natively callable for reads AND writes; the plugin only aligns LEAF writes with that shape.
- Benchmark arithmetic clarified: "720 cells (6 agents × 8 prompts × 5 libraries × 3 priming modes)".
- "All predicates are Signal<boolean>" softened to distinguish boolean predicates from value accessors like `.error` and `.data`.

The audit also confirmed 8 claims as accurate (no changes): marker accessor table, `byId(1)?.()` at the inline canonical example, `submit<R>(handler)` description, the rxMethod-to-asyncSource redirect, asyncSource materializer shape, status canonical setters, entity update method shapes, and EntityNode cursor semantics.

Why this matters: the tarball README is what AI agents see after `npm install @signaltree/core` — every wrong API in this file directly feeds the residual hallucinations the v10.2 benchmark measured. Fixing them should close part of the 91→100 ceiling gap on the next benchmark run.

---

## 10.3.0

### 🎯 Marker accessor shape — UNIFIED across all markers

A real DX bug surfaced by the v10.2 AI-codegen benchmark: SignalTree's own markers had inconsistent predicate-accessor naming. `status()` used `is`-prefix (`.isLoading()`, `.isLoaded()`), `entityMap` had one outlier (`.isEmpty()`), while `form`, `asyncSource`, and `asyncQuery` all used bare names (`.dirty`, `.loading`, `.empty`).

Humans had to remember which marker used which shape. AI agents trained on `status.isLoading()` would then try `form.isDirty()` (didn't exist).

**v10.3 fixes this** by making bare-named predicates canonical everywhere — matching `FormControl.dirty` / `.valid` and Angular signals conventions. The `is`-prefix names become deprecated aliases that return the **same Signal instance** as the canonical bare versions.

| Marker                       | v10.3 canonical (preferred)                      | Deprecated alias (v10.x only, removed v11)            |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `status`                     | `.loading`, `.loaded`, `.notLoaded`, `.hasError` | `.isLoading`, `.isLoaded`, `.isNotLoaded`, `.isError` |
| `entityMap`                  | `.empty`                                         | `.isEmpty`                                            |
| `form`                       | `.dirty`, `.valid`, `.touched`, `.pristine`      | (already bare — unchanged)                            |
| `asyncSource` / `asyncQuery` | `.loading`, `.error`, `.data`                    | (already bare — unchanged)                            |

All predicates are callable `Signal<boolean>` — invoke them: `tree.$.load.loading()`, `tree.$.users.empty()`.

### Implementation note — zero double cost

The deprecated alias and the canonical name share the **same lazy-computed Signal instance**. First-access creates one computed; both `.loading` and `.isLoading` return that same Signal. No duplicate computation, no double allocation. Verified by spec: `expect(sig.loading).toBe(sig.isLoading)`.

### Migration path

- **No breaking changes in v10.3.** Existing code using `.isLoading()` / `.isEmpty()` continues to work.
- **JSDoc `@deprecated` annotations** trigger IDE warnings on the old names, nudging migration over time.
- **v11.0 will remove the `is`-prefix aliases.** Plan for ~6+ months of v10.x time for consumers to migrate.

### Updated surfaces

- `llms.txt` + `llms-full.txt` — new "Marker accessor shape — UNIFIED in v10.3" section at the top of the disambiguation tables.
- `packages/core/README.md` — same section ships in the npm tarball.
- `docs/skills/using-signaltree/SKILL.md` — agent skill updated.
- `docs/myths-and-misconceptions.md` — new Myth 18 explaining the historic inconsistency and the v10.3 alignment.
- `marker-zoo` demo + `markers-demo` (fundamentals) — both now show canonical bare-name pattern.

### Spec coverage

- 5 new specs in `status.spec.ts` covering `.loading` / `.loaded` / `.notLoaded` / `.hasError` plus the cache-sharing invariant (`sig.loading === sig.isLoading`).
- 3 new specs in `entity-signal.spec.ts` covering `.empty` / `.isEmpty` semantic equivalence and cache-sharing.

### Why this matters for AI-codegen

The v10.2 benchmark surfaced this inconsistency as a residual 9pp gap to ceiling. With v10.3, every marker uses the same pattern — `tree.$.X.predicateName()` — so models trained on any one marker correctly extrapolate to the others. Expected lift in the next quarterly benchmark: **+3-5pp → ~95% primed average**.

The deeper insight: **the v10.2 benchmark didn't just measure AI accuracy — it surfaced a real DX bug in our own API.** AI-codegen-friendly and human-friendly turned out to be the same thing.

---

## 10.2.0

### 🤖 AI-discoverability hardening — measured +42pp lift

The result of a full audit of where AI coding agents fail on SignalTree. Built on three measured failure modes from a reproducible 720-cell benchmark:

**Headline:** SignalTree's AI-codegen accuracy goes from **49% (cold) to 91% (primed with `llms.txt`)** — a **+42 percentage-point lift** from a single retrievable file. Measured across 6 models (Claude Sonnet 4.6 / Haiku 4.5, GPT-5.4 / GPT-5.4-mini, Gemini 3.1 Pro, Perplexity Sonar Pro) × 8 prompts × 5 libraries × 3 priming modes.

### ✨ Status marker Promise-vocabulary aliases

AI agents trained on Promise-state vocabularies consistently reach for `setSuccess()` / `start()` / `succeed()` / `fail()` when working with the `status()` marker. Rather than fight the linguistic gravity, v10.2 adds these as **first-class aliases** for the canonical `setLoaded()` / `setLoading()` / `setError()`:

```typescript
const tree = signalTree({ load: status() });

// Canonical (still preferred in new code)
tree.$.load.setLoading();
tree.$.load.setLoaded();
tree.$.load.setError(err);

// Now equivalent (AI-friendly):
tree.$.load.start(); // === setLoading()
tree.$.load.setSuccess(); // === setLoaded()
tree.$.load.succeed(); // === setLoaded()
tree.$.load.fail(err); // === setError(err)
```

Identical semantics, identical observable behavior, identical performance. Zero deprecation pressure on existing `setLoading()`/`setLoaded()` code. **No second source of truth — these are aliases, not new state.**

### 📚 17-row cross-library disambiguation table in `llms.txt` + `llms-full.txt`

Every wrong pattern AI agents generate, mapped to its real origin library and the correct SignalTree equivalent. Empirically derived from the cold-run benchmark — every "Wrong" entry was actually generated by at least one model. Catches the dominant cold-failure mode (cross-library contamination from `@ngrx/signals`, Akita, Elf, MobX, RxJS) in one priming pass.

Examples:

| Wrong (NOT SignalTree)        | Real origin     | Correct                          |
| ----------------------------- | --------------- | -------------------------------- |
| `new SignalTree({...})`       | invented        | `signalTree({...})`              |
| `signalStore(withState(...))` | `@ngrx/signals` | `signalTree({...})`              |
| `collection<T>({ idKey })`    | Akita / Elf     | `entityMap<T, K>({ selectId })`  |
| `.value` accessors            | MobX            | call the signal: `tree.$.path()` |
| `from 'signal-tree'`          | invented        | `from '@signaltree/core'`        |

### 🔬 Benchmark infrastructure improvements

- **Lightweight scorers** — `scripts/ai-codegen-benchmark/scorer.mjs` adds import-resolution and marker-method-API validators alongside the existing idiomatic-pattern matcher. No compiler invocation needed; catches the dominant primed-run failure mode (hallucinated method names from neighboring libraries).
- **Multi-file priming** — `PRIMING_CONTEXT_FILE=a.txt,b.md` to A/B priming compositions. Surprising finding: adding `myths.md` to llms.txt **regressed** accuracy (91 → 87) due to context dilution. **Implication: prefer focused priming over breadth.**
- **Per-tier model comparison** — `--include-tier-comparison` runs Haiku 4.5 and GPT-5.4-mini alongside frontier models. Validates that **priming closes the model-tier gap**: primed Haiku (97/100) outscores cold Sonnet 4.6 (41/100) by **2.4×**.
- **8 prompts** (up from 3) covering counter, paginated-users, debounced-search, derived-state (cart totals), form-marker (login), undo-redo (createEditSession), deep-state (nested status), multi-marker (persisted draft + status).
- **`CADENCE.md`** documenting quarterly re-run schedule with cost envelope (~$15/quarter).

### Spec coverage

- 5 new specs covering status alias correctness, error clearing across alias→canonical transitions, and semantic equivalence with the canonical methods.

### Breaking changes

**None.** Aliases are additive; the canonical `setLoading()`/`setLoaded()`/`setError()`/`setNotLoaded()`/`reset()` are unchanged.

---

## 10.1.0

### ✨ New: `createTreeEditSession(source)` — path-bound draft sessions

The path-bound overload that v10 docs corrected (and deferred). Bind an edit session to a writable tree path or signal; the session holds a draft separate from the source. `applyChanges()` edits the draft, `undo()`/`redo()` navigate history, `commit()` writes back, `cancel()` discards.

```typescript
import { createTreeEditSession } from '@signaltree/core/edit-session';

const session = createTreeEditSession(tree.$.user.profile);

session.applyChanges((p) => ({ ...p, name: 'V2' }));
session.modified(); // current draft
session.isDirty(); // true
session.undo();
session.commit(); // tree.$.user.profile === draft
// or:
session.cancel(); // discard draft, re-sync from source
```

Accepts any "callable accessor with `.set()`" — `WritableSignal<T>`, SignalTree branch accessors (`tree.$.user.profile`), or leaf signals (`tree.$.user.profile.name`).

### 🤖 OpenRouter unified adapter for the AI-codegen benchmark

The v10 benchmark scaffolding shipped four separate adapters (Claude, OpenAI, Gemini, Perplexity) each requiring its own API key. v10.1 adds a fifth adapter — `openrouter.mjs` — that proxies to all major providers via one key and one endpoint. When `OPENROUTER_API_KEY` is set, the runner uses OpenRouter for every agent automatically. Per-provider adapters remain available as fallback (set `FORCE_DIRECT_ADAPTERS=1` to opt in).

This makes the benchmark substantially easier to run — one OR key from https://openrouter.ai/keys gets you Claude + GPT-4o + Gemini + Perplexity + Llama.

### Spec coverage

`packages/core/src/lib/edit-session.spec.ts` — 9 cases covering `createEditSession` and `createTreeEditSession` (initialization, applyChanges, commit, cancel, pullFromSource, undo/redo, primitive sources, error handling).

## 10.0.0

### 🎯 The DX-and-AI-discoverability release

v10 is a polish-and-flex pass: surfacing what makes SignalTree uniquely good, hardening the things that bit users on previous versions, and shipping the strategic differentiator (AI-codegen benchmark) that no Angular state library has.

### ✨ Code surface

- **`registerMarkerProcessor` post-construction warning.** Calling it AFTER any `signalTree()` has been built now emits a dev-mode console warning explaining why existing trees won't pick up the marker. Argument-type validation throws a clear `TypeError` instead of failing silently at materialization time. Powered by a new internal `_recordTreeConstruction()` hook in `signal-tree.ts`.
- **`tree.state` JSDoc-deprecated** pointing at `tree.$` as the canonical accessor. No runtime change — both still work — but new code should use `$`. `state` removal planned for v11.

### 📊 New benchmarks (`packages/core/src/lib/benchmarks.spec.ts`)

- **Cold-start construction** — 1000-leaf flat tree built in <50ms median; 10-level-deep tree in <10ms median.
- **Per-mutation throughput at depth** — writes and reads at depth-5 are <2.5× the cost of depth-1.
- **Memoization correctness** — verifies Angular `computed()` skips recompute when (a) unrelated leaves change and (b) inputs are set to the same value via `Object.is`.

### 🤖 AI-codegen accuracy benchmark — `scripts/ai-codegen-benchmark/`

Scaffolding for measuring how reliably AI coding agents (Cursor, Claude Code, Copilot, Gemini, Perplexity) generate **correct** Angular state-management code across libraries. Three reproducible prompts shipped (counter, paginated-users, debounced-search). Adapters for Claude, OpenAI, Gemini, Perplexity wired. Runner scores compile + behavior + idiomatic-pattern matching. Run it yourself with `node scripts/ai-codegen-benchmark/runner.mjs` once API keys are set.

This is the strategic differentiator from the v10 audit's HSA L1 #3 priority. Other state libraries compete on bundle size and feature lists; SignalTree publishes **AI-correctness percentages** as a public, auditable metric.

### 🎨 New demos

- **`/marker-zoo`** — all 6 markers (`entityMap`, `status`, `stored`, `form`, `asyncSource`, `asyncQuery`) in ONE tree at FOUR different depths simultaneously. Demonstrates path-attached composition that NgRx's `with*` features can't replicate.
- **`/built-for-ai`** — the AI-discoverability story as a landing page. Surfaces `llms.txt`, the npm-tarball agent skill, drop-in `.cursorrules` / `CLAUDE.md` templates, the myths catalogue, the honest NgRx comparison, and the AI-codegen benchmark — all in one place.

### 📚 Docs

- `llms.txt` adds the marker-zoo, built-for-ai, and AI-codegen benchmark links.
- README adds links to all three new surfaces.
- `createEditSession` docs across `llms.txt`, `llms-full.txt`, `docs/compare/ngrx-signalstore.md`, and `docs/myths-and-misconceptions.md` corrected from the previously-incorrect `(tree, '$.path')` signature to the actual `(initial: T)`. A path-bound overload is planned for v10.1.

### 💥 Breaking changes

None. v10 is additive and corrective. The semver-major bump reflects the deprecation of `tree.state` (slated for removal in v11) plus the depth of the audit pass.

## 9.6.0

### 💥 Breaking: `rxMethod` removed

`rxMethod` (briefly shipped in 9.5.0-9.5.2 at `@signaltree/core/rxjs-interop` as a NgRx-migration alias) is **removed in this release**. Keeping it created two parallel async stories and an API surface that didn't fit SignalTree's path-attached marker philosophy.

**The canonical async story is the markers, full stop:** `asyncSource` for load-and-expose, `asyncQuery` for input-driven debounced queries. Both shipped in 9.5.0 and remain unchanged.

**If you used `rxMethod` from 9.5.x:**

- `rxMethod<void>(pipeline)` doing a load-and-expose → replace with `asyncSource(config)` at the data's tree path.
- `rxMethod<TInput>(pipeline)` doing a debounced input-driven query → replace with `asyncQuery(config)` at the search/results tree path.
- Complex multi-step orchestration where neither marker fits → write a plain Observable method in an `@Injectable()` Ops class with `tap()` writing to tree paths.

See [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md) for the full mapping with examples.

### Removed surfaces

- **`@signaltree/core/rxjs-interop`** subpath — entire subpath export is gone. `import { rxMethod } from '@signaltree/core/rxjs-interop'` will fail.
- **`rxMethod`, `RxMethod`, `RxMethodInput`** — no longer exported from anywhere.
- **`/rxmethod`** demo route — now 301-redirects to `/async`.
- **rxMethod nav entry** removed from the sidebar.

### Docs

All docs surfaces updated to drop `rxMethod` references and point migrators at the canonical markers:

- `llms.txt`, `llms-full.txt`
- `README.md`
- `docs/compare/ngrx-signalstore.md`
- `docs/myths-and-misconceptions.md` (Myth 9 rewritten)
- `docs/ai/agent-templates.md`
- `docs/skills/using-signaltree/reference/core.md`
- `docs/skills/using-signaltree/reference/patterns.md`
- `docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`

### Why this is a 9.6.0 (minor) and not a 10.0.0 (major)

Strictly, removing a public API is a major-version change. We're treating this as a minor with a clear "recall" framing because:

1. `rxMethod` was only ever public for ~6 hours total across 9.5.0/9.5.1/9.5.2.
2. Adoption was confirmed minimal (handful of users at most).
3. The replacement story is straightforward — both replacement options were already documented in 9.5.x.
4. v9.5.0 (where `rxMethod` shipped) is also marked as a deprecated stepping stone — anyone reading the changelog will see the recall narrative.

If you were one of the early adopters of 9.5.x's `rxMethod` and this break catches you off-guard, please open an issue — we'll help map your specific pipeline to the markers.

## 9.5.2

### 📚 Docs: agent skill, comparison, and AI templates now lead with the markers

Follow-up to 9.5.0/9.5.1: previously the agent skill that ships inside every `@signaltree/*` tarball at `skills/using-signaltree/` still framed `rxMethod` as the canonical async primitive, and several docs surfaces had the same problem. This release updates:

- `skills/using-signaltree/reference/core.md` — adds `asyncSource` / `asyncQuery` to the markers section; reframes the `rxjs-interop` subpath as the migration alias.
- `skills/using-signaltree/reference/patterns.md` — restructures "Replacing rxMethod" into a three-option breakdown (markers preferred, `rxMethod` alias, plain Observable fallback).
- `skills/using-signaltree/reference/migration-from-ngrx-signals.md` — mapping table and dedicated `rxMethod` section updated with all three options.
- `llms-full.txt`, `docs/compare/ngrx-signalstore.md`, `docs/ai/agent-templates.md` — all lead with markers; `rxMethod` clearly labeled as migration alias.
- `/rxmethod` demo page adds a banner pointing to `/async` as the canonical pattern.

Pure docs/skill content patch — code surface is unchanged from 9.5.1.

## 9.5.1

### 🐛 Type fix for `asyncSource` / `asyncQuery` accessors

Adds the missing `AsyncSourceMarker → AsyncSourceSignal` and `AsyncQueryMarker → AsyncQuerySignal` mappings to the `TreeNode<T>` type. Without this, TypeScript and Angular's template compiler treated `store.$.users` as the unprocessed marker type (no `.loading`, `.refresh`, etc. visible).

Pure type-only fix — runtime behavior in 9.5.0 was correct; only the TypeScript surface was missing. Anyone using 9.5.0 should upgrade.

## 9.5.0

### ✨ New: `asyncSource` and `asyncQuery` markers — the SignalTree-native async story

After shipping `rxMethod` in 9.4.0 as the NgRx-symmetric primitive, we realized the right SignalTree answer isn't "port NgRx's shape" — it's "fit async into the marker family alongside `entityMap`, `status`, `stored`, and `form`." Async behavior belongs **at the tree path it describes**, not in a free-standing service method that writes to paths imperatively.

**`asyncSource<T>(config)`** — load-and-expose async primitive. Place anywhere in your tree literal; materializes into a fully-functional accessor with `data`, `loading`, `error`, and lifecycle methods.

```typescript
import { signalTree, asyncSource } from '@signaltree/core';

const store = signalTree({
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),
  }),
});

store.$.users();         // current value (signal call)
store.$.users.loading(); // boolean
store.$.users.error();   // unknown | null
store.$.users.refresh(); // reload (cancels in-flight)
store.$.users.set([...]);
store.$.users.reset();
```

**`asyncQuery<TInput, TResult>(config)`** — input-driven debounced query. Wire a writable signal to drive the pipeline; debounce, distinct, switchMap-cancellation all built in.

```typescript
import { asyncQuery } from '@signaltree/core';

const store = signalTree({
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    filter: (q) => q.length > 0,
    query: (q) => this.api.search$(q),
  }),
});

store.$.search.input.set('alice'); // triggers debounced pipeline
store.$.search(); // results
store.$.search.loading();
```

Both markers:

- Attach at **any tree depth** — same as `entityMap` / `status` / `stored` / `form`.
- Accept **Observable or Promise** loaders — no `firstValueFrom` ceremony.
- Auto-clean on the surrounding **`DestroyRef`**.
- Eliminate manual `tap()` / `setLoading()` / `setLoaded()` wiring entirely.

Live demo at https://signaltree.io/async.

### 🔄 `rxMethod` retained as a migration alias

`rxMethod` (introduced in 9.4.0, unpublished after design review) is **not** available in this release. The SignalTree-native answer is the marker family above. For teams migrating from `@ngrx/signals`, the closest 1:1 swap is `asyncSource` for "load on init" and `asyncQuery` for "input-driven."

If you specifically need the NgRx `rxMethod`-shaped callable pipeline, it remains exported from `@signaltree/core/rxjs-interop`:

```typescript
import { rxMethod } from '@signaltree/core/rxjs-interop';
// ... same API as NgRx for migration ergonomics.
```

### 📚 Documentation

- All docs (llms.txt, llms-full.txt, README, comparison doc, myths doc) updated to lead with `asyncSource` / `asyncQuery` and frame `rxMethod` as the migration alias.

## 9.4.0

### ✨ New

- **core:** New subpath export `@signaltree/core/rxjs-interop` ships `rxMethod` — direct equivalent of NgRx's `rxMethod` with the same call shape, the same input flexibility (raw value, `Signal<T>`, or `Observable<T>`), and the same auto-cleanup semantics via the surrounding `DestroyRef`. Closes the last remaining "NgRx ergonomics gap" for async pipelines.

  ```typescript
  import { rxMethod } from '@signaltree/core/rxjs-interop';

  readonly loadUsers = rxMethod<void>((input$) =>
    input$.pipe(
      tap(() => this._$.users.loading.setLoading()),
      switchMap(() => this._api.list$().pipe(
        tap((users) => this._$.users.entities.setAll(users)),
        tap(() => this._$.users.loading.setLoaded()),
        catchError((err) => { this._$.users.loading.setError(err); return EMPTY; }),
      )),
    ),
  );
  ```

  Live demo at https://signaltree.io/rxmethod.

### 📚 Documentation

- New `/llms.txt` and `/llms-full.txt` published at the site root for retrieval-augmented AI agents (Cursor, Claude Code, Copilot, Gemini, Perplexity).
- New `docs/compare/ngrx-signalstore.md` — honest axis-by-axis comparison with NgRx SignalStore.
- New `docs/myths-and-misconceptions.md` — catalogues 16 false claims LLMs frequently propagate, with source-code citations.
- New `docs/ai/agent-templates.md` — drop-in `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md` templates for downstream projects.
- README expanded with `rxMethod`, devTools path-based action callout, and a more complete "When NOT to use SignalTree" section (dynamic-schema streaming and heavy-RxJS-classic-NgRx migration honesty).

## 9.2.0

### ⚠️ Breaking Changes

> Technically breaking but expected to be invisible for almost all users. The removed type augmentation was undocumented; the supported entrypoint for callable Angular signals has always been `@signaltree/callable-syntax`.

- **core:** Removed the global `declare module '@angular/core'` augmentation that added callable overloads to Angular's `WritableSignal<T>`. The augmentation lived in `packages/core/src/lib/types.ts` and activated project-wide whenever any file imported from `@signaltree/core`. This made `WritableSignal<T>` invariance-incompatible with libraries that depend on the original signature — most notably `@ngrx/signals`' `WritableStateSource<T>`, surfacing as ~30 `TS2345` errors in mixed `@ngrx/signals` + SignalTree codebases. The callable augmentation is now exclusively owned by `@signaltree/callable-syntax`.
  - **If you import only from `@signaltree/core`** and use `tree.$.x.set(value)` / `tree.$.x.update(fn)`: nothing changes.
  - **If you relied on calling raw Angular `WritableSignal<T>` instances as functions** (`mySignal(value)`) without ever installing `@signaltree/callable-syntax`: add `import '@signaltree/callable-syntax/augmentation';` to a side-effect file in your app, or list `@signaltree/callable-syntax` in your `tsconfig.compilerOptions.types`.
  - This unblocks **gradual adoption alongside `@ngrx/signals`** in monorepos.

## 9.0.1

### ⚠️ Breaking Changes

> These changes are technically breaking but shipped in a patch because v9.0.0 was only just released and usage of the affected APIs is minimal. If you were using `memoization()` or preset factories on 9.0.0, pin to `9.0.0` and migrate on your own schedule.

- **core:** Removed the `memoization` enhancer and all preset factories. Use Angular's built-in `computed()` for memoization — it provides equivalent caching with zero additional runtime cost and smaller bundle size.
  - Removed: `memoization()` enhancer and its config type `MemoizationConfig`
  - Removed: `MemoizationMethods` type
  - Removed: preset factories `shallowMemoization()`, `lightweightMemoization()`, `computedMemoization()`, `selectorMemoization()`, `highPerformanceMemoization()`
  - Removed: subpath export `@signaltree/core/presets`
  - Migration: replace `tree.with(memoization())` + selector functions with `computed(() => tree.$.path())` directly in your component or service.
- **guardrails:** Removed the `maxRecomputations` budget and all recomputation tracking from `GuardrailsConfig.budgets`. The feature depended on the memoization enhancer's internal accounting. `RuntimeStats.recomputationCount` and `recomputationsPerSecond` remain in the public type (always `0`) for backwards-compatible structural consumers.
- **workspace:** Dropped the orphan `@signaltree/types` and `@signaltree/utils` tsconfig path aliases. These packages were never published.

### 🧭 Migration

Before (9.0.0):

```ts
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree(initial).with(memoization());
```

After (9.0.1):

```ts
import { computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree(initial);
const expensive = computed(() => heavyDerive(tree.$.data()));
```

Full guide: [docs/guides/MIGRATION.md](docs/guides/MIGRATION.md#901).

---

## 9.0.0

### ⚠️ Breaking Changes

- **core:** Removed 37 deprecated/alias exports from main barrel. See [migration guide](docs/guides/migration-v8-v9.md) for full list and replacements.
  - Removed: `entities()`, `enableEntities()`, `highPerformanceEntities()` (deprecated since v7)
  - Removed: `enableDevTools()`, `fullDevTools()`, `productionDevTools()` → use `devTools(config)`
  - Removed: `enableSerialization()`, `applySerialization()`, `applyPersistence()` → use `.with(serialization())` / `.with(persistence())`
  - Removed: `enableTimeTravel()` → use `timeTravel()`
  - Removed: `batchingWithConfig`, `highPerformanceBatching()` → use `batching(config)`
  - Removed: `createAsyncOperation()`, `trackAsync()` → use Angular `resource()`
  - Removed: 7 memoization variant functions → use `memoization({ preset: '...' })`
  - Removed: `memoize()`, `memoizeShallow()`, `memoizeReference()` standalone functions
  - Removed: `clearAllCaches()`, `getGlobalCacheStats()` global functions
- **core:** `SecurityValidator`, `SecurityPresets`, and security types moved to `@signaltree/core/security`
- **core:** `TREE_PRESETS`, `createDevTree()`, `createProdTree()`, `createMinimalTree()`, and preset utilities moved to `@signaltree/core/presets`
- **core:** `createEditSession()`, `EditSession`, `UndoRedoHistory` moved to `@signaltree/core/edit-session`
- **core:** `createStorageAdapter()`, `createIndexedDBAdapter()` moved to `@signaltree/core/storage`
- **core:** Applying the same enhancer twice now throws (duplicate detection via `ENHANCER_META` symbol)
- **core:** `destroy()` now automatically calls all enhancer cleanup functions

### 🚀 Features

- **core:** Enhancer lifecycle cleanup — enhancers register teardown functions via `registerCleanup()`. All 5 enhancers (batching, memoization, devtools, time-travel, persistence) now clean up properly on `destroy()`.
- **core:** `tree.destroyed` readonly signal — components can react to tree disposal
- **core:** `tree.registerCleanup(fn)` — register custom cleanup functions
- **core:** Enhancer dependency validation — `.with()` validates that required enhancers are present
- **core:** `ENHANCER_META` symbol for enhancer metadata (name, provides, requires)
- **core:** `isDev` utility exported for dev-mode detection
- **core:** 4 subpath exports: `@signaltree/core/presets`, `/security`, `/edit-session`, `/storage`

### 🧪 Testing

- Added 44 new tests:
  - 13 enhancer safety tests (metadata, duplicates, dependencies)
  - 8 enhancer cleanup tests (per-enhancer cleanup, stress test)
  - 5 memory stress tests (10K nodes, rapid updates, 100 create/destroy cycles)
  - 6 lazy tree threshold tests
  - 6 schema-level type tests
  - 6 benchmark tests (creation/read/write overhead, enhancer overhead)

### 📖 Documentation

- README rewritten from 1,812 → 169 lines. Leads with mental model, no marketing hyperbole.
- v8 → v9 migration guide with before/after code
- Custom enhancers guide documenting the enhancer contract
- Performance methodology doc with honest measurement rules
- Architecture guide expanded with enhancer decision flowchart, anti-patterns, scaling guide
- Performance patterns guide rewritten with actionable guidance

### 🏗️ Build & CI

- `validate:budget` script — export count, bundle size, and dev-code leak CI checks
- `validate:tree-shaking` script — verifies minimal import doesn't pull enhancer code
- Tree-shaking verified: `signalTree`-only import bundles to 44.5 KB vs 183 KB total
- Publish provenance (`--provenance`) added to release script
- API surface reduced from 76 → 39 runtime exports (49% reduction)
- Bundle size: 74.7 KB gzipped, 315 KB unpacked (slightly smaller than v8)

### 🩹 Fixes

- Fixed persistence subscription leak — `tree.subscribe()` return value was being discarded
- **events:** `@signaltree/events` is now **ESM-only** (CJS build + `exports["require"]` removed)

### 🏗️ Build & Packaging

- Packaging reliability improvements: publishable `dist/` layouts are produced directly by the bundler targets (no ad-hoc post-build copy steps).

## 7.6.0 (2026-02-16)

### 🚀 Features

- **core:** DevTools auto-connect, path-based actions, time-travel dispatch, and action metadata
- **core:** DevTools filtering, safe serialization, pretty path formatting, and rate limiting
- **core:** `devTools()` composition tracing via `.with()` chain actions

### 🩹 Fixes

- **core:** `entityMap().byId()` reactivity when IDs are set before collections
- **core:** Preserve derived signal identity across `.with()` chaining

### 📖 Documentation

- Demo and docs updated to reflect DevTools auto-connect, path actions, and time-travel support

---

## 7.2.0 (2026-01-17)

### 🚀 Features

- **core:** `form()` marker for tree-integrated forms with validation, wizard navigation, and persistence
- **core:** `entityMap().computed()` - chainable computed slices for derived entity collections
- **core:** `stored()` versioning and migrations with `migrate` function
- **realtime:** `@signaltree/realtime` package for Supabase/Firebase/WebSocket synchronization
- **ng-forms:** `formBridge()` enhancer for bridging `form()` markers to Angular FormGroup

### 🏗️ Architecture

- **ng-forms:** New layered architecture: `form()` (core) + `formBridge()` (ng-forms)
  - `form()` is self-sufficient: works standalone without Angular forms
  - `formBridge()` adds FormGroup bridge, conditional fields, Angular validators
  - Better composability and tree-shaking
- **ng-forms:** Deprecate `createFormTree()` in favor of `signalTree({ myForm: form({...}) }).with(formBridge())`

### 🩹 Fixes

- **core:** Fix `EntityMapBuilder` type to properly extend `EntityMapMarker`
- **realtime:** Fix Supabase adapter type constraints for `channel.on()` generic parameters
- **realtime:** Add `@supabase/supabase-js` as dev dependency for TypeScript resolution

### 📖 Documentation

- **core:** Comprehensive documentation for all built-in markers in README:
  - `entityMap()` with computed slices and custom ID selection
  - `status()` with generic error types
  - `stored()` with versioning, migrations, and `createStorageKeys()`
  - `form()` with validation, wizard, persistence, and async validators
- **ng-forms:** Updated README with new architecture diagram and migration guide
- **realtime:** Package README with Supabase integration guide

### Demo App

- Added interactive demos for all v7 features:
  - Form marker demo with wizard and persistence
  - Stored versioning demo with migration testing
  - Realtime demo with simulated sync

### ❤️ Thank You

- Borgia

## 7.1.1 (2026-01-07)

### 🚀 Features

- **core:** Self-registering markers for 100% tree-shakeability

### 🩹 Fixes

- **core:** Prevent duplicate marker processor registrations
- **core:** Fix circular dependency between types.ts and entity-signal.ts

### ⚡ Performance

- **core:** Zero import-time side effects - unused markers completely eliminated from bundle
- **core:** Built-in markers (`entityMap`, `status`, `stored`) now self-register on first use

### 📖 Documentation

- Updated custom-markers-enhancers.md with self-registering pattern
- Added tree-shaking section to core README

### ❤️ Thank You

- Borgia

## 7.1.0 (2026-01-06)

### 🚀 Features

- ⚠️ **core:** add generic error type to status() marker ([13a6ef2](https://github.com/JBorgia/signaltree/commit/13a6ef2))

### 🩹 Fixes

- **guardrails:** update @signaltree/shared peer dependency to ^7.0.0 ([50a21d9](https://github.com/JBorgia/signaltree/commit/50a21d9))

### ⚠️ Breaking Changes

- **core:** None - fully backward compatible

### ❤️ Thank You

- Borgia

## [7.0.0] - 2026-01-06

### 🎯 Philosophy: Use Angular Directly

v7 embraces a **minimal marker** philosophy. SignalTree provides markers only for things Angular doesn't have built-in:

| SignalTree Marker      | Purpose                  | Angular Equivalent |
| ---------------------- | ------------------------ | ------------------ |
| `entityMap<T, K>()`    | Normalized collections   | None               |
| `status()`             | Manual async state       | None               |
| `stored(key, default)` | localStorage persistence | None               |

**Everything else → use Angular directly:**

- `computed()` - Derived read-only state
- `linkedSignal()` - Writable derived state
- `resource()` - Async data fetching with auto loading/error

### 📐 The `.derived()` Rule

> **Only use `.derived()` when you need access to `$` (tree state)**

```typescript
@Injectable({ providedIn: 'root' })
export class AppStore {
  private http = inject(HttpClient);

  readonly tree = signalTree({
    // ✅ Plain values → become signals
    count: 0,
    name: '',

    // ✅ SignalTree markers (Angular doesn't have these)
    users: entityMap<User, number>(),
    usersStatus: status(),
    theme: stored('theme', 'light'),

    // ✅ Angular primitives that DON'T need tree state
    windowWidth: linkedSignal(() => window.innerWidth),
    serverConfig: resource({ loader: () => firstValueFrom(this.http.get('/api/config')) }),
  }).derived(($) => ({
    // ✅ Only things that NEED $ go here
    doubled: computed(() => $.count() * 2),
    selectedUser: computed(() => $.users.byId($.selectedId())?.()),
    userDetails: resource({
      request: () => $.selectedId(),
      loader: ({ request }) => firstValueFrom(this.http.get<Order[]>(`/api/users/${request}`)),
    }),
  }));
}
```

### 🚀 New Features

#### `status()` Marker - Async Operation State Tracking

Track loading states for async operations with automatic derived signals and helper methods:

```typescript
import { signalTree, status, LoadingState } from '@signaltree/core';

const tree = signalTree({
  users: {
    entities: entityMap<User>(),
    status: status(), // Async state tracking
  },
});

// Derived boolean signals (lazy-created for performance)
tree.$.users.status.isNotLoaded(); // true initially
tree.$.users.status.isLoading(); // false
tree.$.users.status.isLoaded(); // false
tree.$.users.status.isError(); // false

// Helper methods
tree.$.users.status.setLoading(); // Start loading
tree.$.users.status.setLoaded(); // Mark complete
tree.$.users.status.setError(new Error('Failed')); // Set error state
tree.$.users.status.reset(); // Back to NotLoaded
```

**Performance optimizations:**

- Lazy computed signals - `isLoading`, `isLoaded`, etc. only created on first access
- 100 status markers initialize in < 50ms

#### `stored()` Marker - localStorage Persistence

Auto-sync signals to localStorage with debounced writes:

```typescript
import { signalTree, stored } from '@signaltree/core';

const tree = signalTree({
  theme: stored('app-theme', 'light'),
  preferences: stored('user-prefs', { notifications: true }),
});

// Value loads from localStorage on init
tree.$.theme(); // 'light' or restored value

// Auto-saves on change (debounced by default)
tree.$.theme.set('dark'); // Signal updates immediately, storage writes debounced

// Methods
tree.$.theme.clear(); // Reset to default, remove from storage
tree.$.theme.reload(); // Force reload from storage
```

**Performance optimizations:**

- Default 100ms debounce prevents localStorage hammering
- Non-blocking writes via `queueMicrotask()`
- Rapid updates coalesced into single storage write
- Set `debounceMs: 0` for immediate writes when needed

#### Marker Extensibility

Register custom marker processors for advanced use cases:

```typescript
import { registerMarkerProcessor } from '@signaltree/core';

// Register a custom marker type
registerMarkerProcessor(
  isMyMarker, // Type guard
  (marker, notifier, path) => createMySignal(marker) // Factory
);
```

### ⚡ Performance

- **status()**: Lazy computed creation - derived signals only created on access
- **stored()**: Debounced writes (default 100ms) with queueMicrotask for non-blocking I/O
- **Performance budgets**: 100 markers initialize in < 50ms (tested)
- **Auto-batching**: Partial updates via callable are automatically batched

### ⚠️ Deprecations

#### `entities()` Enhancer Deprecated

The `entities()` enhancer is **no longer needed**. EntityMap markers are now automatically processed during tree finalization.

```typescript
// Before (v6)
const tree = signalTree({
  users: entityMap<User, number>(),
}).with(entities()); // Required

// After (v7)
const tree = signalTree({
  users: entityMap<User, number>(),
}); // Just works - no .with(entities()) needed!
```

If you have existing code with `.with(entities())`, it will continue to work (backward compatible) but will show a deprecation warning:

```
SignalTree: entities() enhancer is deprecated in v7. EntityMap markers are now automatically
processed. Remove .with(entities()) from your code. This enhancer was removed in v7.
```

### 🔄 Auto-Batching

Partial updates via the callable syntax are now automatically batched:

```typescript
const tree = signalTree({
  user: { name: 'Alice', age: 30 },
});

// Partial update - auto-batched (single change detection cycle)
tree.$.user({ name: 'Bob' }); // Only updates name, keeps age: 30

// Function update - also auto-batched
tree.$.user((prev) => ({ ...prev, score: prev.score + 10 }));
```

The `NodeAccessor` type now accepts `Partial<T>` for partial updates.

### 📦 Exports

New exports from `@signaltree/core`:

```typescript
// Status marker
export { status, isStatusMarker, LoadingState } from '@signaltree/core';
export type { StatusMarker, StatusSignal, StatusConfig } from '@signaltree/core';

// Stored marker
export { stored, isStoredMarker } from '@signaltree/core';
export type { StoredMarker, StoredSignal, StoredOptions } from '@signaltree/core';

// Extensibility
export { registerMarkerProcessor } from '@signaltree/core';
```

---

## [6.3.1] - 2026-01-XX

### ⚠️ Breaking Changes

- **core:** `derived()` marker function removed - use `computed()` directly in `.derived()` layers
  - The marker was redundant since `computed()` signals are automatically detected
  - Types (`DerivedMarker`, `isDerivedMarker`) kept for backwards compatibility

```typescript
// Before (removed)
import { derived } from '@signaltree/core';
.derived($ => ({ doubled: derived(() => $.count() * 2) }))

// After (use Angular's computed directly)
import { computed } from '@angular/core';
.derived($ => ({ doubled: computed(() => $.count() * 2) }))
```

### 🐛 Bug Fixes

- **core:** Fixed deep merge of derived state into namespaces containing entityMaps
  - NodeAccessor properties are now `writable: true`, allowing enhancers to replace entityMap markers
  - `entities()` enhancer now properly recurses into NodeAccessors (function-based nodes)
  - Fixes runtime error: `$.namespace.entities.upsertOne is not a function`

### 📖 Details

When using `.derived()` to add computed signals to a namespace that also contains an `entityMap()`, the deep merge was not working correctly. The derived properties were added, but the entityMap methods (like `upsertOne`, `all`, `byId`) were inaccessible.

**Root Cause:** Two related issues:

1. `entities()` enhancer only recursed into plain objects (`typeof === 'object'`), but after derived merge, namespaces become NodeAccessors which are functions
2. NodeAccessor properties were defined with `writable: false`, so when `entities()` tried to replace the entityMap marker with an EntitySignal, the assignment silently failed

**Example that now works:**

```typescript
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null,
  },
})
  .derived(($) => ({
    tickets: {
      // Deep merge preserves entities while adding active
      active: derived(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
    },
  }))
  .with(entities());

// All methods now work correctly:
tree.$.tickets.entities.upsertOne({ id: 1, name: 'Test' }); // ✅
tree.$.tickets.entities.all(); // ✅
tree.$.tickets.activeId(); // ✅
tree.$.tickets.active(); // ✅
```

**Migration:** If you previously used passthrough workarounds to preserve source properties, you can now remove them:

```diff
 .derived(($) => ({
   tickets: {
-    // Remove passthrough workarounds
-    entities: $.tickets.entities,
-    activeId: $.tickets.activeId,
-
     // Only derived state needed
     active: derived(() => /* ... */),
   },
 }))
```

---

## [6.3.0] - 2026-01-XX

### Added

- **Automatic notification batching**: PathNotifier now batches notifications within a microtask by default. Multiple updates to the same path result in a single notification with the final value.
- `getPathNotifier().flushSync()` - Force synchronous flush of pending notifications
- `getPathNotifier().onFlush(callback)` - Subscribe to flush-complete events (useful for time-travel, devtools)
- `signalTree(state, { batching: false })` - Opt-out of automatic batching

### Changed

- Time-travel enhancer now records one snapshot per flush batch (instead of per-update)

### Migration

Tests that assert on immediate subscriber callbacks need updating:

```typescript
// Before
tree.$.count.set(5);
expect(subscriber).toHaveBeenCalled();

// After (option 1)
tree.$.count.set(5);
await Promise.resolve();
expect(subscriber).toHaveBeenCalled();

// After (option 2)
tree.$.count.set(5);
getPathNotifier().flushSync();
expect(subscriber).toHaveBeenCalled();
```

## 6.2.1 (2026-01-04)

### 🐛 Bug Fixes

- **core:** Preserve `.with()` method through enhancer chains - wrapper-creating enhancers (batching, devTools, timeTravel) now correctly pass the enhanced tree to subsequent enhancers
- **time-travel:** Handle `structuredClone` failure for states containing functions (e.g., entityMap's `idKey`) - falls back to JSON serialization

### 📖 Details

The `.with()` chaining bug occurred because enhancers that create wrapper functions (like batching) were copying the `.with()` method from the original tree. The closure inside `.with()` still referenced the original tree, so subsequent enhancers received an un-enhanced tree and lost methods from previous enhancers.

**Before (broken):**

```typescript
tree.with(batching()).with(devTools()); // devTools receives un-batched tree!
```

**After (fixed):**

```typescript
tree.with(batching()).with(devTools()); // devTools receives batched tree ✅
```

---

## 6.2.0 (2026-01-03)

### ⚠️ BREAKING CHANGES

- **batching:** Removed deprecated BatchingConfig options:
  - `debounceMs` - use `notificationDelayMs` instead
  - `maxBatchSize` - no longer used (signal writes are synchronous)
  - `autoFlushDelay` - was alias for `debounceMs`
  - `batchTimeoutMs` - was alias for `debounceMs`
- **batching:** Backwards compatibility fallbacks removed - users **must** update to use `notificationDelayMs`

### 📖 Migration

```typescript
// Before (deprecated)
tree.with(batching({ debounceMs: 16 }));
tree.with(batching({ maxBatchSize: 100 })); // maxBatchSize is ignored
tree.with(batching({ autoFlushDelay: 50 }));

// After
tree.with(batching({ notificationDelayMs: 16 }));
tree.with(batching()); // No config needed for default behavior
```

**Note:** `debounceMs` in other configs (`PersistenceConfig`, `FieldConfig`) remains valid - only `BatchingConfig` options were removed.

---

## 6.1.0 (2026-01-03)

### ⚠️ BREAKING CHANGES (Behavior)

- **batching:** Signal writes are now **synchronous** - values update immediately when `.set()` is called
  - This is a **breaking behavioral change** but aligns with Angular's signal contract
  - Only change detection notifications are batched to microtask
  - Read-after-write patterns now work correctly without workarounds

### ✨ Features

- **batching:** Add `coalesce()` method for deduplicating rapid same-path updates
  - Use for high-frequency updates (typing, dragging, etc.)
  - Only the final value for each path is written
- **batching:** Add `hasPendingNotifications()` method to check CD notification queue
- **batching:** Add `flushNotifications()` method for manual CD notification flush
- **batching:** Add `notificationDelayMs` config option (replaces `debounceMs`)

### 🗑️ Deprecated

- `flushBatchedUpdates()` - use `tree.flushNotifications()` instead
- `hasPendingUpdates()` - use `tree.hasPendingNotifications()` instead
- `getBatchQueueSize()` - no longer relevant (writes are synchronous)
- `debounceMs` config - use `notificationDelayMs` instead
- `transaction()` - removed (no longer needed since writes are synchronous)

### 📖 Migration

```typescript
// Before: required setTimeout or transaction() for read-after-write
tree.$.selected.haulerId.set(5);
setTimeout(() => {
  const trucks = tree.$.selectableTrucks();
}, 0);

// After: just works™
tree.$.selected.haulerId.set(5);
const trucks = tree.$.selectableTrucks(); // Immediate ✅
```

### 🎯 Design Philosophy

The batching enhancer now aligns with Angular's signal contract:

- `signal.set(x)` updates the value **immediately**
- `signal()` **always** returns the current value
- Effects and change detection run on microtask

This means `batch()` only affects **when** change detection is notified, not **when** values update.

## 6.0.0 (2025-12-31)

### 🩹 Fixes

- **perf:** Fix TDZ bug in `entity-crud-performance.js` benchmark script
  - Resolved a temporal dead zone (TDZ) ReferenceError that prevented performance benchmarks from running during release validation
  - Ensures all performance and release scripts execute successfully

### 🧹 Chores

- Bump all package versions to 6.0.0 after benchmark script fix

## 5.1.5 (2025-01-13)

### 🗑️ Removed

- **core:** Remove `tree.entities()` method from `entities` enhancer
  - The `entities()` method was redundant and confusing - use direct property access instead
  - `tree.entities()` → `tree` (direct access to entity signals)
  - Updated all documentation and examples to reflect this change
  - This simplifies the API and removes unnecessary abstraction

### 📚 Documentation

- **docs:** Add SignalTree architecture guide explaining recommended patterns
- **docs:** Add recommended architecture demo showcasing best practices
- **docs:** Update all documentation to reflect `tree.entities()` removal

### 🛠️ Internal

- **core:** Clean up unused entities method implementation
- **perf:** Fix signal usage in performance scripts after API changes

## 5.1.3 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix EntitySignal API consistency - properties return signals directly
  - Changed `EntitySignal<E, K>` interface from method-based (`all(): Signal<E[]>`) to property-based (`all: Signal<E[]>`)
  - Updated runtime type guards and all usage throughout codebase
  - Fixed API inconsistency where interface declared methods but implementation used getters
  - All entity query properties (`all`, `count`, `ids`, `isEmpty`, `map`) now consistently return signals directly

## 5.1.2 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix npm package publishing - include dist/ and src/ directories
  - Previous publish was missing the actual JavaScript and TypeScript declaration files
  - Package now correctly includes all required files for installation

## 5.1.1 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix EntityMapMarker preservation in lazy signal trees
  - `createLazySignalTree` now preserves `EntityMapMarker` objects instead of wrapping them in proxies
  - This fixes runtime errors where `$.trucks.byId()` was undefined because entity maps weren't materialized
  - Entity maps are now correctly converted to `EntitySignal` instances by `entities()`

## 5.2.0 (2025-12-16)

### 🗑️ Removed

- **core:** Remove `SignalTreeWithBase<T, Constraint>` and `ConstraintAwareTreeNode<T, Constraint>`
  - These were workarounds for using SignalTree with NgRx-style generic enhancers
  - SignalTree is designed for direct state management, not generic enhancer composition
  - Use concrete types with SignalTree instead of generic enhancer patterns
  - If you need reusable patterns, define methods alongside your tree, not as generic enhancers

### 📖 Philosophy

SignalTree is intentionally simple: create a tree, access nested signals directly.
The NgRx-style `withFeature()` enhancer pattern introduces unnecessary abstraction
and TypeScript complexity. Instead:

```typescript
// ✅ SignalTree way: direct and simple
const tree = signalTree({ loading: { state: 'idle', error: null } });
const loadAll$ = () => {
  tree.$.loading.state.set('loading');
  return service.load$().pipe(
    tap(data => tree.$.loading.state.set('loaded')),
    catchError(err => { tree.$.loading.error.set(err); return EMPTY; })
  );
};
return { tree, loadAll$ };

// ❌ Avoid: NgRx-style generic enhancers
function withServiceRead<T extends BaseState>(tree: ISignalTree<T>) { ... }
```

## 5.1.6 (2025-12-29)

### 🚀 Changes

- **core:** Rename enhancer factory helpers from `withX()` to short factories (e.g. `batching()` → `batching()`)
  - Updated demo, examples and tests to use the new factory names
  - Added compatibility alias exports to preserve `with*` names for consumers

### 🛠️ Validation

- **ci:** Fixes and updates to demo build and validation scripts
  - Rebuilt demo assets and updated example imports
  - Updated test fixtures and committed validation fixes

## 5.1.0 (2025-12-16)

### 🚀 Features

- **core:** Add `EntityMapMarker` unique symbol brand for nominal typing

  - Prevents regular objects from structurally matching EntityMapMarker
  - Improves type inference in generic contexts

- **core:** Export additional utility types: `CallableWritableSignal`, `AccessibleNode`, `NodeAccessor`

### 🩹 Fixes

- **core:** Remove index signature from `SignalTree<T>` type

  - Removed `& Record<string, unknown>` that caused `.with()` bracket notation requirement
  - Enables clean dot notation: `tree.with(enhancer)` without bracket notation
  - Enhancers must now explicitly type their return values (better practice anyway)
  - Fixes TS4111 error with `noPropertyAccessFromIndexSignature: true`

- **core:** Fix TreeNode conditional types to prevent distribution over generics
  - Wrap conditional checks in `[T[K]] extends [...]` to prevent distributive behavior

## 5.0.9 (2025-12-16)

### 🩹 Fixes

- **core:** Make `TreeNode<T>` entity-aware by default
  - Add `__isEntityMap` check to `TreeNode<T>` conditional type
  - Entity markers (`entityMap<E>()`) are now treated as leaves, not recursively expanded
  - Fixes type inference when using `signalTree()` with `entityMap()` in initial state
  - No longer requires explicit generic parameter for correct type inference

## 5.0.8 (2025-12-16)

### 🩹 Fixes

- **core:** Ensure postbuild runs during release (skip Nx cache)
  - Add `cache: false` to postbuild target
  - Add `--skip-nx-cache` to release script postbuild step
  - 5.0.7 was cached and skipped the fix

## 5.0.7 (2025-12-16)

### 🩹 Fixes

- **core:** Actually run fix-dts-imports in nx postbuild target
  - Updated core project.json to run the fix script after build
  - 5.0.6 had the script but didn't wire it to the build pipeline

## 5.0.6 (2025-12-16)

### 🩹 Fixes

- **core:** Fix broken type declarations referencing unpublished `@signaltree/shared`
  - Type declarations now inline shared utility types instead of importing them
  - Fixes TypeScript resolution errors when using `@signaltree/core` in consuming projects
  - Added `fix:dts-imports` post-build step to automatically fix type declarations

## 5.0.5 (2025-12-16)

### 🩹 Fixes

- **core:** Fix type inference for `.with()` method chaining
  - Moved index signature from inline `[key: string]: unknown` to intersection `& Record<string, unknown>`
  - Explicit properties like `with`, `state`, `$` now take precedence over index signature
  - Enables dot notation access: `tree.with(enhancer)` instead of `tree['with'](enhancer)`
  - Resolves TS4111: "Property 'with' comes from an index signature"
- **core:** Remove duplicate `entityMap()` function from entity-signal.ts
  - The correct implementation in types.ts returns `EntityMapMarker<E, K>` for proper type inference
  - Removed redundant implementation that returned `unknown`

## 5.0.2 (2025-12-15)

### 🧹 Chores

- Align internal package versions (`shared`, `types`, `utils`) to 5.0.2 to match published artifacts.
- Update release automation: make git tagging idempotent and avoid rollbacks after successful publish.

### 🩹 Fixes

- No user-facing code changes; release process hardening only.

## 5.0.1 (2025-12-15)

### 🩹 Fixes

- Ensure main barrel entrypoints are emitted for packages using Rollup preserveModules (ng-forms, guardrails, callable-syntax) so `dist/index.js` is always present.
- Broaden Angular peer dependency range to `^20.0.0` across all packages to avoid peer conflicts with Angular 21/22 while keeping Angular 20 compatibility.

### 🧹 Chores

- Format Rollup config files and project metadata for consistency.

## 5.0.0 (2025-12-10)

### 💥 BREAKING CHANGES

- **core:** entity system redesigned with marker-based API
  - Replaced `tree.entities<E>(path)` with `entityMap()` in state definition
  - Now accessed via `store.$.fieldName.method()` instead of `helpers.method()`
  - Path-based entity access removed (use direct `$` access instead)
  - Entity helpers API (`setAll`, `addOne`, `byId`, etc.) now reactive signals
  - See RELEASE_v5.0.md for detailed migration guide

### 🚀 Features

- **core:** marker-based entity system with EntitySignal API

  - `EntityMapMarker<T, ID>` type for compile-time safety
  - Full TypeScript support with recursive type inference (20+ nesting levels)
  - Reactive CRUD operations: `setAll()`, `addOne()`, `updateOne()`, `removeOne()`
  - Type-safe computed selectors: `where()`, `byId()`, `count()`, `all()`
  - Observable patterns for reactive queries

- **core:** PathNotifier integration for reactive mutation tracking

  - Internal path-level change tracking for computed selectors
  - Minimal overhead with synchronous and batch operation support
  - Enables advanced reactive patterns without proxy overhead

- **core:** consolidated entity architecture

  - All entity logic unified under single enhancer
  - No separate entity package required
  - Reduced bundle duplication across ecosystem
  - Simplified mental model: entities = state slice with methods

- **core:** enhanced type system

  - Recursive type inference up to 20+ nesting levels
  - Entity marker types for compile-time safety
  - Improved parameter inference for enhancers
  - Full IntelliSense support in editors

- **core:** improved enhancer composition
  - Metadata-driven enhancer ordering system
  - Cleaner `requires`/`provides` declarations
  - Better initialization sequencing
  - Reduced inter-enhancer ordering bugs

### 📊 Performance Improvements

- **Entity operations** (map-based vs array-based)

  - Add single item: +49.4% throughput (12M → 24M ops/sec)
  - Update single item: +60.1% faster execution
  - Lookup by ID: native Map performance (parity with v4.2.1)
  - Remove single item: parity maintained
  - Initial load (setAll 1000 items): +3.5% improvement

- **Bundle size optimization**
  - Consolidated entity architecture reduces duplication
  - 15.9% reduction in total ecosystem size vs separate-package layout
  - Tree-shakeable enhancer exports
  - Minimal PathNotifier overhead

### 📚 Documentation

- New `QUICK_START.md` with step-by-step v5.0 examples
- Updated `QUICK_REFERENCE.md` with EntitySignal API
- Migration guide in RELEASE_v5.0.md
- Moved ARCHITECTURE.md to `docs/ARCHITECTURE.md` for better organization
- Enhanced USAGE_EXAMPLES.md with entity patterns
- NEW: `docs/V5_ENTITY_PERFORMANCE_ANALYSIS.md` for entity perf guidance

### 🩹 Fixes

- Remove circular import in types.ts ([5ed4601](https://github.com/JBorgia/signaltree/commit/5ed4601))
- Add depth limit to DeepPath type to prevent TypeScript infinite recursion ([90e0816](https://github.com/JBorgia/signaltree/commit/90e0816))
- Exclude demo from release pre-build command ([61c7ea8](https://github.com/JBorgia/signaltree/commit/61c7ea8))

### ❤️ Thank You

- Borgia

## 4.2.0 (2025-12-04)

### 🚀 Features

- add support for nested entity paths with dot notation ([e0bef8d](https://github.com/JBorgia/signaltree/commit/e0bef8d))

### 🩹 Fixes

- remove circular import in types.ts ([5ed4601](https://github.com/JBorgia/signaltree/commit/5ed4601))
- add depth limit to DeepPath type to prevent TypeScript infinite recursion ([90e0816](https://github.com/JBorgia/signaltree/commit/90e0816))
- revert entities signature to keyof T for type safety while maintaining runtime nested path support ([28885d3](https://github.com/JBorgia/signaltree/commit/28885d3))
- exclude demo from release pre-build command ([61c7ea8](https://github.com/JBorgia/signaltree/commit/61c7ea8))

### ❤️ Thank You

- Borgia

# Changelog

## Unreleased

### 🚀 Features

- **core:** add support for nested entity paths with dot notation
  - Entities can now be accessed using paths like `tree.entities<User>('app.data.users')`
  - Added `DeepPath<T>` type to enumerate all valid nested array paths
  - Added `DeepAccess<T, Path>` type for type-safe path resolution
  - Backward compatible - top-level keys work exactly as before
  - Performance: ~100-500ns overhead on initialization, memoized thereafter
  - Enables better state organization for domain-driven architectures

### 🔥 Refactoring

- **core:** remove non-functional asyncAction stub and update documentation
  - Removed `tree.asyncAction()` method (was returning empty object)
  - Removed `AsyncActionConfig` and `AsyncAction` type interfaces
  - Updated all documentation to use manual async patterns with `tree.$.loading.set()`
  - Better alternatives: manual async, `createAsyncOperation()`, or `trackAsync()` helpers

## 4.1.7 (2025-12-04)

### 🩹 Fixes

- **core,enterprise:** add types subpath condition to exports field ([57d101f](https://github.com/JBorgia/signaltree/commit/57d101f))
- **guardrails:** update peerDependency to @signaltree/core 4.1.6 ([4e05a85](https://github.com/JBorgia/signaltree/commit/4e05a85))

### ❤️ Thank You

- Borgia

## 4.1.6 (2025-12-04)

### 🚀 Features

- add automated version injection for demo app ([b209d34](https://github.com/JBorgia/signaltree/commit/b209d34))
- add GitHub and npm links to navigation menu ([ec366c6](https://github.com/JBorgia/signaltree/commit/ec366c6))
- **demo:** add automated version constant generator and integrate in navigation ([311d50b](https://github.com/JBorgia/signaltree/commit/311d50b))

### 🩹 Fixes

- **demo:** update displayed SignalTree versions to 4.1.5 ([22d28d6](https://github.com/JBorgia/signaltree/commit/22d28d6))
- **ng-forms:** add proper type declarations and ESM configuration to package.json ([885769f](https://github.com/JBorgia/signaltree/commit/885769f))

### ❤️ Thank You

- Borgia

## 4.1.5 (2025-11-30)

### 🚀 Features

- **benchmarks:** add contextual explanations for enterprise, rapid updates, and subscriber scaling ([94ad851](https://github.com/JBorgia/signaltree/commit/94ad851))

### 🩹 Fixes

- move jest-preset-angular to devDependencies in ng-forms ([a4d7c8c](https://github.com/JBorgia/signaltree/commit/a4d7c8c))
- ignore jest-preset-angular in ng-forms dependency checks ([cc837c8](https://github.com/JBorgia/signaltree/commit/cc837c8))
- remove outdated ng-forms special case in declaration verification ([a08a941](https://github.com/JBorgia/signaltree/commit/a08a941))
- use hardcoded version in navigation component ([d679a15](https://github.com/JBorgia/signaltree/commit/d679a15))
- **benchmarks:** rename 'Large History Size' to 'History Buffer Scaling' for consistency ([a267852](https://github.com/JBorgia/signaltree/commit/a267852))
- **benchmarks:** align rank badges and enterprise badges in results table ([2041375](https://github.com/JBorgia/signaltree/commit/2041375))
- **demo:** use relative logo paths for GitHub Pages subfolder deployment ([318fb22](https://github.com/JBorgia/signaltree/commit/318fb22))
- **demo:** use relative asset paths for documentation README files ([ad3f3eb](https://github.com/JBorgia/signaltree/commit/ad3f3eb))

### ❤️ Thank You

- Borgia

## 4.1.4 (2025-11-28)

### 🚀 Features

- **demo:** add value propositions to all demo pages ([2024c32](https://github.com/JBorgia/signaltree/commit/2024c32))

### 🩹 Fixes

- **demo:** escape curly braces in ng-forms template code block ([98ab328](https://github.com/JBorgia/signaltree/commit/98ab328))
- **demo:** improve benchmark comparison display and update enterprise enhancer page ([526a72e](https://github.com/JBorgia/signaltree/commit/526a72e))
- **demo:** use correct SignalTree callable API instead of non-existent setState method ([15a5547](https://github.com/JBorgia/signaltree/commit/15a5547))

### 🔥 Performance

- **enterprise:** fix large array regression by simplifying diff; guard instrumentation in PathIndex/Scheduler; middleware no-mutation fast path; UI: add scoring formula spacing\n\n- Remove suffix/segmentation array heuristics; keep prefix + whole-array\n- Add PathIndex.enableInstrumentation + setInstrumentation(); guard metrics\n- Guard Scheduler metrics and performance.now() under instrumentation flag\n- Implement middleware no-mutation fast path in core\n- Update demo scoring formula spacing and benchmark text\n- Rebuild enterprise/core; validations pending ([aa75653](https://github.com/JBorgia/signaltree/commit/aa75653))

### ❤️ Thank You

- Borgia

## 4.1.3 (2025-11-21)

### 🚀 Features

- enable automatic benchmark saving without consent requirement ([a8bf071](https://github.com/JBorgia/signaltree/commit/a8bf071))
- Add SignalTree logo and improve demo UX ([66564d5](https://github.com/JBorgia/signaltree/commit/66564d5))
- complete Phase 0 - baseline preparation and shared utilities ([afcbacf](https://github.com/JBorgia/signaltree/commit/afcbacf))
- add package deprecation tooling and migration guide ([a14072a](https://github.com/JBorgia/signaltree/commit/a14072a))
- add OTP support to deprecation script ([9d2913f](https://github.com/JBorgia/signaltree/commit/9d2913f))
- prepare @signaltree/enterprise for npm publication ([1a78a43](https://github.com/JBorgia/signaltree/commit/1a78a43))
- enhance benchmark details dialog with better formatting ([01e43ad](https://github.com/JBorgia/signaltree/commit/01e43ad))
- always show signaltree as first column in benchmark tables ([f383955](https://github.com/JBorgia/signaltree/commit/f383955))
- add comprehensive pre-publish validation and release process automation ([ed84bc0](https://github.com/JBorgia/signaltree/commit/ed84bc0))
- add comprehensive .cursorrules for AI context preloading ([c07695e](https://github.com/JBorgia/signaltree/commit/c07695e))
- **core:** implement SignalMemoryManager with WeakRef and FinalizationRegistry ([3b3be73](https://github.com/JBorgia/signaltree/commit/3b3be73))
- **core:** integrate SignalMemoryManager with lazy trees ([88f92c3](https://github.com/JBorgia/signaltree/commit/88f92c3))
- **demo:** comprehensive demo pages overhaul ([6251ee8](https://github.com/JBorgia/signaltree/commit/6251ee8))
- **demo,core:** Angular Signal Forms demo polish and reactive slice sync ([43b43a6](https://github.com/JBorgia/signaltree/commit/43b43a6))
- **demo/fundamentals:** pin What's New card first and keep stable ordering ([962802f](https://github.com/JBorgia/signaltree/commit/962802f))
- **performance:** add PathIndex, DiffEngine, and OptimizedUpdateEngine ([8db34a3](https://github.com/JBorgia/signaltree/commit/8db34a3))
- **phase2:** complete Phase 2 Performance Architecture implementation ([d3df6c7](https://github.com/JBorgia/signaltree/commit/d3df6c7))
- **security:** add SecurityValidator with function blocking ([590bf83](https://github.com/JBorgia/signaltree/commit/590bf83))
- **security:** integrate SecurityValidator into signalTree ([bde199f](https://github.com/JBorgia/signaltree/commit/bde199f))
- **size:** add size claim verification to prevent barrel-only measurements ([1ca8b59](https://github.com/JBorgia/signaltree/commit/1ca8b59))

### 🩹 Fixes

- update GitHub Packages publishing and repository URLs ([50cbbee](https://github.com/JBorgia/signaltree/commit/50cbbee))
- update GitHub Packages publishing and repository URLs ([d471d93](https://github.com/JBorgia/signaltree/commit/d471d93))
- update Node.js version to 20 and clear Nx cache in CI workflow ([95fe516](https://github.com/JBorgia/signaltree/commit/95fe516))
- improve CI build reliability - explicit production config, disable daemon, add debugging ([1d9fcae](https://github.com/JBorgia/signaltree/commit/1d9fcae))
- correct Nx build and test commands in release script ([07272a8](https://github.com/JBorgia/signaltree/commit/07272a8))
- update outdated version and bundle size information ([d2ff81a](https://github.com/JBorgia/signaltree/commit/d2ff81a))
- correct benchmark duration calculation ([952a490](https://github.com/JBorgia/signaltree/commit/952a490))
- Remove white background from SVG logo and improve sizing ([bcb7aee](https://github.com/JBorgia/signaltree/commit/bcb7aee))
- Reduce hero logo size for better proportions ([599dead](https://github.com/JBorgia/signaltree/commit/599dead))
- resolve npm publishing issues and update to v4.0.1 ([f750e8c](https://github.com/JBorgia/signaltree/commit/f750e8c))
- correct SCSS import paths for new example components ([935fb3c](https://github.com/JBorgia/signaltree/commit/935fb3c))
- update deprecation script for bash 3 compatibility ([4b17fcf](https://github.com/JBorgia/signaltree/commit/4b17fcf))
- remove progressive-rpg-demo component references and fix TS config ([11efa05](https://github.com/JBorgia/signaltree/commit/11efa05))
- update release script to only publish existing packages ([072286e](https://github.com/JBorgia/signaltree/commit/072286e))
- correct file paths in sanity checks script ([8ff6459](https://github.com/JBorgia/signaltree/commit/8ff6459))
- update build scripts to reflect v4.0.0+ package consolidation ([1034ab2](https://github.com/JBorgia/signaltree/commit/1034ab2))
- correct package.json export paths for enterprise and callable-syntax ([ebcb5c5](https://github.com/JBorgia/signaltree/commit/ebcb5c5))
- resolve build issues for callable-syntax and ng-forms packages ([05b0631](https://github.com/JBorgia/signaltree/commit/05b0631))
- resolve linter errors for release ([426c2b1](https://github.com/JBorgia/signaltree/commit/426c2b1))
- transform benchmark data structure for table display ([1e99626](https://github.com/JBorgia/signaltree/commit/1e99626))
- prioritize fallback data for benchmark details ([04a905f](https://github.com/JBorgia/signaltree/commit/04a905f))
- modal backdrop now displays as overlay instead of inline ([ae2d7ed](https://github.com/JBorgia/signaltree/commit/ae2d7ed))
- disable view encapsulation for modal to display as overlay ([d50dc22](https://github.com/JBorgia/signaltree/commit/d50dc22))
- correct data structure for benchmark details modal ([c3cb5ea](https://github.com/JBorgia/signaltree/commit/c3cb5ea))
- add fallback background colors to modal dialog ([#1](https://github.com/JBorgia/signaltree/issues/1))
- use light background for modal dialog ([25166a8](https://github.com/JBorgia/signaltree/commit/25166a8))
- prevent modal CSS variables from affecting table styles ([#212121](https://github.com/JBorgia/signaltree/issues/212121))
- ensure close button is perfectly round ([63035eb](https://github.com/JBorgia/signaltree/commit/63035eb))
- replace all CSS variables with explicit light theme colors in modal ([#212121](https://github.com/JBorgia/signaltree/issues/212121), [#757575](https://github.com/JBorgia/signaltree/issues/757575), [#1976](https://github.com/JBorgia/signaltree/issues/1976))
- remove @signaltree/shared from runtime dependencies ([0c4f957](https://github.com/JBorgia/signaltree/commit/0c4f957))
- add @signaltree/core devDependency to enterprise and fix ng-forms tsconfig paths ([1a4dcaf](https://github.com/JBorgia/signaltree/commit/1a4dcaf))
- update validation scripts to use correct npm scripts ([1b76809](https://github.com/JBorgia/signaltree/commit/1b76809))
- resolve linting errors for pre-publish validation ([915d7c7](https://github.com/JBorgia/signaltree/commit/915d7c7))
- improve PathIndex performance test reliability ([9e8574f](https://github.com/JBorgia/signaltree/commit/9e8574f))
- correct TypeScript path mappings for production builds ([8a71270](https://github.com/JBorgia/signaltree/commit/8a71270))
- correct dist path for TypeScript module resolution ([097959b](https://github.com/JBorgia/signaltree/commit/097959b))
- exclude packages with peer dependencies from pre-publish validation builds ([8bdd003](https://github.com/JBorgia/signaltree/commit/8bdd003))
- update verify-dist script to match actual dist directory structure ([9a680aa](https://github.com/JBorgia/signaltree/commit/9a680aa))
- rewrite verify-dist script to handle both Nx and tsup output structures ([13a7b73](https://github.com/JBorgia/signaltree/commit/13a7b73))
- replace duplicate dist verification logic with call to verify-dist.sh ([7382fb5](https://github.com/JBorgia/signaltree/commit/7382fb5))
- handle missing timeout command on macOS in validation script ([1548f3d](https://github.com/JBorgia/signaltree/commit/1548f3d))
- skip performance benchmarks during validation ([6ebeea2](https://github.com/JBorgia/signaltree/commit/6ebeea2))
- use gtimeout for performance benchmarks on macOS ([4d81cd9](https://github.com/JBorgia/signaltree/commit/4d81cd9))
- remove duplicate TypeScript path mappings that broke SWC ([bc9136f](https://github.com/JBorgia/signaltree/commit/bc9136f))
- improve .gitignore patterns for coverage and artifacts ([5878e7c](https://github.com/JBorgia/signaltree/commit/5878e7c))
- make bundle analysis and performance benchmarks non-blocking ([b3d891a](https://github.com/JBorgia/signaltree/commit/b3d891a))
- override types in guardrails tsconfig to exclude Angular ([c678c91](https://github.com/JBorgia/signaltree/commit/c678c91))
- add TestBed.flushEffects() to fix flaky ng-forms test ([1573b27](https://github.com/JBorgia/signaltree/commit/1573b27))
- add TestBed import for ng-forms test ([cb859b4](https://github.com/JBorgia/signaltree/commit/cb859b4))
- use async/await with setTimeout for ng-forms test instead of TestBed ([c2debb0](https://github.com/JBorgia/signaltree/commit/c2debb0))
- update ng-forms reset test to check form control values instead of signals ([6834db8](https://github.com/JBorgia/signaltree/commit/6834db8))
- remove build-time dependencies from core peerDependencies ([82468cf](https://github.com/JBorgia/signaltree/commit/82468cf))
- ignore rollup packages in dependency-checks lint rule ([b004374](https://github.com/JBorgia/signaltree/commit/b004374))
- remove unnecessary TestBed usage from core tests ([5d11d0f](https://github.com/JBorgia/signaltree/commit/5d11d0f))
- add jest-preset-angular to ignored dependencies in lint config ([8334682](https://github.com/JBorgia/signaltree/commit/8334682))
- apply type declaration fix to all Rollup-built packages + documentation ([d39f81b](https://github.com/JBorgia/signaltree/commit/d39f81b))
- **build:** disable declaration generation to prevent stray .d.ts files ([2b469c6](https://github.com/JBorgia/signaltree/commit/2b469c6))
- **build:** add post-build cleanup for stray .d.ts files ([5f0596b](https://github.com/JBorgia/signaltree/commit/5f0596b))
- **core:** exclude stray dist/\*.d.ts files that conflicted with type resolution ([9e1286e](https://github.com/JBorgia/signaltree/commit/9e1286e))
- **demo:** update home page with correct package installation instructions ([a36477c](https://github.com/JBorgia/signaltree/commit/a36477c))
- **demo:** fix lint errors in ng-forms demo ([948ba76](https://github.com/JBorgia/signaltree/commit/948ba76))
- **enterprise:** remove duplicate WeakRef declaration ([d162bdf](https://github.com/JBorgia/signaltree/commit/d162bdf))
- **ng-forms:** fix conditional field synchronization with nested objects ([8e58e31](https://github.com/JBorgia/signaltree/commit/8e58e31))
- **ng-forms): nested signal path traversal bug chore(build): align declaration layout with Nx preserveModules design chore(validation:** update scripts for src-based d.ts structure ([627551d](https://github.com/JBorgia/signaltree/commit/627551d))
- **phase2:** correct buildFromTree signal detection - reorder type checks ([1451b17](https://github.com/JBorgia/signaltree/commit/1451b17))
- **size:** update size claims to match actual measured values - core ~27KB, enterprise ~7KB, shared ~3.8KB ([f63dc3c](https://github.com/JBorgia/signaltree/commit/f63dc3c))
- **tree-shaking:** verify barrel imports are tree-shakeable, update guidance ([ed6f28e](https://github.com/JBorgia/signaltree/commit/ed6f28e))

### 🔥 Performance

- improve measurement robustness (non-zero medians & hrtime batching) ([b2ae452](https://github.com/JBorgia/signaltree/commit/b2ae452))

### ❤️ Thank You

- Borgia

## 4.1.2 (2025-11-21)

### 🩹 Fixes

- **build:** disable declaration generation to prevent stray .d.ts files ([52d70b7](https://github.com/JBorgia/signaltree/commit/52d70b7))
- **build:** add post-build cleanup for stray .d.ts files ([3ac04f2](https://github.com/JBorgia/signaltree/commit/3ac04f2))
- **demo:** fix lint errors in ng-forms demo ([1d2a7ca](https://github.com/JBorgia/signaltree/commit/1d2a7ca))
- **ng-forms:** fix conditional field synchronization with nested objects ([ce3ec52](https://github.com/JBorgia/signaltree/commit/ce3ec52))
- **ng-forms): nested signal path traversal bug chore(build): align declaration layout with Nx preserveModules design chore(validation:** update scripts for src-based d.ts structure ([816f49c](https://github.com/JBorgia/signaltree/commit/816f49c))

### ❤️ Thank You

- Borgia

## 4.1.1 (2025-11-20)

### 🩹 Fixes

- apply type declaration fix to all Rollup-built packages + documentation ([d39f81b](https://github.com/JBorgia/signaltree/commit/d39f81b))
- **core:** exclude stray dist/\*.d.ts files that conflicted with type resolution ([9e1286e](https://github.com/JBorgia/signaltree/commit/9e1286e))

### ❤️ Thank You

- Borgia

# Changelog

All notable changes to SignalTree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2025-11-18

### Changed

- Migrated all publishable SignalTree packages (`core`, `enterprise`, `callable-syntax`, `guardrails`, `ng-forms`) to the Nx Rollup executor with `preserveModules` output for reliable ESM distribution and tree-shaking.
- Updated guardrails distribution to ship pure ESM entry points with consistent conditional exports and a generated production `noop` module.
- Regenerated package manifests and build graphs so published packages reference Rollup artifacts directly and pull types from source to match preserved module layout.

### Added

- Introduced `tools/build/create-rollup-config.mjs`, centralizing shared Rollup options across libraries.
- Expanded bundle analysis tooling to validate the new dist layouts and enforce gzipped/ungzipped thresholds for every published facade.

### Removed

- Retired the legacy `tsup` build for guardrails and eliminated redundant docs package manifests that previously shadowed published packages.

## [4.0.14] - 2025-11-13

### Fixed

- **Peer Dependencies**: Removed build-time dependencies (rollup packages, jest-preset-angular) from `@signaltree/core` peerDependencies
  - Users no longer need `--legacy-peer-deps` flag to install SignalTree
  - Changed `tslib` from `"*"` to `"^2.0.0"` for more flexible version range
  - Only runtime dependencies (`@angular/core`, `tslib`) are now required as peers

### Added

- **Documentation**: Added comprehensive "Companion Packages" section to `@signaltree/core` README
  - Detailed descriptions of `@signaltree/ng-forms`, `@signaltree/enterprise`, `@signaltree/guardrails`, and `@signaltree/callable-syntax`
  - Installation instructions, features, bundle impact, and when to use each package
  - Package selection guide with typical installation patterns

### Fixed

- Fixed flaky ng-forms test by updating form reset test to check form control values
- Fixed guardrails TypeScript configuration to exclude Angular types
- Removed unnecessary TestBed usage from core enhancer tests

## [4.0.13] - 2025-11-13

### Fixed

- **Peer Dependencies**: Removed build-time dependencies (rollup packages, jest-preset-angular) from `@signaltree/core` peerDependencies
  - Users no longer need `--legacy-peer-deps` flag to install SignalTree
  - Changed `tslib` from `"*"` to `"^2.0.0"` for more flexible version range
  - Only runtime dependencies (`@angular/core`, `tslib`) are now required as peers

### Added

- **Documentation**: Added comprehensive "Companion Packages" section to `@signaltree/core` README
  - Detailed descriptions of `@signaltree/ng-forms`, `@signaltree/enterprise`, `@signaltree/guardrails`, and `@signaltree/callable-syntax`
  - Installation instructions, features, bundle impact, and when to use each package
  - Package selection guide with typical installation patterns

### Fixed

- Fixed flaky ng-forms test by updating form reset test to check form control values
- Fixed guardrails TypeScript configuration to exclude Angular types
- Removed unnecessary TestBed usage from core enhancer tests

## [4.0.6] - 2025-01-04

### Changed

- **Version Alignment**: Aligned all packages to v4.0.6 for consistency
  - `@signaltree/core@4.0.6`
  - `@signaltree/ng-forms@4.0.6`
  - `@signaltree/enterprise@4.0.6`
  - `@signaltree/callable-syntax@4.0.6`

### Fixed

- Fixed export paths for `@signaltree/enterprise` and `@signaltree/callable-syntax` packages
- Corrected package.json files array to match build output structure

## [4.0.2] - 2025-11-04

### Added

#### 🏢 @signaltree/enterprise Package (First Publication)

Introduced enterprise-grade optimizations for large-scale applications as a separate optional package.

**Features:**

- **Diff-Based Updates**: Intelligent change detection that only updates what actually changed
- **Bulk Optimization**: 2-5x faster when updating multiple values simultaneously
- **Change Tracking**: Detailed statistics on adds, updates, and deletes
- **Path Indexing**: Debug helper for understanding signal hierarchy
- **Smart Defaults**: Works out-of-the-box with sensible presets

**Use Cases:**

- Real-time dashboards with 500+ signals
- Data grids with thousands of rows
- Enterprise applications with complex state
- High-frequency data feeds (60Hz+)

**Bundle Cost:** +2.4KB gzipped

**Installation:**

```bash
npm install @signaltree/enterprise
```

**Example:**

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(largeState).with(enterprise());
const result = tree.updateOptimized(newData, { ignoreArrayOrder: true });
console.log(result.stats); // { totalChanges: 15, adds: 3, updates: 10, deletes: 2 }
```

### Changed

#### Documentation Updates

- **README.md**: Added enterprise section to Enhancer Guide with comprehensive examples
- **Installation Examples**: Updated to include enterprise package options
- **Migration Notice**: Clarified that enterprise is a separate optional package
- **Package Structure**: Documented enterprise alongside ng-forms and callable-syntax as optional add-ons
- **docs/overview.md**: Added enterprise to package ecosystem section

#### Release Script

- Updated `scripts/release.sh` to include enterprise package in publish workflow
- Removed deprecated packages (batching, memoization, etc.) that were consolidated into core

### Fixed

- Fixed duplicate WeakRef declaration in enterprise package that caused TypeScript compilation errors
- Corrected import paths in enterprise documentation from `@signaltree/core/enterprise` to `@signaltree/enterprise`

### Published Packages

- @signaltree/core@4.0.2 (includes all enhancers + updated README)
- @signaltree/ng-forms@4.0.2 (updated README)
- @signaltree/enterprise@4.0.2 ⭐ **NEW** (first publication)

## [4.0.0] - 2025-11-03

### Added - November 2, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Breaking Change**: All SignalTree enhancers have been consolidated into the `@signaltree/core` package for simplified distribution and better tree-shaking.

##### What Changed

- **Consolidated Distribution**: All enhancers (batching, memoization, devtools, entities, middleware, presets, time-travel) are now exported directly from `@signaltree/core`
- **Simplified Imports**: No need to install separate packages - everything is available from the core package
- **Better Tree-Shaking**: Consolidated exports enable more efficient bundling
- **Single Version**: All features now version-locked together

##### Migration Guide

**Before (separate packages):**

```typescript
import { createSignalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, batching, memoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `batching` from `@signaltree/core`
- `@signaltree/memoization` → Use `memoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Removed in v5; use entity hooks/enhancers
- `@signaltree/presets` → Use preset functions from `@signaltree/core`
- `@signaltree/time-travel` → Use `withTimeTravel` from `@signaltree/core`

##### Publishing Changes

- **Publish Script Updated**: `scripts/publish-all.sh` now only publishes `@signaltree/core` and `@signaltree/ng-forms`
- **Version Synchronization**: All features now share the same version number
- **Simplified Maintenance**: Single package to maintain instead of 8+ separate packages

### Published Packages

Consolidated packages published to v4.0.0:

- @signaltree/core@4.0.0 ⭐ (includes all enhancers: batching, memoization, devtools, entities, middleware, presets, time-travel)
- @signaltree/ng-forms@4.0.0 (Angular forms integration)

### Bundle Size Improvements

- **16.2% reduction** in total bundle size when using multiple enhancers
- **Eliminated duplication** when importing multiple enhancers from separate packages
- **Better tree-shaking** with consolidated exports

## [3.1.0] - 2025-11-02

### Added - October 10, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Note**: This release was initially published as 3.1.0 but has been moved to 3.2.0 due to npm version conflicts. The consolidation changes are identical.

### Added

#### Memoization Presets (@signaltree/memoization)

Added optimized preset configurations for common use cases, ensuring benchmark fairness and transparency:

- `selectorMemoization()` - Fast selector caching (reference equality, 10 entries)
- `computedMemoization()` - Balanced computed properties (shallow equality, 100 entries)
- `withDeepStateMemoization()` - Complex nested state (deep equality, 50 entries, LRU)
- `withHighFrequencyMemoization()` - High-frequency operations (shallow equality, 500 entries, LRU)

**Philosophy**: "Benchmark what you ship, ship what you benchmark" - All performance optimizations used in benchmarks are now publicly available.

#### UI Documentation

Added comprehensive memoization presets documentation to benchmark interface:

- Info card explaining preset configurations
- Code examples for users to replicate benchmark performance
- Performance characteristics for each preset
- Bundle impact and optimization details

### Changed

#### Performance Optimization (@signaltree/memoization)

- **Optimized `shallowEqual()` algorithm**: Replaced `Object.keys()` allocation with `for...in` iteration
  - 15-25% faster shallow equality checks
  - Zero allocations per comparison
  - Improved cache hit performance

#### Benchmark Updates

- Updated SignalTree benchmarks to use public preset functions
- `runSelectorBenchmark()` now uses `selectorMemoization()`
- `runComputedBenchmark()` now uses `computedMemoization()`
- Ensures complete transparency and fairness in performance comparisons

### Published Packages

All packages synchronized to v3.0.2:

- @signaltree/core@3.0.2
- @signaltree/batching@3.0.2
- @signaltree/memoization@3.0.2 ⭐ (includes optimizations and presets)
- @signaltree/middleware@3.0.2
- @signaltree/entities@3.0.2
- @signaltree/devtools@3.0.2
- @signaltree/time-travel@3.0.2
- @signaltree/presets@3.0.2
- @signaltree/ng-forms@3.0.2

### Documentation

- Updated `@signaltree/memoization` README with preset documentation
- Added "What's New in v3.0.2" section to memoization docs
- Updated main README with preset examples and v3.0.2 highlights
- Added performance characteristics table for presets

## [3.1.0] - 2025-11-02

### Added - October 10, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Major Architecture Change**: All SignalTree enhancers have been consolidated into the `@signaltree/core` package for simplified distribution and better tree-shaking.

##### What Changed

- **Consolidated Distribution**: All enhancers (batching, memoization, devtools, entities, middleware, presets, time-travel) are now exported directly from `@signaltree/core`
- **Simplified Imports**: No need to install separate packages - everything is available from the core package
- **Better Tree-Shaking**: Consolidated exports enable more efficient bundling
- **Single Version**: All features now version-locked together

##### Migration Guide

**Before (separate packages):**

```typescript
import { createSignalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, batching, memoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `batching` from `@signaltree/core`
- `@signaltree/memoization` → Use `memoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Removed in v5; use entity hooks/enhancers
- `@signaltree/presets` → Use preset functions from `@signaltree/core`
- `@signaltree/time-travel` → Use `withTimeTravel` from `@signaltree/core`

##### Publishing Changes

- **Publish Script Updated**: `scripts/publish-all.sh` now only publishes `@signaltree/core` and `@signaltree/ng-forms`
- **Version Synchronization**: All features now share the same version number
- **Simplified Maintenance**: Single package to maintain instead of 8+ separate packages

### Published Packages

Consolidated packages published to v3.1.0:

- @signaltree/core@3.1.0 ⭐ (includes all enhancers: batching, memoization, devtools, entities, middleware, presets, time-travel)
- @signaltree/ng-forms@3.0.2 (Angular forms integration)

### Bundle Size Improvements

- **16.2% reduction** in total bundle size when using multiple enhancers
- **Eliminated duplication** when importing multiple enhancers from separate packages
- **Better tree-shaking** with consolidated exports

## [Unreleased]

### Added - October 7, 2025

#### Proper Middleware & Async Workflow Implementations

**Phase 2: Re-Implementation with Actual Library APIs**

After initially removing synthetic implementations, benchmarks have been **properly re-implemented** using actual library middleware/plugin and async APIs.

##### Middleware Benchmarks (3 methods)

- **Re-implemented middleware benchmarks** for NgRx Store, NgXs, and Akita using actual library APIs
- **NgRx Store**: Uses actual `@ngrx/store` meta-reducers with `ActionReducer<T>` wrapper pattern
- **NgXs**: Uses actual `@ngxs/store` NgxsPlugin interface with `handle()` method
- **Akita**: Uses actual `@datorama/akita` Store.akitaPreUpdate() override
- **Impact**: Now measures real middleware overhead using each library's native middleware/plugin architecture

##### Async Workflow Benchmarks (3 methods)

- **Re-implemented async workflow benchmarks** for NgRx Store and NgXs using actual async primitives
- **NgRx Store**: Uses actual `@ngrx/effects` with Actions, ofType, mergeMap, switchMap, race, takeUntil
- **NgXs**: Uses actual `@ngxs/store` Actions observable with ofActionDispatched, ofActionSuccessful
- **Akita/Elf**: Remain as lightweight simulations (intentional - no Effects/Actions systems)
- **Impact**: Now measures real async overhead for libraries with Effects/Actions architectures

**Files Modified**:

- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service.ts`
- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngxs-benchmark.service.ts`
- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/akita-benchmark.service.ts`

**Libraries with Proper Implementations**:

- ✅ **SignalTree**: Native middleware and async (already implemented)
- ✅ **NgRx Store**: Meta-reducers (middleware) + Effects (async) - 6/10 methods complete
- ✅ **NgXs**: Plugins (middleware) + Actions (async) - 6/10 methods complete
- ✅ **Akita**: akitaPreUpdate hooks (middleware) - 3/10 methods complete
- ⚠️ **Elf**: No comparable implementations (0/10)
- ❌ **NgRx SignalStore**: No middleware or async primitives (0/10)

#### Documentation

##### Added

- `ASYNC_WORKFLOW_IMPLEMENTATIONS.md` - Comprehensive documentation of async workflow implementations
- Detailed explanation of NgRx Effects vs NgXs Actions architectures
- Rationale for Akita/Elf lightweight simulations

##### Updated

- `MIDDLEWARE_CLEANUP.md` - Updated to reflect Phase 2 re-implementation
- `middleware-capabilities-analysis.md` - Shows 4 libraries with proper implementations
- `missing-implementations-complete.md` - Updated status: middleware and async both completed
- `CHANGELOG.md` - Comprehensive tracking of implementation phases

### Removed - October 7, 2025 (Phase 1)

#### Synthetic Middleware & Async Implementations

**Phase 1: Initial Removal**

- **Removed synthetic middleware benchmarks** that used trivial function calls instead of actual library APIs
- **Removed synthetic async benchmarks** that used generic `setTimeout`/`Promise.all` instead of actual Effects/Actions
- **Reason**: Synthetic implementations didn't represent actual library architectures and provided misleading performance data
- **Impact**: Temporarily showed only SignalTree with these capabilities (before Phase 2 re-implementation)

**Methodology Note**: Libraries have fundamentally different architectures:

**Middleware Systems**:

- **SignalTree**: Middleware removed in v5; use entity tap/intercept hooks
- **NgRx Store**: Meta-reducers - action interception wrapper pattern
- **NgXs**: Plugin system - action lifecycle hooks
- **Akita**: akitaPreUpdate - state transition hooks
- **Elf**: RxJS operators (different paradigm)
- **NgRx SignalStore**: withHooks - lifecycle only, NOT middleware

**Async Systems**:

- **SignalTree**: Native async capabilities
- **NgRx Store**: `@ngrx/effects` - reactive effect streams
- **NgXs**: Actions observable - action-based async
- **Akita**: Limited (queries/observables)
- **Elf**: Limited (RxJS effects)
- **NgRx SignalStore**: None

---

## Historical Note

This changelog was created on October 7, 2025. Prior changes were not formally tracked in a changelog format but can be found in git commit history.

## [4.0.9] - 2025-11-07

### Added

- Home page now highlights Time Travel debugging and splits feature cards by category using the Angular 18 block syntax helpers.
- Local type shims for cross-package builds (`packages/enterprise/src/types/signaltree-core.d.ts`, `packages/ng-forms/src/types/signaltree-core.d.ts`) so enterprise and ng-forms can compile against the consolidated core sources.

### Changed

- Converted the remaining demo templates to Angular 18 block syntax, including the benchmark orchestrator, entities demo, comparison components, metrics dashboard, and shared navigation.
- Reworked the demo home template to use `@if`/`@for` blocks with guard clauses, added async/time travel sections, and refreshed copy to match the v4 package lineup.
- Updated Sass usage in the fundamentals examples to replace deprecated `darken()` helpers with `color.adjust()` and imported `sass:color` where needed.
- Adjusted Jest and Nx TypeScript configs to resolve `@signaltree/*` imports from source (`apps/demo/jest.config.ts`, enterprise/ng-forms tsconfigs) and declared workspace dev dependencies for local packages in `package.json`.

### Fixed

- Ensured `@signaltree/ng-forms` and `@signaltree/enterprise` builds succeed by referencing Angular core symbols explicitly and mapping core exports during compilation.
- Resolved demo unit tests failing to locate `@signaltree/core` by updating moduleNameMapper settings.
