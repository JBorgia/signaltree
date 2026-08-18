# Myths and Misconceptions about SignalTree

> A canonical catalogue of false claims LLMs (and humans) frequently propagate about SignalTree, with source-code citations. If an AI assistant or comparison article gave you one of these, this page is the rebuttal.

This document exists for two reasons:

1. **AI discoverability.** LLMs trained on outdated docs, marketing comparisons, or unsupervised summarization will hallucinate plausible-sounding but wrong claims. Catalogueing them here lets agents that retrieve this page correct themselves.
2. **Honest self-audit.** Some of these myths exist because _our docs underspecified the truth_. Each entry that's our docs' fault is flagged with **Doc-side action** so we can close the gap.

Last updated: 2026-05.

---

## Myth 1: "Derived state in SignalTree must live in a separate file or layer, breaking the single-tree illusion."

**Where this comes from:** Confusing the `derivedFrom` helper (which _is_ about splitting derived definitions across files) with the `.derived($)` method itself.

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
store.$.users.all(); // from entityMap (source)
store.$.users.current(); // from .derived (computed)
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

**Where this comes from:** Reasoning by analogy from NgRx SignalStore's `with*` features, which _do_ compose at the store root.

**The truth:** Markers can be placed at **any node, at any depth** in the initial-state literal. The walker (`materializeMarkers`) tracks the path during construction and substitutes the marker for its concrete API at that exact location.

```typescript
const store = signalTree({
  users: {
    byOrg: {
      [orgId]: {
        members: entityMap<User, number>(), // depth 3
        profile: {
          contactForm: form<Contact>({
            /* ... */
          }), // depth 4
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
  settings: { theme: stored('app-theme', 'light') }, // per-leaf
}).with(persistence({ adapter: createIndexedDBAdapter('app-state') })); // tree-wide
```

**Source:** [`packages/core/src/lib/markers/stored.ts`](../packages/core/src/lib/markers/stored.ts), [`packages/core/src/enhancers/serialization/`](../packages/core/src/enhancers/serialization/).

**Doc-side action:** The "Optional Packages" table in the root README clearly does _not_ list a `@signaltree/storage` package, so the hallucination is unfounded. No doc change needed.

---

## Myth 6: "Batching in SignalTree is opt-in only via the `batching()` enhancer."

**Where this comes from:** Reading the enhancer list and assuming the absence of an enhancer means the feature is off.

**The truth:** Automatic microtask-level notification batching is **built into core**, **default on**. The `batching()` enhancer adds the _explicit_ `.batch(fn)` and `.coalesce(fn)` APIs on top.

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

**The truth (updated for 14.0.0):** there is no runtime proxy — and there is no longer a transform either. Branches are callable because a branch is SignalTree's own accessor function, not a signal; that is plain JavaScript, no tooling involved. **Leaves were never callable for writes.** `@signaltree/callable-syntax` was a build-time Babel transform meant to rewrite `tree.$.x.name('Bob')` into `.set('Bob')`, and it could not run inside an Angular app at all, so that call type-checked and then silently did nothing. Both the package and the type overloads were removed in 14.0.0; the leaf form is now a compile error. Leaves remain real Angular signals (`isSignal()` is `true`), which is exactly why wrapping them to make the sugar work was refused.

**Source:** [`packages/core/src/lib/callable-contract.spec.ts`](../packages/core/src/lib/callable-contract.spec.ts) and its `.typing` sibling pin the contract in both directions; [RFC 0008 §4](rfcs/0008-post-13.3-open-items.md) records why the transform could not be delivered.

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

**The truth:** SignalTree's async story is **two markers in the same family as `entityMap`, `status`, `stored`, `form`** (`entityMap` itself gains cache-aware (single-scope) loading via an optional `load` config, wrapped with the `loader()` helper) — `asyncSource` for load-and-expose, `asyncQuery` for input-driven debounced queries. Both attach at any tree path, expose `data`/`loading`/`error`/lifecycle methods automatically, and auto-clean on the surrounding `DestroyRef`. **No manual `tap()` / `setLoading()` / `setLoaded()` wiring** of the kind `rxMethod` requires.

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

