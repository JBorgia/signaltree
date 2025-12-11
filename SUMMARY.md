# SignalTree v5.0 - Plan Summary

## The Goal
Add **PathNotifier** (simple change notification) + **Entity Collections** (Map-based CRUD with scoped hooks) to SignalTree.

## The Reality Check
Your teammate caught us overengineering. Scope corrected:
- **Was:** 20-25 days with 1500 lines of complex optimizations
- **Now:** 12-16 days with 950 lines of focused implementation

## What We're Building

### PathNotifier (Phase 2: 2 days)
```typescript
// packages/core/src/lib/path-notifier.ts (~50 lines)
class PathNotifier {
  subscribe(pattern: string, handler): unsubscribe
  notify(path: string, value, prev)
}
```
**Keep it simple.** No interceptors, no complex patterns. Just notify subscribers.

### Entity System (Phase 3: 5-7 days)
```typescript
// packages/core/src/lib/entity-signal.ts (~500 lines)
tree.$.users: EntitySignal<User, string>
  ├── addOne(entity): Key
  ├── updateOne(key, updates): void
  ├── removeOne(key): void
  ├── all(): Signal<Entity[]>
  ├── tap(handlers): unsubscribe
  └── intercept(handlers): unsubscribe
```
**Key feature:** Hooks are scoped to the EntitySignal. No global pollution.

### Integration (Phase 4: 2 days)
Wire PathNotifier to existing enhancers (TimeTravel, Logging, Batching, Persistence).

## Timeline
| Phase | Task | Days |
|-------|------|------|
| 1 | Types | ✅ DONE |
| 2 | PathNotifier | 2 |
| 3 | Entity System | 5-7 |
| 4 | Integration | 2 |
| 5 | Testing | 1 |
| 6 | Docs | 1 |
| 7 | Release | 1 |
| **TOTAL** | | **12-16 days** |

## What We Decided NOT to Do

| Idea | Why Not |
|------|---------|
| Effect-based persistence | Forces full tree read on every change (wasteful) |
| Computed change streams | O(n) overhead on every access (bad) |
| Selective path enhancement | Scoping confusion, doubles cognitive load |
| Per-path subscriber maps | Premature optimization (profile first) |
| Batch suspension API | Breaks "invisible infrastructure" principle |
| Separate entry points | Lazy init is enough (no user burden) |
| Rebuild WeakRef/debug/structural sharing | Already implemented (reuse!) |

## Key Lessons

✅ **Reuse existing infrastructure** - Don't rebuild what works  
✅ **Keep it simple** - Add complexity only when proven needed  
✅ **Invisible infrastructure** - Users work with entities, not PathNotifier  
✅ **Entity-first DX** - Matches how developers think  
✅ **Signal-native** - Feels like Angular signals  

## Next Steps

Ready to start Phase 2 whenever you give the signal:

1. Implement `path-notifier.ts` (~50 lines)
2. Implement `entity-signal.ts` (~500 lines)
3. Wire to enhancers
4. Test
5. Release

All planning complete. Architecture locked. Ready to code.

---

**See:** `PLAN_v5.0_FINAL.md` for full details  
**Status:** 🟢 Ready to implement  
**Confidence:** HIGH
