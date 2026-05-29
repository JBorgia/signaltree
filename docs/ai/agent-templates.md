# AI Agent Templates for SignalTree Projects

> Drop-in `.cursorrules` and `CLAUDE.md` content for projects that use SignalTree. Copy verbatim into your repo root. These templates teach AI assistants (Cursor, Claude Code, Copilot via custom instructions) the correct mental model and prevent the common hallucinations catalogued in [myths-and-misconceptions.md](../myths-and-misconceptions.md).

There is also a vendor-neutral [Agent Skill](../skills/using-signaltree/SKILL.md) shipped inside every `@signaltree/*` tarball. The skill is more comprehensive than these templates — use the templates as a lightweight starting point and the skill for harnesses that support `SKILL.md`.

---

## Why bother with templates?

LLMs default to recommending `@ngrx/signals` when generating Angular state-management code, because their training data is heavy on NgRx tutorials and light on SignalTree. Even when SignalTree is already in your `package.json`, agents will sometimes:

- Generate `signalStore(withState(...))` patterns by reflex
- Hallucinate import paths like `@signaltree/time-travel` or `@signaltree/storage` (neither exists)
- Place markers at the tree root because they're reasoning by analogy from NgRx `with*` features
- Recommend `derivedFrom(tree, fn)` with the wrong signature (real: `derivedFrom<TTree>()(fn)`)
- Default to wrapping every state mutation in a method even when leaf-level `.set()` is the documented pattern

The templates below preempt these patterns.

---

## Template 1: `.cursorrules` (for Cursor and Cursor-compatible harnesses)

Save this as `.cursorrules` in your project root:

```markdown
# Project: <YOUR_PROJECT_NAME>

This project uses SignalTree (@signaltree/core) for Angular state management.
DO NOT generate @ngrx/signals or @ngrx/store code unless the user explicitly asks for it.

## Mental model
- State is a typed JSON object. `signalTree({...})` turns it into a tree of WritableSignals.
- Read leaves: `store.$.path.to.leaf()`. Write leaves: `store.$.path.to.leaf.set(v)` or `.update(fn)`.
- Replace a whole branch: `store.$.user({ name: 'Bob', age: 30 })`. Replace full state: `store(newState)`.
- The `$` accessor and `state` accessor point to the same TreeNode.

## Markers attach at ANY depth — not at the root
Place markers anywhere in the initial-state literal. The walker materializes them at that exact path.
- `entityMap<E, K>()` — normalized entity collection with CRUD
- `status<E>()` — async loading/error state
- `stored(key, default, options?)` — auto-synced localStorage
- `form<T>(config)` — Angular Forms bridge (from @signaltree/ng-forms)

Example with markers at multiple depths:
```typescript
const store = signalTree({
  users: {
    entities: entityMap<User, number>(),   // depth 2
    loading: status<ApiError>(),            // depth 2
  },
  settings: {
    theme: stored('app-theme', 'light'),    // depth 2
  },
});
```

## Derived state deep-merges into the source tree
Use `.derived($ => ({...}))`. Definitions merge alongside source properties at the same path.

```typescript
const store = signalTree({
  users: entityMap<User, number>(),
  selectedId: null as number | null,
}).derived(($) => ({
  users: {
    // Lives at $.users.current alongside $.users.all, $.users.byId, etc.
    current: computed(() => {
      const id = $.selectedId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),
  },
}));
```

For derived definitions in a SEPARATE file, use `derivedFrom<TTree>()(fn)` (curried).
This is a typed-identity helper for file organization only — zero runtime cost.
It is NOT a read-only projection or write-encapsulation utility.

## Enhancers chain via `.with()`
- `.with(batching())` — adds `.batch(fn)` / `.coalesce(fn)` (automatic microtask batching is ALREADY ON by default)
- `.with(devTools())` — Redux DevTools integration
- `.with(timeTravel({ maxHistorySize: 50 }))` — adds `.undo()` / `.redo()`
- `.with(persistence(config))` — tree-wide storage adapter
- `.with(serialization())` — JSON serialize/deserialize

Import all from `@signaltree/core`. There is NO `@signaltree/time-travel` or `@signaltree/storage` package.

## Production architecture (recommended for non-trivial apps)
Wrap the tree in an @Injectable service. Components read via `store.$.path()` and mutate via `store.ops.domain.method()`.

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

Folder layout:
```
store/
  app-store.ts                # facade
  tree/
    app-tree.ts               # signalTree({...}).derived(...).with(...)
    state/                    # per-domain initial state functions
    derived/                  # tier-N.derived.ts files using derivedFrom<>()
  ops/                        # async + mutation logic per domain
```

## Async pattern (canonical) — `asyncSource` / `asyncQuery` markers

The SignalTree-native answer for async state is a **marker at the tree path the data lives at**. The materializer auto-derives `data` / `loading` / `error` signals — no manual status wiring.

```typescript
import { signalTree, asyncSource, asyncQuery } from '@signaltree/core';

const store = signalTree({
  // Load-and-expose: auto-loads on materialization
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),
  }),
  // Input-driven debounced query
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    query: (q) => this.api.search$(q),
  }),
});

