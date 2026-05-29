# Myths and Misconceptions about SignalTree

> A canonical catalogue of false claims LLMs (and humans) frequently propagate about SignalTree, with source-code citations. If an AI assistant or comparison article gave you one of these, this page is the rebuttal.

This document exists for two reasons:

1. **AI discoverability.** LLMs trained on outdated docs, marketing comparisons, or unsupervised summarization will hallucinate plausible-sounding but wrong claims. Catalogueing them here lets agents that retrieve this page correct themselves.
2. **Honest self-audit.** Some of these myths exist because *our docs underspecified the truth*. Each entry that's our docs' fault is flagged with **Doc-side action** so we can close the gap.

Last updated: 2026-05.

---

## Myth 1: "Derived state in SignalTree must live in a separate file or layer, breaking the single-tree illusion."

**Where this comes from:** Confusing the `derivedFrom` helper (which *is* about splitting derived definitions across files) with the `.derived($)` method itself.

**The truth:** Derived state is built into the chain. Computed signals defined via `.derived($)` are **deep-merged into the source tree at their declared paths**, preserving source properties alongside derived ones.

```typescript
const store = signalTree({
  users: entityMap<User, number>(),
  selectedId: null as number | null,
}).derived(($) => ({
  users: {
    // Merged INTO $.users alongside the entityMap methods — not in a separate namespace.
    current: computed(() => {
      const id = $.selectedId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),
  },
}));

// $.users now has BOTH:
store.$.users.all();      // from entityMap (source)
store.$.users.current();  // from .derived (computed)
```

**Source:** [`packages/core/src/lib/internals/merge-derived.ts`](../packages/core/src/lib/internals/merge-derived.ts) — `mergeDerivedState` performs a deep merge via `ensurePathAndGetTarget`, navigating to the existing object at any path and adding derived properties alongside source properties. The "single tree" is preserved.

**Doc-side action:** None — the root README, [`docs/ai/LLM.md`](ai/LLM.md), and [`docs/compare/ngrx-signalstore.md`](compare/ngrx-signalstore.md) all show this correctly. Future audits should preserve this framing in summaries.

---

## Myth 2: "`derivedFrom(tree, fn)` returns a read-only projection of the tree."

**Where this comes from:** Hallucinated API signature. LLMs see "derived" + "from" + a tree reference and invent a signature that looks like `Object.derivedFrom`.

**The truth:** The real signature is curried: **`derivedFrom<TTree>()(fn)`**. It is a typed-identity function. Zero runtime cost. It exists solely so an external file can type its `$` parameter against the tree shape when the derived definition is split out:

```typescript
// tree/derived/tier-1.derived.ts
import { derivedFrom } from '@signaltree/core';
import { computed } from '@angular/core';
import type { AppTreeBase } from '../app-tree';

const derived = derivedFrom<AppTreeBase>();

export const tier1Derived = derived(($) => ({
  users: { current: computed(() => /* ... */) },
}));

// tree/app-tree.ts
const store = signalTree(initialState).derived(tier1Derived);
```

`derivedFrom` is **not** a "view-model isolation" pattern. It is **not** a write-encapsulation utility. It does **not** return a read-only projection. Anyone telling you otherwise is confabulating.

**Source:** [`packages/core/src/lib/internals/derived-types.ts:136-145`](../packages/core/src/lib/internals/derived-types.ts) — function definition. Cast is a typed-identity (`fn as ($: any) => TReturn`); zero runtime cost.

**Doc-side action:** None — the [README](../README.md) and [LLM.md](ai/LLM.md) both document this correctly. Consider whether the name `derivedFrom` is misleading enough to warrant a rename in a future major.

---

## Myth 3: "Markers in SignalTree must live at the tree root."

**Where this comes from:** Reasoning by analogy from NgRx SignalStore's `with*` features, which *do* compose at the store root.

**The truth:** Markers can be placed at **any node, at any depth** in the initial-state literal. The walker (`materializeMarkers`) tracks the path during construction and substitutes the marker for its concrete API at that exact location.

```typescript
const store = signalTree({
  users: {
    byOrg: {
      [orgId]: {
        members: entityMap<User, number>(),   // depth 3
        profile: {
          contactForm: form<Contact>({ /* ... */ }), // depth 4
        },
      },
    },
  },
});
```