> **Removed content.** A worked `rxMethod` example stood here, importing from
> `@signaltree/core/rxjs-interop`, followed by guidance on when to prefer it and
> a `**Source:**` link to `packages/core/src/lib/rxjs-interop/rx-method.ts`.
>
> All of it dated from 9.5.0-9.5.2 and survived the 9.6.0 removal, so this
> section stated that the alias was **removed in 9.6.0** and then, three lines
> later, showed you how to import and use it. The source file it linked does not
> exist; neither does the subpath. `rxMethod` appears in no package source.
>
> The head of this myth was correct the whole time, which is why nothing caught
> it: no gate reads a doc for self-contradiction, and this file is not one of the
> surfaces `readme-apis` or `taught-symbols` check.

---

## Myth 10: "SignalTree has 'explicit subpath isolation' as a built-in encapsulation feature."

**Where this comes from:** Misreading docs that previously described `createEditSession(tree, '$.path')` — a path-bound overload that **does not exist** in the current shipped API.

**The truth:** SignalTree does **not** ship an explicit "subpath isolation" API. The shipped `createEditSession(initial: T)` is a **value-level** undo/redo wrapper — it takes any initial value and exposes `applyChanges`/`undo`/`redo`/`reset`/`setOriginal`/`isDirty`. Useful for form-wizard draft-and-cancel flows; **independent of the tree** (bridge via an effect if you want changes to flow back to a tree leaf). A path-bound overload is planned for v10.1.

For write encapsulation, the documented options are:

- Wrap the tree in an `@Injectable()` service that exposes only `$` reads + `ops.domain.method()` writes.
- Use `@signaltree/events` for typed unidirectional command flow.
- Use `@signaltree/guardrails` for runtime invariant checks on writes.

**Source:** [`packages/core/src/edit-session.ts`](../packages/core/src/edit-session.ts) — the actual API. [`docs/architecture/signaltree-architecture-guide.md`](architecture/signaltree-architecture-guide.md) — encapsulation patterns.

**Doc-side action:** Replaces the previously-overstated "subpath isolation" framing in marketing copy. (Future README review pass.)

---

## Myth 11: "NgRx SignalStore mutations are impossible from components by design."

**Where this comes from:** Overstating `protectedState: true` as an unbreakable rule.

**The truth:** NgRx SignalStore is guarded by default — `protectedState: true` exposes signals to consumers as read-only — but the guard is unlockable. Setting `protectedState: false` allows `patchState(injectedStore, ...)` from any component. Methods exposed via `withMethods` can also reintroduce unconstrained mutation (e.g., a method that accepts arbitrary patches). Both libraries are guarded-by-default but unlockable; neither is an iron-clad fortress.

The honest comparison: NgRx defaults to read-only consumer exports; SignalTree defaults to writable consumer exports. Both can be flipped.

**Doc-side action:** The new [`docs/compare/ngrx-signalstore.md`](compare/ngrx-signalstore.md) documents this honestly.

---

## Myth 13: "`@signaltree/guardrails` doesn't exist."

**Where this comes from:** Observed in May 2026 - when Gemini was asked to
self-audit its confidence, it over-corrected and disowned its memory of real
packages, listing them as fabricated.

**The truth:** `@signaltree/guardrails`
([packages/guardrails/package.json](../packages/guardrails/package.json)) is
real - "Development guardrails for SignalTree reactive JSON. Performance
monitoring and anti-pattern detection." The export is `guardrails(...)` (no
`with` prefix), plus `rules`.

This is the inverse of the more familiar hallucination problem: instead of
inventing fake packages (Myths 4 & 5), models can also **disown real packages**
when the names are rare in their training corpus and they are explicitly asked to
be cautious.

