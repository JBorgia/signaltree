# The competitive position for position-attributed transactions

**Status:** competitive analysis, 2026-08-11. Companion to
[history-the-greenfield-target.md](./history-the-greenfield-target.md) (what is being
built) and [history-priority-hierarchy.md](./history-priority-hierarchy.md) (what wins
when two goals conflict).

This page exists to kill one claim before it is ever published and to replace it with a
narrower one that survives contact with the market. Every competitor claim below is
quoted from that project's **own current documentation**, fetched and verified rather
than recalled.

---

## 1. The claim that must never ship

> ~~"The only state library with multi-position optimistic transactions."~~

**False.** TanStack DB ships that today: optimistic writes by default, named optimistic
actions, transactions spanning multiple collections, manual `commit()`/`rollback()`,
automatic rollback on persistence failure, and framework packages for Angular, React,
Solid, Vue, Svelte and vanilla JS.

There is **no empty category here**. Anyone positioning this as a first is going to be
corrected in public by a project with a bigger audience.

## 2. The claim that does survive

> **SignalTree is not trying to invent optimistic transactions. It is trying to make
> optimistic transactions safe under overlapping writers, across arbitrary
> application-state boundaries.**

Narrower, and much better, because the two halves are both defensible and both verified.

### 2a. Overlapping writers — TanStack DB cascades, we intend not to

TanStack DB's `Transaction` reference describes `rollback` as:

> "Rollback the transaction and any conflicting transactions"

and its own example makes the consequence explicit:

```ts
tx1.rollback(); // This will also rollback tx2 due to conflict
```

So when two transactions touch the same item, rolling back the first **also discards the
second**. That is a coherent, defensible design — it is simple and it never guesses. It is
also precisely the behaviour the position-attributed model exists to avoid:

```text
T42: truck.driverId = B      (optimistic, later rejected)
T43: truck.location = Denver (telemetry, legitimate)

cascade model      -> rejecting T42 can discard T43
position-attributed-> driver assignment reverts, location survives
```

and the harder case, which is what 0B was built to exercise:

```text
T42: x = B     (rejected)
T43: x = C     (legitimate, later)

target: C survives, because T42's contribution to x was already superseded
```

**This is the competitive leverage.** Not "we have transactions" — "we compensate a
rejected logical action without discarding legitimate later work, and we say
`cannot-reconcile` instead of guessing when the semantics genuinely cannot be known."

### 2b. The incumbent concedes the problem in its own docs

RTK Query generates Immer forward/inverse patches and returns an `undo()`. Its manual
cache-updates page then warns:

> "Where many mutations are potentially triggered in short succession causing overlapping
> requests, you may encounter race conditions if attempting to roll back patches using the
> `.undo` property on failures."

and recommends:

> "For these scenarios, it is often simplest and safest to invalidate the tags on error
> instead, and re-fetch truly up-to-date data from the server."

That is the largest state library in the ecosystem documenting that inverse-patch rollback
under overlapping optimistic mutations is unsafe, and advising a round trip instead. **The
problem is real, conceded, and currently answered by giving up the optimism.**

---

## 3. There is no technical moat, and the strategy must not assume one

Several projects already hold the raw material — a mutation-time change record — which is
the expensive part.

| system               | ability to enter                          | why                                                                                                                           |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **TanStack DB**      | **already there**                         | multi-collection optimistic transactions and rollback ship now, across five frameworks                                        |
| **Legend-State**     | high                                      | fine-grained, path-oriented, mutable, local-first with optimistic sync; change records already expose path/current/previous   |
| **MobX-State-Tree**  | high                                      | emits JSON patches as mutations happen, patches reverse-apply, actions are observable, listeners attach at arbitrary subtrees |
| **Redux / RTK**      | medium-high                               | Immer patches and actions exist; precise overlapping rollback is not current semantics (see §2b)                              |
| **NgRx SignalStore** | medium                                    | highly extensible with custom features and entity collections; would need transaction/ownership machinery                     |
| **Yjs**              | already solves a stronger related problem | selective undo scoped by shared type and transaction `origin` — but inside a CRDT, for a different application category       |