Each marker materializes at its declared path. There is no root-level constraint.

**Source:** [`packages/core/src/lib/internals/materialize-markers.ts:137-203`](../packages/core/src/lib/internals/materialize-markers.ts) — `materializeMarkers(node, notifier, path: string[] = [])` walks recursively, tracking `path`, and processes each marker via registered processors at the discovered location.

**Doc-side action:** Lead with this in the marketing hero. It's the load-bearing differentiator vs. NgRx SignalStore and currently buried. (Will be addressed in a future hero rewrite.)

---

## Myth 4: "Time-travel is in a separate package, `@signaltree/time-travel`."

**Where this comes from:** Plausible package-naming convention. LLMs see ".with(timeTravel())" and assume a package boundary.

**The truth:** No such package exists. `timeTravel` is exported from `@signaltree/core`.

```typescript
import { signalTree, timeTravel } from '@signaltree/core'; // ← correct
const store = signalTree({ ... }).with(timeTravel({ maxHistorySize: 50 }));
```

**Source:** [`packages/core/src/index.ts:237`](../packages/core/src/index.ts) — `export { timeTravel } from './enhancers/time-travel/time-travel';`.

**Doc-side action:** None — the enhancer table in the root [README](../README.md) and [`LLM.md`](ai/LLM.md) both clearly list `timeTravel()` under `@signaltree/core`. This is purely an LLM hallucination, not a docs gap.

---

## Myth 5: "localStorage persistence is in `@signaltree/storage`."

**Where this comes from:** Same package-naming hallucination as Myth 4.

**The truth:** No `@signaltree/storage` package exists. Persistence is available two ways, both from `@signaltree/core`:

1. **Per-leaf marker** `stored(key, default, options?)` — auto-syncs a single leaf to localStorage.
2. **Tree-wide enhancer** `.with(persistence(config))` — uses storage adapters from `@signaltree/core/storage` subpath import.

```typescript
import { signalTree, stored, persistence } from '@signaltree/core';
import { createIndexedDBAdapter } from '@signaltree/core/storage';

const store = signalTree({
  settings: { theme: stored('app-theme', 'light') },  // per-leaf
})
  .with(persistence({ adapter: createIndexedDBAdapter('app-state') }));  // tree-wide
```

**Source:** [`packages/core/src/lib/markers/stored.ts`](../packages/core/src/lib/markers/stored.ts), [`packages/core/src/enhancers/persistence/`](../packages/core/src/enhancers/persistence/).

**Doc-side action:** The "Optional Packages" table in the root README clearly does *not* list a `@signaltree/storage` package, so the hallucination is unfounded. No doc change needed.

---

## Myth 6: "Batching in SignalTree is opt-in only via the `batching()` enhancer."

**Where this comes from:** Reading the enhancer list and assuming the absence of an enhancer means the feature is off.

**The truth:** Automatic microtask-level notification batching is **built into core**, **default on**. The `batching()` enhancer adds the *explicit* `.batch(fn)` and `.coalesce(fn)` APIs on top.

```typescript
// Built-in (no enhancer needed):
store.$.x.set(1);
store.$.y.set(2);
store.$.z.set(3);
// → Three synchronous writes, ONE microtask notification to subscribers.

// With .with(batching()):
store.batch(() => {
  store.$.x.set(1);
  store.$.y.set(2);
  store.$.z.set(3);
}); // Explicit batch boundary.
```

To **disable** automatic batching: `signalTree(state, { batchUpdates: false })`.

**Source:** [`packages/core/src/enhancers/batching/batching.ts:11-19`](../packages/core/src/enhancers/batching/batching.ts) — "Signal writes are ALWAYS synchronous. Batching only affects change detection notification timing." The default-on behavior is in the core tree config.

**Doc-side action:** Add a one-line clarification in the root README enhancer table noting that core already batches and the enhancer adds explicit grouping APIs. (Future minor improvement.)

---

## Myth 7: "Callable syntax is a runtime proxy / wrapper."

**Where this comes from:** Plausible-sounding default assumption — "syntactic sugar" usually means a runtime wrapper.