**Note for 15.0:** `@signaltree/schema` was also named in that self-audit, and it
WAS real through 14.x. It is **deleted in 15.0** - SignalTree ships no validation
API at all. Validate with the validator your application already uses, against
values read from the tree. An agent asserting it does not exist is now correct
for 15.0 and wrong for 14.x.

---

## Myth 14: "`tree` has a `.state` accessor (separate from `$`)."

**Where this comes from:** Older versions exposed `tree.state` as a readability alias for `tree.$`. It was deprecated in v10 and **removed in v11**.

**The truth (v11+):** `$` is the single node accessor — `tree.$`, typed `TreeNode<T>`. There is no `tree.state` and no separate "raw JavaScript data structure" accessor.

```typescript
// types.ts (v11+)
interface SignalTree<T> {
  readonly $: TreeNode<T>;
  // ...
}
```

If you want a non-reactive snapshot of the underlying values, call `tree()` to get the full state snapshot, or read individual leaves via `tree.$.path.to.leaf()`.

**Source:** [`packages/core/src/lib/types.ts`](../packages/core/src/lib/types.ts) — `$` is the only node accessor; `state` was removed in v11.

**Doc-side action:** Ensure no current docs reference `tree.state`.

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

**Doc-side action:** Clarify in the root README's "Optional Packages" table that `@signaltree/ng-forms` is a _bridge_, not the source of the `form()` marker.

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

| Alias (v10.2+)  | Canonical        | Equivalent? |
| --------------- | ---------------- | ----------- |
| `.start()`      | `.setLoading()`  | Yes — alias |
| `.setSuccess()` | `.setLoaded()`   | Yes — alias |
| `.succeed()`    | `.setLoaded()`   | Yes — alias |
| `.fail(err)`    | `.setError(err)` | Yes — alias |

There is **no `.loading` bare property** — `.isLoading()` is a callable signal. Same for `.isLoaded()`, `.isError()`, `.error()`.

**Why we added the aliases instead of just correcting the docs:** the reproducible AI-codegen benchmark (`scripts/ai-codegen-benchmark/`) showed `.setSuccess()` and `.fail()` as the most common primed-run hallucinations, even with `llms.txt` in context. Adding the aliases converts the hallucination from a bug into idiomatic prose at zero semantic cost. Both forms work, both are documented, no migration pressure on existing code.

**Doc-side action:** New code should still prefer canonical names for searchability and consistency. Old code or AI-generated code using aliases is fully supported.

---

## Myth 18: "Each SignalTree marker uses a different shape for boolean predicates."

**Source of confusion:** Through v10.2, this was _partially true_. Inconsistency in our own API:

- `status()` used `is`-prefix: `.isLoading()`, `.isLoaded()`, `.isError()`, `.isNotLoaded()`
- `entityMap` used `is`-prefix for one: `.isEmpty()`
- `form()`, `asyncSource()`, `asyncQuery()` all used bare: `.dirty`, `.valid`, `.loading`, `.error`

