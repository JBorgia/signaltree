# SignalTree error codes

Every SignalTree error and dev-mode warning carries a stable, greppable code in
brackets, e.g. `[ST2001]`. **Search the code** — in your editor, a stack trace,
or this file — to find the cause and fix. Codes are append-only and never
reused.

- `ST1xxx` — core: tree creation, updates, lifecycle, enhancers
- `ST2xxx` — entity collections and markers (mostly dev-mode guardrails)

> Dev-mode warnings (`ST20xx`) fire only when `ngDevMode` is true; they never
> run in production builds. They exist to catch mistakes — especially in
> AI-generated code — early.

---

## ST1xxx — core / update / enhancer

| Code | Meaning | Common cause → fix |
|------|---------|--------------------|
| ST1001 | null/undefined | A value that must be defined was `null`/`undefined`. Check the path/argument. |
| ST1002 | circular reference | State contains a cycle. SignalTree state must be a tree (acyclic). Break the cycle or store an id reference. |
| ST1003 | updater invalid | An updater passed to `.update()` wasn't a function `(current) => next`. |
| ST1004 | lazy fallback | Lazy materialization fell back to eager — informational. |
| ST1005 | signal creation failed | A leaf signal couldn't be created — usually a non-serializable/proxy value at a leaf. |
| ST1006 | update path not found | A merge/update targeted a path that doesn't exist in the tree shape. |
| ST1007 | update failed | An update threw mid-apply; see the chained error. |
| ST1008 | rollback failed | A transactional rollback couldn't restore prior state. |
| ST1009 | cleanup error | `tree.destroy()` / teardown threw; usually safe to ignore. |
| ST1010 | unknown preset | An unrecognized config preset name was passed. |
| ST1011 | strategy select | Internal: update-strategy selection issue. |
| ST1012 | tree destroyed | Operating on a tree after `destroy()`. Create a new tree. |
| ST1013 | update transaction | Transactional update issue; see chained error. |
| ST1014 | batching disabled | A batching API was called without the `batching()` enhancer. Add `.with(batching())`. |
| ST1015 | memoize disabled | Removed in 9.0.1 — use Angular `computed()` directly. |
| ST1016 | middleware missing | Middleware API used without the providing enhancer. |
| ST1017 | entity helpers missing | Entity helper used without the entity feature available. |
| ST1018 | time travel missing | `.undo()`/`.redo()` used without the `timeTravel` enhancer. Add it from `@signaltree/core`. |
| ST1019 | optimize missing | Optimization API used without `@signaltree/enterprise`. |
| ST1020 | update optimized missing | `updateOptimized()` requires the `enterprise()` enhancer. |
| ST1021 | cache missing | Cache API used without the providing enhancer. |
| ST1022 | performance disabled | Performance API used without it enabled in config. |
| ST1023 | enhancer order failed | Enhancers couldn't be ordered — check declared requires/provides. |
| ST1024 | enhancer cycle | Two enhancers require each other. Break the dependency cycle. |
| ST1025 | enhancer requirement missing | An enhancer requires another that isn't applied. Add the prerequisite `.with(...)`. |
| ST1026 | enhancer provides missing | An enhancer declared a capability it didn't provide. |
| ST1027 | enhancer failed | An enhancer threw while applying; see chained error. |
| ST1028 | enhancer not a function | A value passed to `.with()` wasn't an enhancer function. |
| ST1029 | no Angular context (effect) | `effect()` was created outside an injection context. Call within a constructor/`runInInjectionContext`. |
| ST1030 | no Angular context (subscribe) | Subscription created outside an injection context. |

## ST2xxx — entity / markers (dev-mode guardrails)

| Code | Meaning | Cause → fix |
|------|---------|-------------|
| ST2001 | entityMap entity has no id | Entities resolved to `null`/`undefined` id, so they collide under one key. Give entities an `id` field, or `entityMap({ selectId: (e) => e.yourKey })`. |
| ST2002 | entityMap unknown method | A method from another library (Akita `.upsert`/`.add`, Elf `.addEntities`/`.setProps`, RxJS `.next`) was called. Use the SignalTree equivalent named in the warning (`upsertOne`, `addMany`, …). |
| ST2003 | ref-identical write skipped | A merge write passed a value reference-identical to the current value — a no-op. You likely mutated an object/array in place; return a NEW reference (spread/slice/map) so the change is observed. |