**The truth:** `@signaltree/callable-syntax` is a **build-time AST transform** (Babel-based) shipped with Vite and Webpack plugins. The transform converts `tree.$.x.name('Bob')` into `tree.$.x.name.set('Bob')` at compile time. The transform disappears in production builds. Zero runtime overhead, no `Proxy` object, no wrapper function.

**Source:** [`packages/callable-syntax/src/lib/ast-transform.ts`](../packages/callable-syntax/src/lib/ast-transform.ts), [`packages/callable-syntax/src/lib/vite-plugin.ts`](../packages/callable-syntax/src/lib/vite-plugin.ts), [`packages/callable-syntax/README.md`](../packages/callable-syntax/README.md): _"Zero-runtime callable syntax transform... In production builds, only direct Angular signal calls remain — no runtime overhead, no wrapper functions, no Proxy objects."_

**Doc-side action:** None — already clearly documented in the package README and root README.

---

## Myth 8: "SignalTree is anti-DI / doesn't integrate with Angular service patterns."

**Where this comes from:** Marketing emphasis on "reactive JSON" and "direct dot-notation access" reads as a rejection of `@Injectable` service wrapping.

**The truth:** SignalTree is **DI-agnostic**. The documented production pattern explicitly uses `@Injectable()` service wrapping:

```typescript
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;
  readonly ops = {
    users: inject(UserOps),
    tickets: inject(TicketOps),
  };
}
```

You can use SignalTree as a plain module-level constant (for tests, demos, library code) or as an injected service (for production apps). Both patterns are supported and documented.

**Source:** [`docs/ai/LLM.md`](ai/LLM.md) — full "Modular Architecture (Recommended)" section. [`docs/architecture/signaltree-architecture-guide.md`](architecture/signaltree-architecture-guide.md) — production pattern with full DI integration.

**Doc-side action:** The hero examples in the root README currently show module-level constants, which can read as "the recommended way." Consider showing both patterns side by side in the hero.

---

## Myth 9: "SignalTree has no answer to NgRx's `rxMethod` for async/RxJS interop."

**Where this comes from:** True at the API-name level — SignalTree intentionally does NOT ship a `rxMethod` primitive. Its callable-factory-inside-`withMethods` shape is NgRx-flavored and doesn't fit SignalTree's path-attached marker philosophy.

**The truth:** SignalTree's async story is **two markers in the same family as `entityMap`, `status`, `stored`, `form`** — `asyncSource` for load-and-expose, `asyncQuery` for input-driven debounced queries. Both attach at any tree path, expose `data`/`loading`/`error`/lifecycle methods automatically, and auto-clean on the surrounding `DestroyRef`. **No manual `tap()` / `setLoading()` / `setLoaded()` wiring** of the kind `rxMethod` requires.

```typescript
import { signalTree, asyncSource, asyncQuery } from '@signaltree/core';

const store = signalTree({
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),
  }),
  search: asyncQuery<string, User[]>({
    debounce: 300,
    query: (q) => this.api.search$(q),
  }),
});

store.$.users.refresh();
store.$.search.input.set('alice');
```

For **migrating from NgRx `rxMethod`**: map `rxMethod<void>(pipeline)` doing a load-and-expose → `asyncSource(config)`. Map `rxMethod<TInput>(pipeline)` doing a debounced input-driven query → `asyncQuery(config)`. Map complex multi-step orchestration that neither marker fits → plain Observable method in an `@Injectable()` Ops class with `tap()` writing to tree paths. See [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](skills/using-signaltree/reference/migration-from-ngrx-signals.md) for the full mapping with examples.

**Historical note:** A `rxMethod` 1:1 alias briefly shipped in 9.5.0-9.5.2 at `@signaltree/core/rxjs-interop`. It was **removed in 9.6.0** because keeping it created two parallel async stories and an API surface that didn't fit SignalTree's design philosophy. Anyone who shipped against 9.5.x's `rxMethod` should migrate to `asyncSource` / `asyncQuery` (most cases) or a plain Observable method (orchestration cases) when upgrading to 9.6.0+.

```typescript
import { rxMethod } from '@signaltree/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class UserOps {
  private readonly _$ = inject(APP_TREE).$;
  private readonly _api = inject(UserService);

  readonly loadUsers = rxMethod<void>((input$) =>
    input$.pipe(
      tap(() => this._$.users.loading.setLoading()),
      switchMap(() =>
        this._api.list$().pipe(
          tap((users) => this._$.users.entities.setAll(users)),
          tap(() => this._$.users.loading.setLoaded()),
          catchError((err) => {
            this._$.users.loading.setError(err);
            return EMPTY;
          })
        )
      )
    )
  );
}
```