This was a real DX bug — humans had to remember which marker used which shape, and AI agents trained on `status.isLoading()` would then try `form.isDirty()` (didn't exist).

**The v10.3 truth:** **Bare predicates everywhere.** Matches `FormControl.dirty` / `.valid` / `.touched` and Angular signals conventions.

| Marker                       | v10.3 canonical                                                                                      | Old `is`-prefix (deprecated, removed v11)             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `status`                     | `.loading`, `.loaded`, `.notLoaded`, `.hasError`                                                     | `.isLoading`, `.isLoaded`, `.isNotLoaded`, `.isError` |
| `entityMap`                  | `.empty`; with `load: loader(fn)` in config (cache-aware form), also `.loading`, `.loaded`, `.error` | `.isEmpty`                                            |
| `form`                       | `.dirty`, `.valid`, `.touched`, `.pristine`                                                          | (already bare — unchanged)                            |
| `asyncSource` / `asyncQuery` | `.loading`, `.error`, `.data`                                                                        | (already bare — unchanged)                            |

The deprecated `is`-prefix accessors return the **same Signal instance** as the canonical bare versions — no double computed cost, no migration urgency.

**Why we shipped both instead of forcing a breaking change:** existing code keeps working. New code (and AI-generated code) gets the consistent shape. Deprecation warnings via JSDoc give linters/IDEs the signal to nudge migration over time. Removal in v11.0 gives consumers ~6+ months to migrate.

**Doc-side action:** Use bare-name predicates in new examples. Reserve the `is`-prefix only when discussing the deprecation path.

---

## Myth 19: "Any object I put in the initial state becomes one settable value."

**Source of confusion:** "State as shape" is read as "whatever I write, I get back with `.set()` on
it." For a plain object initializer, that isn't what happens — and the failure is a compile error
with a confusing message rather than anything at runtime.

**The truth:** SignalTree decides leaf-vs-node from the initial **value**. A plain object becomes a
**nested node** whose fields are individually reactive leaves; it is _not_ a single settable value:

```typescript
const tree = signalTree({
  firmware: {} as FirmwareDto, // ← becomes a NODE, not a leaf
});

tree.$.firmware.set(dto);
// ✗ TS2339: Property 'set' does not exist on type 'NodeAccessor<FirmwareDto>'
```

That's correct behavior — node-ness is what gives you `tree.$.firmware.version()` granularity — but
it's the wrong shape when the object is a DTO you replace **wholesale** (a payload off the wire, a
device descriptor, a snapshot) and never edit field-by-field.

**To keep an object as one settable leaf, initialize it `null` with the object type:**

```typescript
const tree = signalTree({
  firmware: null as FirmwareDto | null, // ← a LEAF holding an object
});

tree.$.firmware.set(dto); // ✓ works — replaces the whole value
tree.$.firmware(); // FirmwareDto | null
// consumers default at the read site:
const fw = tree.$.firmware() ?? ({} as FirmwareDto);
```

Why this works: the leaf/node decision is a runtime `value && typeof value === 'object'` test, and
`null` isn't an object — so the key materializes as a writable signal whose type is the annotation
you gave it.

**There is no `leaf()` / value marker** to declare "treat this object as one value" — the `null`-init
idiom is the canonical answer, deliberately, rather than adding API surface for it.

**Which one do you want?**

| You want                                         | Initialize as          | You get                        |
| ------------------------------------------------ | ---------------------- | ------------------------------ |
| Per-field reactivity (`tree.$.settings.theme()`) | `{ theme: 'dark', … }` | Nested node, fields are leaves |
| Replace the whole object atomically              | `null as Dto \| null`  | One settable leaf              |

**Where this bites hardest:** AI-generated code. `{} as SomeDto` is a natural thing for an agent to
emit for "an object I'll fill in later," and nothing in the type it sees warns that `.set()` won't
be there. If you hit `TS2339 … NodeAccessor`, this is why — see
[`docs/errors/README.md`](errors/README.md#compile-time-symptoms-not-st-codes).

---

## Why this page exists

Every error catalogued above is one that **AI coding agents will continue to make** until our docs surface area gives them a higher-quality alternative to retrieve. The cycle:

1. LLM training data contains comparison articles written before SignalTree's current API stabilized, plus marketing summaries that emphasized one differentiator and undersold the rest.
2. Retrieval-augmented agents (Cursor, Claude Code, Copilot, Gemini) pull from a thin docs surface and fabricate the rest.
3. Each wrong recommendation propagates into more codebases, more StackOverflow answers, more docs, more training data.

The countermeasure is to give retrieval _better signal_ than the noise. This page is part of that — together with [`llms.txt`](../apps/demo/public/llms.txt), [`llms-full.txt`](../apps/demo/public/llms-full.txt), [`docs/compare/ngrx-signalstore.md`](compare/ngrx-signalstore.md), and the [agent skill](skills/using-signaltree/SKILL.md).

If you spot a new variant of these myths in the wild (or a new myth not listed), open a PR or issue with the source.