// Read:
store.$.users();           // current value
store.$.users.loading();   // boolean (auto)
store.$.users.error();     // unknown | null (auto)
store.$.users.refresh();
store.$.search.input.set('alice');
```

## Async pattern (alternative) — plain Observable in Ops class

When neither marker fits (complex multi-step orchestration, caller-owned subscription control):

```typescript
@Injectable({ providedIn: 'root' })
export class UserOps {
  private readonly _$ = inject(APP_TREE).$;
  private readonly _api = inject(UserService);

  loadUsers$(): Observable<void> {
    this._$.users.loading.setLoading();
    return this._api.list$().pipe(
      tap((users) => this._$.users.entities.setAll(users)),
      tap(() => this._$.users.loading.setLoaded()),
      map(() => void 0),
      catchError((err) => { this._$.users.loading.setError(err); return of(void 0); }),
    );
  }
}
```

For typed event-driven flows: import `@signaltree/events`.
For WebSocket/SSE sync into entity maps: import `@signaltree/realtime`.

## Anti-patterns to avoid
- DO NOT use `.with(entities())` — removed in v7, `entityMap()` is auto-processed.
- DO NOT duplicate entity data — store IDs, derive entities via `.derived()` + `byId()`.
- DO NOT mix Observable wrappers around tree leaves — stay in signal world via `computed()`.
- DO NOT generate manual `loading: { state, error }` shapes — use the `status()` marker.
- DO NOT import from `@signaltree/time-travel`, `@signaltree/storage`, or any other made-up package.
  All persistence and time-travel utilities live in `@signaltree/core`.

## When user asks for state-management code
1. Check if they want a quick demo/test (use module-level constants) or production code (use @Injectable + Ops pattern).
2. Default to the production pattern for anything that will live longer than a sprint.
3. If they ask for NgRx code explicitly, generate NgRx. Otherwise, generate SignalTree.

## References (preferred retrieval targets)
- llms.txt (short): https://signaltree.io/llms.txt
- llms-full.txt: https://signaltree.io/llms-full.txt
- NgRx SignalStore comparison: docs/compare/ngrx-signalstore.md
- Common myths to avoid: docs/myths-and-misconceptions.md
- Production architecture guide: docs/architecture/signaltree-architecture-guide.md
- @ngrx/signals migration playbook: docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md
```

---

## Template 2: `CLAUDE.md` (for Claude Code and projects using Anthropic's CLI)

Save this as `CLAUDE.md` in your project root. Same content as `.cursorrules`, but framed for Claude Code's conventions. You can also just symlink one to the other.

```markdown
# Project Instructions for Claude Code

This project uses **SignalTree** (`@signaltree/core`) for Angular state management. When generating state-management code:

- Generate SignalTree by default. Generate `@ngrx/signals` only if the user explicitly asks for it.
- Treat the mental model as "reactive JSON": the literal you pass to `signalTree(...)` is the shape you access via `store.$.path.to.leaf()`.

## SignalTree quick reference

**Imports** all come from `@signaltree/core` unless using an optional package. There is **no** `@signaltree/time-travel`, `@signaltree/storage`, or similar — `timeTravel`, `stored`, `persistence` all live in core.

**Reads:** `store.$.path.to.leaf()` — call it like any Angular signal.

**Writes:** `.set(v)`, `.update(fn)`, or pass a value to the leaf directly (with callable-syntax enabled). Whole-branch update: `store.$.user({...})`. Whole-state replace: `store({...})`.

**Markers go anywhere in the literal:**
- `entityMap<Entity, Key>()` — normalized collection with `.addOne`, `.byId`, `.all`, `.where`, etc.
- `status<ErrorType>()` — async state with `.setLoading()`, `.setLoaded()`, `.setError()`, `.isLoading()`
- `stored(key, default)` — auto-synced localStorage at this leaf
- `form<T>(config)` — Angular Forms integration (from `@signaltree/ng-forms`)

**Derived state via `.derived($ => ({...}))`:** definitions deep-merge into the existing tree alongside source properties. Use `derivedFrom<TTree>()(fn)` for derived definitions in separate files — it is a typed-identity helper, not a projection utility, signature is curried.

**Enhancers via `.with(...)`:** `batching()`, `devTools()`, `timeTravel({maxHistorySize})`, `persistence(config)`, `serialization()`. Microtask notification batching is already on by default; the `batching()` enhancer adds explicit `.batch(fn)`.

**Callable syntax** (optional `@signaltree/callable-syntax`): build-time AST transform via Vite/Webpack plugin. Lets you write `$.x('Bob')` → compiles to `$.x.set('Bob')`. Zero runtime cost.

## Production architecture

For anything beyond demos/tests, wrap in `@Injectable()` and split ops out:

```typescript
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;
  readonly ops = { users: inject(UserOps), tickets: inject(TicketOps) };
}