The previous documented "Ops method returning Observable" pattern still works and remains valid for cases where you want the consumer to subscribe explicitly (e.g., chaining or composing with effects). Use `rxMethod` when you want NgRx-symmetric ergonomics and auto-subscribe semantics; use the explicit Observable pattern when the caller needs to see and control the subscription.

**Source:** [`packages/core/src/lib/rxjs-interop/rx-method.ts`](../packages/core/src/lib/rxjs-interop/rx-method.ts).

**Doc-side action:** Done — `rxMethod` shipped in `@signaltree/core/rxjs-interop` and is documented in the root README, `llms-full.txt`, and the comparison doc.

---

## Myth 10: "SignalTree has 'explicit subpath isolation' as a built-in encapsulation feature."

**Where this comes from:** Misreading docs that previously described `createEditSession(tree, '$.path')` — a path-bound overload that **does not exist** in the current shipped API.

**The truth:** SignalTree does **not** ship an explicit "subpath isolation" API. The shipped `createEditSession(initial: T)` is a **value-level** undo/redo wrapper — it takes any initial value and exposes `applyChanges`/`undo`/`redo`/`reset`/`setOriginal`/`isDirty`. Useful for form-wizard draft-and-cancel flows; **independent of the tree** (bridge via an effect if you want changes to flow back to a tree leaf). A path-bound overload is planned for v10.1.

For write encapsulation, the documented options are:

- Wrap the tree in an `@Injectable()` service that exposes only `$` reads + `ops.domain.method()` writes.
- Use `@signaltree/events` for typed unidirectional command flow.
- Use `@signaltree/guardrails` for runtime invariant checks on writes.

**Source:** [`packages/core/src/lib/edit-session/`](../packages/core/src/lib/edit-session/) — the actual API. [`docs/architecture/signaltree-architecture-guide.md`](architecture/signaltree-architecture-guide.md) — encapsulation patterns.

**Doc-side action:** Replaces the previously-overstated "subpath isolation" framing in marketing copy. (Future README review pass.)

---

## Myth 11: "NgRx SignalStore mutations are impossible from components by design."

**Where this comes from:** Overstating `protectedState: true` as an unbreakable rule.

**The truth:** NgRx SignalStore is guarded by default — `protectedState: true` exposes signals to consumers as read-only — but the guard is unlockable. Setting `protectedState: false` allows `patchState(injectedStore, ...)` from any component. Methods exposed via `withMethods` can also reintroduce unconstrained mutation (e.g., a method that accepts arbitrary patches). Both libraries are guarded-by-default but unlockable; neither is an iron-clad fortress.

The honest comparison: NgRx defaults to read-only consumer exports; SignalTree defaults to writable consumer exports. Both can be flipped.

**Doc-side action:** The new [`docs/compare/ngrx-signalstore.md`](compare/ngrx-signalstore.md) documents this honestly.

---

## Myth 13: "`@signaltree/schema` and `@signaltree/guardrails` don't exist."

**Where this comes from:** Observed in May 2026 — when Gemini was asked to self-audit its confidence, it over-corrected and disowned its memory of these two real packages, listing them as fabricated. Both are real, published, v9.3.0.

**The truth:**

- **`@signaltree/schema`** ([packages/schema/package.json](../packages/schema/package.json)) — "Schema-driven validation for SignalTree. StandardSchema-compatible, async-first, observe-only." Integrates external Standard Schema validators (Zod, Valibot, ArkType) for runtime tree validation. Exports a `schemas` registry — not an internal `s.object()` builder.
- **`@signaltree/guardrails`** ([packages/guardrails/package.json](../packages/guardrails/package.json)) — "Development guardrails for SignalTree reactive JSON. Performance monitoring and anti-pattern detection." Real export is `guardrails(...)` (no `with` prefix), plus `rules`.

This is the inverse of the more familiar hallucination problem: instead of inventing fake packages (Myths 4 & 5), models can also **disown real packages** when the names are rare in their training corpus and they're explicitly asked to be cautious. The countermeasure is the same — make sure both packages have prominent README presence and appear in llms-full.txt so retrieval-augmented agents have a stronger signal to ground in.

