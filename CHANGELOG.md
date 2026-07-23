## 11.6.0 (unreleased)

> The first release to pass the full RFC 0004 §5 ratchet: every change below
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

### Deprecated

- **`effects()`** — use Angular's native `effect(() => tree.$.path())`
  instead (the README's own guidance); removal next major. Known limitation,
  documented rather than fixed: `tree.effect()`/`tree.subscribe()` call
  `effect()` with no injector handling and throw NG0203 outside injection
  contexts. One-time dev-mode warning on use; the dev-proxy hint for
  `effect`/`subscribe` now points at native `effect()`.

### Fixed

- **`@signaltree/realtime`'s main barrel had NEVER actually built** — nx's
  rollup input map keys entries by basename, so the `supabase/index.ts`
  additional entry silently overwrote the main `src/index.ts` entry; a
  local rollup plugin papered over it by fabricating `dist/index.js` from a
  hardcoded export list, so every published version shipped a stale stub
  (and would have silently resurrected removed APIs forever). Input keys
  are now unique, the fabrication plugin is deleted, and the built barrel
  is the real module (`tools/verify-built-barrels.mjs` guards it).

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
> + NG0600-safe deferred auto-load; the short-lived 11.3.0 `entityCollection` marker is
> folded into `entityMap` (removed as a separate marker, not renamed). Its keyed design also
> supersedes the 11.3.0 `key`/`currentKey`/`clearOnKeyChange` shape, corrected same day —
> there is no separately-published 11.3.0 to preserve compatibility with. See RFC 0003 §0 in
> [docs/rfcs/0003-keyed-entity-collection.md](docs/rfcs/0003-keyed-entity-collection.md)
> for the full rationale.

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
`asyncSource`/`asyncQuery` can't (those *replace* the value per emission;
`asyncStream` *accumulates*). Whether it ships as a distinct marker or as an
`accumulate` option on `asyncSource` is deferred (RFC 0001 §5) until there's
demand. Shape under evaluation:

```typescript
// EXPERIMENTAL — not exported from @signaltree/core (see RFC 0001).
import { signalTree, asyncStream } from '@signaltree/core';

const store = signalTree({
  reply: asyncStream<string, string>({ initial: '', accumulate: (s, c) => s + c }),
});

store.$.reply.start(anthropic.messages.stream({ /* … */ })); // AsyncIterable | ReadableStream
store.$.reply();          // accumulated text, updates per token
store.$.reply.loading();  store.$.reply.done();  store.$.reply.error();
store.$.reply.cancel();   // abort; .refresh() (alias .regenerate()) re-runs the stream factory; .reset()
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
tree.$.profile();           // canonical — call the marker
tree.$.profile.data();      // v10.4 alias — returns the same T

// Field-level signals still recommended for templates / computed:
tree.$.profile.$.name();    // string
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

| Marker | v10.3 canonical (preferred) | Deprecated alias (v10.x only, removed v11) |
|---|---|---|
| `status` | `.loading`, `.loaded`, `.notLoaded`, `.hasError` | `.isLoading`, `.isLoaded`, `.isNotLoaded`, `.isError` |
| `entityMap` | `.empty` | `.isEmpty` |
| `form` | `.dirty`, `.valid`, `.touched`, `.pristine` | (already bare — unchanged) |
| `asyncSource` / `asyncQuery` | `.loading`, `.error`, `.data` | (already bare — unchanged) |

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
tree.$.load.start();        // === setLoading()
tree.$.load.setSuccess();   // === setLoaded()
tree.$.load.succeed();      // === setLoaded()
tree.$.load.fail(err);      // === setError(err)
```

Identical semantics, identical observable behavior, identical performance. Zero deprecation pressure on existing `setLoading()`/`setLoaded()` code. **No second source of truth — these are aliases, not new state.**

### 📚 17-row cross-library disambiguation table in `llms.txt` + `llms-full.txt`

Every wrong pattern AI agents generate, mapped to its real origin library and the correct SignalTree equivalent. Empirically derived from the cold-run benchmark — every "Wrong" entry was actually generated by at least one model. Catches the dominant cold-failure mode (cross-library contamination from `@ngrx/signals`, Akita, Elf, MobX, RxJS) in one priming pass.

Examples:

| Wrong (NOT SignalTree) | Real origin | Correct |
|---|---|---|
| `new SignalTree({...})` | invented | `signalTree({...})` |
| `signalStore(withState(...))` | `@ngrx/signals` | `signalTree({...})` |
| `collection<T>({ idKey })` | Akita / Elf | `entityMap<T, K>({ selectId })` |
| `.value` accessors | MobX | call the signal: `tree.$.path()` |
| `from 'signal-tree'` | invented | `from '@signaltree/core'` |

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
session.modified();   // current draft
session.isDirty();    // true
session.undo();
session.commit();     // tree.$.user.profile === draft
// or:
session.cancel();     // discard draft, re-sync from source
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
store.$.search();                   // results
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