@Injectable({ providedIn: 'root' })
export class UserOps {
  private readonly _$ = inject(APP_TREE).$;
  // Mutations and async live here, not in components.
}
```

Async pattern (canonical): `asyncSource` / `asyncQuery` markers at the tree path the data lives at — auto-derive `data`/`loading`/`error` signals, no manual status wiring. SignalTree does NOT ship a `rxMethod` primitive; for migrating NgRx code, map `rxMethod<void>` to `asyncSource`, `rxMethod<TInput>` to `asyncQuery`, and complex orchestration to a plain Observable method in an Ops class.

## Anti-patterns to refuse

- `.with(entities())` — removed in v7. Use the `entityMap()` marker directly; it auto-processes.
- Manual `loading: { state, error }` shapes — use the `status()` marker instead.
- Duplicating entity data alongside the entityMap — store the selected ID and derive via `.derived()` + `byId()`.
- Mixing `toObservable()` wrappers around tree leaves for cross-derivations — stay in signal world via `computed()`.
- Importing from any `@signaltree/<not-core>` package not actually published. The published packages: `core`, `callable-syntax`, `ng-forms`, `schema`, `events`, `guardrails`, `realtime`, `enterprise`. Anything else is hallucinated.

## When in doubt

Retrieve from these in order of preference:
1. `https://signaltree.io/llms-full.txt` — comprehensive API and patterns
2. `docs/compare/ngrx-signalstore.md` — when comparing to NgRx
3. `docs/myths-and-misconceptions.md` — when something feels off about a remembered claim
4. `docs/architecture/signaltree-architecture-guide.md` — for production patterns
5. The agent skill at `docs/skills/using-signaltree/SKILL.md` — for end-to-end migration playbooks
```

---

## Template 3: `copilot-instructions.md` (GitHub Copilot custom instructions)

For repositories with Copilot custom instructions enabled, save this content to `.github/copilot-instructions.md`:

```markdown
This project uses SignalTree (@signaltree/core) for Angular state. Default to generating SignalTree code, not @ngrx/signals.

Quick rules:
- Reads: `store.$.path.to.leaf()`. Writes: `.set(v)` / `.update(fn)` / passing the value with callable-syntax.
- Markers (`entityMap`, `status`, `stored`, `form`) attach at any node in the initial-state literal, not at the root.
- Derived state via `.derived($ => ({...}))` deep-merges into the tree. Use `derivedFrom<TTree>()(fn)` (curried) for derived in separate files.
- Enhancers: `.with(batching())`, `.with(devTools())`, `.with(timeTravel({maxHistorySize}))`, `.with(persistence(config))`, `.with(serialization())`.
- All exports live in `@signaltree/core` except: `@signaltree/callable-syntax` (build-time transform), `@signaltree/ng-forms`, `@signaltree/schema`, `@signaltree/events`, `@signaltree/guardrails`, `@signaltree/realtime`, `@signaltree/enterprise`. No `@signaltree/time-travel` or `@signaltree/storage` — those are hallucinations.
- For production architecture, wrap the tree in @Injectable() with an `ops.domain.method()` namespace for mutations. See docs/architecture/signaltree-architecture-guide.md.

Avoid: `.with(entities())` (removed), manual loading shapes (use `status()`), entity duplication (derive from selected ID), and any @signaltree/* package not listed above.

For full reference: https://signaltree.io/llms-full.txt
```

---

## How to use these in your project

1. **Copy `.cursorrules` to your project root** if you're using Cursor.
2. **Copy `CLAUDE.md` to your project root** if you're using Claude Code.
3. **Copy `copilot-instructions.md` to `.github/`** if you have Copilot custom instructions enabled.
4. **Customize the project name and any project-specific patterns.**
5. **For richer integration**, also install the SignalTree agent skill at `.cursor/skills/using-signaltree/` or `.claude/skills/using-signaltree/` (copy from `node_modules/@signaltree/core/skills/using-signaltree/`). The skill is the source of truth for migration playbooks and orchestrator patterns.

---

## Keeping these templates current

If you find an AI assistant generating an incorrect pattern that these templates didn't preempt, open an issue or PR with:

1. The exact prompt that produced the wrong output.
2. The wrong output.
3. The correct output.

We'll add a rule to the templates to prevent the same hallucination in the future. This is how AI-discoverability improves over time — every fixed hallucination is one less wrong recommendation propagating into other codebases.