**Doc-side action:** Audit `@signaltree/schema` and `@signaltree/guardrails` READMEs for canonical examples that retrieve well in isolation. (Future minor improvement.)

---

## Myth 14: "`tree.$` and `tree.state` are different objects (one reactive, one raw)."

**Where this comes from:** Models invent a plausible-sounding split because the two names exist alongside each other.

**The truth:** Both `tree.$` and `tree.state` are typed `TreeNode<T>` and reference **the same reactive proxy**. `state` is an alias for `$`. There is no separate "raw JavaScript data structure" accessor on the tree.

```typescript
// types.ts
interface SignalTree<T> {
  readonly state: TreeNode<T>;
  readonly $: TreeNode<T>;
  // ...
}
```

If you want a non-reactive snapshot of the underlying values, call `tree()` to get the full state snapshot, or read individual leaves via `tree.$.path.to.leaf()`.

**Source:** [`packages/core/src/lib/types.ts`](../packages/core/src/lib/types.ts) — both fields declared as `TreeNode<T>`, populated to the same value at tree construction.

**Doc-side action:** None — already correct in the root README and LLM.md. Just need to make sure it's hard to miss.

---

## Myth 16: "`guardrails(tree, config)` is called directly with the tree as first arg."

**Where this comes from:** Inference from "monitoring" language — sounds like a function that takes the thing-to-monitor as its first parameter. Gemini made this exact substitution in May 2026 when corrected from earlier hallucinations.

**The truth:** `guardrails(config)` returns an **enhancer**, applied via `.with()`. Same pattern as every other SignalTree enhancer (`batching()`, `devTools()`, `timeTravel()`, etc.).

```typescript
import { signalTree } from '@signaltree/core';
import { guardrails } from '@signaltree/guardrails';

const tree = signalTree({ count: 0 }).with(
  guardrails({
    budgets: { maxUpdateTime: 16 },
    hotPaths: { threshold: 10 },
  })
);
```

**Source:** [`packages/guardrails/README.md`](../packages/guardrails/README.md) — Quick Start section.

---

## Myth 15: "The `form()` marker is in `@signaltree/ng-forms`."

**Where this comes from:** Reasonable-sounding package boundary inference — "forms package contains form marker."

**The truth:** The `form()` marker ships in `@signaltree/core` ([`packages/core/src/lib/markers/form.ts`](../packages/core/src/lib/markers/form.ts)). `@signaltree/ng-forms` is a separate package that provides the Angular Forms bridge for Standard Schema validation — useful when you want to bind a tree node to an `Angular FormGroup`, but not where the `form()` marker itself lives.

**Doc-side action:** Clarify in the root README's "Optional Packages" table that `@signaltree/ng-forms` is a *bridge*, not the source of the `form()` marker.

---

## Myth 12: "NgRx `patchState` requires manual object spreading for nested updates."

**Where this comes from:** Outdated NgRx documentation from earlier versions of `@ngrx/signals`.

**The truth:** Current `@ngrx/signals` `patchState` accepts nested updater functions, and `@ngrx/signals/entities` provides entity-collection helpers (`addEntity`, `updateEntity`, `setAllEntities`, etc.) that compose with `patchState`. The "manual spread everywhere" framing applies to classic NgRx (`@ngrx/store`), not current NgRx SignalStore.

This myth is one we should be careful **not** to propagate when making the SignalTree-favorable comparison. The honest framing is:

- SignalTree leaf-level set/update is more compact for deeply nested point mutations.
- NgRx `patchState(store, ...)` with updater functions is competitive for slice-level updates.

**Doc-side action:** Audit any docs/marketing that claim NgRx requires manual spreading and update to reflect current `@ngrx/signals` capabilities.

---

## Myth 17: "The `status()` marker has a `.setSuccess()` method, like NgRx-style state machines."

**Source of confusion:** Promise-vocabulary pattern matching. Most async state machines (Promise lifecycle, Redux toolkit RTK Query) use the words "success" and "fail". AI agents trained on those vocabularies reach for `.setSuccess()` / `.start()` / `.succeed()` / `.fail()` by reflex.