Two consequences worth stating plainly:

- **Do not claim SignalTree alone avoids whole-tree diffing.** MST emits changes from its
  mutation system too; it does not reconcile roots either.
- **Do not claim performance superiority for the transaction engine.** No cross-library
  benchmark exists. What is defensible is the _cost centre_: the mutation path already
  hands over `path`, `before`, `after` and optionally owner, so the engine starts from the
  write tuple instead of having to discover it. Measured: passing an unused owner has **no
  detectable cost** (+0.68%, CI −0.51%..+2.24%, A/A floor 0.18%).

So the moat is **coherence, semantics, ergonomics and adoption** — not inimitability.

## 4. Where the semantic differentiator actually lives

Every competitor draws its transaction boundary around a _data_ concept:

| system         | boundary                                                         |
| -------------- | ---------------------------------------------------------------- |
| TanStack DB    | collection                                                       |
| Redux          | slice / cache entry                                              |
| Yjs            | shared type                                                      |
| MST            | tree node                                                        |
| **SignalTree** | **an ownership position declared by the state structure itself** |

That is why a turn can span `form()`, `entityMap`, `status()`, `stored()`, plain state,
selection and async state in one operation **without pretending they are all database
rows**. TanStack DB is an exceptionally strong system for data collections; the opening is
to be the analogous system for **application state as a whole**.

## 5. The hard boundary — do not oversell reversibility

**SignalTree can make application-state effects attributable and reversible. It cannot
reverse irreversible external effects.** If a turn sets `customer.status = contacted`
_and_ sends an email, rollback restores the status and the email stays sent. Same for
charging a card, placing an order, dispatching a truck, deleting a cloud resource.

Those need idempotency, cancellation or domain compensation from the tool being called.
This limit becomes more prominent, not less, once agents are performing the actions — so
it belongs in the public description from the start rather than being discovered by an
adopter.

## 6. Angular-first, but do not trap the kernel

**Publicly: stay Angular-only for now.** Narrower competitive field, a real adopter with
concrete workloads, and existing depth and credibility in the framework. Launching
React/Vue/Solid while `PositionId` is still unproven would be a mistake.

**Architecturally: stop making Angular-only irreversible, starting now.** Enforce the
dependency direction while it is free:

```text
transaction / ownership kernel        <- pure TypeScript, no Angular
├── PositionId, TurnId
├── turn store, position indexes, frontier
├── rollback resolver, supersession
├── collection anchors
└── conflict outcomes
              ▲
              │  MutationRecord
              │
@signaltree/core                      <- Angular SignalTree
└── markers, tree, entityMap, PathNotifier, Angular integration
```

The boundary is deliberately boring:

```ts
interface MutationRecord {
  position: PositionId;
  path: Path;
  before: unknown;
  after: unknown;
  mutation?: CollectionMutation;
}
```

The engine must not care whether that record came from an Angular signal, a Vue ref, a
Solid signal or a future vanilla runtime. **SignalTree Angular should be the first and best
producer of those records, not the only possible one.**

An adapter cannot conjure the advantage, and that is worth being honest about: a store that
can only offer `oldRoot`/`newRoot` still has to derive the records, so a foreign adapter
would pay a higher capture cost and get weaker semantics while sharing the same rollback
engine. That is a tiering story, not a portability problem.

**Why bother now:** if the kernel turns out to be the more valuable invention, discovering
in two years that it is welded to `Signal<T>` would be an expensive, entirely avoidable
mistake. Keeping Phase 1–5 free of unnecessary Angular primitives costs approximately
nothing today.

---

## 7. What to do with this

- **Do not** publish a uniqueness claim. Publish the _sharpened_ claim in §2.
- **Do** benchmark the compensation semantics against the cascade model — that comparison
  is the differentiator and it is falsifiable. If production 0B cannot preserve legitimate
  later writes, the differentiator evaporates and the honest position becomes "another
  transaction implementation".
- **Do** keep the §5 boundary in any public description.
- **Superseded:** the older "MST / Yjs audit" open item is largely discharged by this page.
  What remains is a live comparison against **TanStack DB**, which is the competitor that
  matters and was not previously on the list.