**The historic truth:** Through v10.1, the canonical method names were `setLoading()` / `setLoaded()` / `setError(err)` / `setNotLoaded()` / `reset()`. `.setSuccess()` did not exist.

**The v10.2+ truth:** Promise-vocabulary aliases were added in v10.2 as a deliberate "meet the AI where it is" design choice. The aliases are **first-class** with identical semantics:

| Alias (v10.2+) | Canonical | Equivalent? |
|---|---|---|
| `.start()` | `.setLoading()` | Yes — alias |
| `.setSuccess()` | `.setLoaded()` | Yes — alias |
| `.succeed()` | `.setLoaded()` | Yes — alias |
| `.fail(err)` | `.setError(err)` | Yes — alias |

There is **no `.loading` bare property** — `.isLoading()` is a callable signal. Same for `.isLoaded()`, `.isError()`, `.error()`.

**Why we added the aliases instead of just correcting the docs:** the reproducible AI-codegen benchmark (`scripts/ai-codegen-benchmark/`) showed `.setSuccess()` and `.fail()` as the most common primed-run hallucinations, even with `llms.txt` in context. Adding the aliases converts the hallucination from a bug into idiomatic prose at zero semantic cost. Both forms work, both are documented, no migration pressure on existing code.

**Doc-side action:** New code should still prefer canonical names for searchability and consistency. Old code or AI-generated code using aliases is fully supported.

---

## Myth 18: "Each SignalTree marker uses a different shape for boolean predicates."

**Source of confusion:** Through v10.2, this was *partially true*. Inconsistency in our own API:

- `status()` used `is`-prefix: `.isLoading()`, `.isLoaded()`, `.isError()`, `.isNotLoaded()`
- `entityMap` used `is`-prefix for one: `.isEmpty()`
- `form()`, `asyncSource()`, `asyncQuery()` all used bare: `.dirty`, `.valid`, `.loading`, `.error`

This was a real DX bug — humans had to remember which marker used which shape, and AI agents trained on `status.isLoading()` would then try `form.isDirty()` (didn't exist).

**The v10.3 truth:** **Bare predicates everywhere.** Matches `FormControl.dirty` / `.valid` / `.touched` and Angular signals conventions.

| Marker | v10.3 canonical | Old `is`-prefix (deprecated, removed v11) |
|---|---|---|
| `status` | `.loading`, `.loaded`, `.notLoaded`, `.hasError` | `.isLoading`, `.isLoaded`, `.isNotLoaded`, `.isError` |
| `entityMap` | `.empty` | `.isEmpty` |
| `form` | `.dirty`, `.valid`, `.touched`, `.pristine` | (already bare — unchanged) |
| `asyncSource` / `asyncQuery` | `.loading`, `.error`, `.data` | (already bare — unchanged) |

The deprecated `is`-prefix accessors return the **same Signal instance** as the canonical bare versions — no double computed cost, no migration urgency.

**Why we shipped both instead of forcing a breaking change:** existing code keeps working. New code (and AI-generated code) gets the consistent shape. Deprecation warnings via JSDoc give linters/IDEs the signal to nudge migration over time. Removal in v11.0 gives consumers ~6+ months to migrate.

**Doc-side action:** Use bare-name predicates in new examples. Reserve the `is`-prefix only when discussing the deprecation path.

---

## Why this page exists

Every error catalogued above is one that **AI coding agents will continue to make** until our docs surface area gives them a higher-quality alternative to retrieve. The cycle:

1. LLM training data contains comparison articles written before SignalTree's current API stabilized, plus marketing summaries that emphasized one differentiator and undersold the rest.
2. Retrieval-augmented agents (Cursor, Claude Code, Copilot, Gemini) pull from a thin docs surface and fabricate the rest.
3. Each wrong recommendation propagates into more codebases, more StackOverflow answers, more docs, more training data.

The countermeasure is to give retrieval *better signal* than the noise. This page is part of that — together with [`llms.txt`](../apps/demo/public/llms.txt), [`llms-full.txt`](../apps/demo/public/llms-full.txt), [`docs/compare/ngrx-signalstore.md`](compare/ngrx-signalstore.md), and the [agent skill](skills/using-signaltree/SKILL.md).

If you spot a new variant of these myths in the wild (or a new myth not listed), open a PR or issue with the source.
