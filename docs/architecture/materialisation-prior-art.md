# Micro-materialisation: what we built, and what the field already knows

**Status:** research, pre-14.0.0. Written to answer one question — _is the
materialisation architecture we arrived at the right one, or should we pivot
before 14.0.0 ships?_

> **AUDIT, 14.0.0.** Two claims this document made about SignalTree's own code
> were checked and are **wrong**; both corrections are inline.
>
> 1. **§1 said markers declare `owns` on the registry. There is no `owns` hook**
>    — the contract is `check` / `create` / `snapshot` / `hydrate` / `transient`.
>    Source ownership is decided inside each marker's `hydrate`, which already
>    receives the mode. The error came from three stale comments in
>    `materialize-markers.ts` that described `owns()` as though it shipped; those
>    comments are now fixed, since a research doc repeating a stale comment as
>    fact is exactly how one becomes canon.
> 2. **§4.2 reported that `hydrate` fires no `tap` handlers. It fires them
>    normally.** Only `onChange` was registered, for what is an `onAdd` event.
>
> Also from the audit, and not this document's error: `ST2022` was being emitted
> from three unrelated conditions. The two hydrate-payload cases are now
> **ST2024**, and the legacy-payload upgrade path is pinned by
> `legacy-payload.spec.ts`.

**Headline: no pivot is warranted, and that is the finding.** Where we converged
with these systems we converged independently on the shape they landed on; where
we differ, it is because SignalTree has a property none of them have. The one
suspected defect was run and **refuted**; what remains are three additive ideas
and one recorded non-decision.

**Evidence discipline.** Two kinds of claim, kept apart deliberately:

- **Claims about SignalTree are MEASURED** unless marked otherwise — the
  torn-read result (§4), memo retention (§3.2) and the reference-sharing table
  were run against the working tree, and the scratch specs deleted afterwards.
- **Claims about other systems are RESEARCHED, not verified by use.** They come
  from published papers and documentation, linked at the end. Where a specific
  API spelling carried weight it was checked against primary docs; the
  architectural characterisations were not independently reproduced.

Two numbers in here contradict an earlier revision of this same document (§3.2's
retention figure, §4's whole premise). Both corrections are kept inline rather
than quietly edited out, because in this investigation the wrong-then-corrected
claims have been more instructive than the right-first-time ones.

---

## 1. What we actually built, named precisely

**Demand-driven incremental view maintenance over a reactive dependency graph**,
with per-node memoisation, structural sharing, and a per-marker snapshot/hydrate
contract.

"Micro-materialisation of a state store" gets the shape right and attaches it to
the wrong family. The relevant literature is incremental view maintenance and
partially-stateful dataflow, not storage engines.

Concretely, as of 14.0.0:

| mechanism           | implementation                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| The view            | `tree()` — a plain object materialised from the signal graph                      |
| Incremental refresh | one `computed` per node in a `WeakMap`, invalidated by Angular's dependency graph |
| Structural sharing  | a clean subtree is returned BY REFERENCE; a one-leaf write rebuilds O(depth)      |
| Demand-driven       | the `computed` is created lazily; a node never read allocates nothing             |
| Per-node contract   | markers declare `snapshot` / `hydrate` / `transient` on the marker registry       |
| Restore semantics   | `HydrateMode` = `merge` \| `restore` \| `rehydrate`, chosen by the call site      |

## 2. The property that makes us different

Every system compared below maintains derived state whose **source of truth has
moved on**. Noria's operators cannot recompute evicted state without querying
ancestors. Kafka Streams' store cannot rebuild without replaying a changelog.
Materialize's arrangements exist because the input is a stream, not a table.

**SignalTree's source of truth is always resident.** The signals hold it, in
process, for the lifetime of the tree. `tree()` is a pure cache over data that
never leaves.

That single asymmetry changes the cost of nearly every technique below, and it is
the reason most of them are cheaper for us than for the system that invented
them. It is worth stating explicitly because it is easy to import machinery whose
whole purpose is to survive the absence of a source we still have.

---

## 3. Family by family

### 3.1 RocksDB / LSM — false friend

The overlap is immutable versions plus cheap consistent snapshots, which is MVCC
and persistent data structures generally — better learned from Clojure or immer
than from a storage engine. Everything that makes RocksDB _RocksDB_ (memtables,
WAL, SSTable leveling, compaction, bloom filters, block cache) manages write
amplification against disk. We have no disk.

**The one useful lesson is by inversion.** LSM buys cheap writes at the cost of
read amplification. We do the opposite: reads are memoised to near-free and the
write path pays the invalidation (~17ns, per the correction recorded in the
handoff). Any instinct to import LSM machinery optimises the side that is not
hurting.

### 3.2 Noria — closest structural match, inverted in our favour

Noria's partially-stateful dataflow lets an operator hold only a subset of its
state, with **eviction notices** flowing forward and **upqueries** recursively
refilling missing state from ancestors on demand. Its stated motivations —
reduce memory, evict rarely-used state, and relieve operators of maintaining
state that is never read — are the same three we have.

**We already have partial materialisation.** The per-node `computed` is created
lazily, so a node never read costs nothing; and because a `computed` is lazy, an
invalidated-but-unread node costs nothing to recompute either.

**We do not have eviction.** Once a node has been read, its memo retains the last
materialised value for the node's lifetime.

**The inversion:** Noria needed upqueries because refilling evicted state is
hard. For us eviction is `WeakMap.delete` and the signals rebuild the node on
next read. Eviction is _strictly cheaper for us than for the system that invented
the need for it._

**Whether we need it — MEASURED, and the answer is no.**

Container leaves are shared, not copied. Reference identity between the snapshot
and live state:

| leaf kind                | shared with live? |
| ------------------------ | ----------------- |
| `Array` (10k elements)   | ✅ same object    |
| `Map`                    | ✅ same object    |
| `Date`                   | ✅ same object    |
| `entityMap.all` array    | ✅ same object    |
| entity objects within it | ✅ same objects   |

So a 10k-row `entityMap` retains one array reference, not 10k objects — which is
also why the snapshot-aliasing contract exists (`snapshot-aliasing.spec.ts`).

What the memo does retain is the **node scaffolding**: one plain object per node,
holding scalar leaves by value. Measured on a 200×200 grid (40k scalar leaves),
`heapUsed` delta with forced GC:

| operation                    | retained    |
| ---------------------------- | ----------- |
| materialise 40k leaves       | **3.32 MB** |
| second read (memo hit)       | 0.00 MB     |
| one leaf write, then re-read | +1.54 MB    |

≈83 bytes per scalar leaf, and zero on a repeat read — the memo behaves as
designed. **Eviction is not worth building.** The +1.54 MB after a single-leaf
write is unexplained and larger than an O(depth) rebuild should cost; noted
rather than explained.

**Methodology note, because it nearly produced a wrong recommendation.** The same
measurement **without** forced GC reported **25.71 MB** — 8× high, and enough to
have flipped this section's conclusion to "eviction is worth considering." Heap
deltas without `--expose-gc` measure allocation, not retention. This is the same
class of error as the in-process benchmark phantom recorded in HANDOFF §7.1.

### 3.3 Kafka Streams — strong on the restoration axis

The mechanism that matters: a **checkpoint file** records the last offset the
state store captured, and restoration replays the changelog **from that offset**
rather than from the beginning. That is log-plus-keyframe, and it is the standard
answer to the objection that killed diff-based time travel here (§5.2).

Stream–table duality is the general form: a table is the current state of a log;
a log is the changelog of a table. Kafka Streams does not choose between them.

**Convergence worth noting:** the rule in `7e194372` — _"on rehydrate, a marker
that owns a source declines; one that does not, accepts"_ — is the same shape as
a state store declaring that something else owns its truth. We derived it from a
measured clobber, not from Kafka. Independent convergence is a good sign.

**CONFIRMED:** the API is `Materialized.withLoggingDisabled()`, which disables
change logging for a materialized state store, present since at least Kafka
2.1.0. A store declaring that nothing should restore it from a changelog is the
same statement as a marker declaring that it owns its own source.

Not applicable: standby replicas, rebalancing, exactly-once semantics — all
distribution concerns.

### 3.4 Materialize / differential dataflow — one genuine gap

Differential dataflow performs work proportional to the size of the change rather
than the size of the data, which is the same principle as our memo.

The idea we do **not** have is **virtual time**: every update carries an explicit
timestamp on a common timeline, so components read consistent state without
synchronising with each other. In a single-threaded runtime this mostly does not
apply — but "mostly" is doing real work in that sentence, and §4 is where it
stops applying.

Not applicable: arrangements (multi-version indexed state) are over-engineering
for an in-process graph where the current value is one deref away.

**§4 settles this one.** The torn-read hypothesis was the only reason to think we
needed a consistency mechanism, and it was refuted. We do not need virtual time.

**RisingWave**, the other system in this family, differs from Materialize on
exactly the axis that does not concern us: it pushes state to S3-compatible
object storage rather than holding it in memory, and offers **snapshot
consistency within a checkpoint** (1s default) rather than Materialize's
strict serializability. Both choices are about surviving a distributed,
restartable compute layer. The consistency-model distinction is instructive only
as confirmation that "how consistent is a read" is a real design axis in this
family — and that ours is settled by being single-threaded.

### 3.4b CRDTs (Automerge, Yjs) — the best answer to our version question

Not a materialisation family, but the closest prior art for the **payload format
version** decision that 14.0.0 just committed to (`98b7dbe1`, format `2.0.0`).

**Automerge's compatibility policy is asymmetric, and that is the useful part:**
3.x reads documents written by 1.x and 2.x, while documents written by 3.x may
**not** be readable by older clients. New reads old; old is not expected to read
new. That is precisely the right rule for our rolling-deploy / SSR-skew case:
the version tag exists so a NEW reader can recognise an OLD payload, and no
attempt is made at the reverse.

**The cautionary tale is also theirs.** The 1.x → 2.x move to a binary format was
a deliberate break, mitigated by shipping an explicit **upgrade tool** — and a
later change that dropped 32-bit float support made earlier documents
unreadable, needing a patch to migrate them. Even a project that takes format
compatibility seriously breaks readers; what distinguishes it is shipping the
migration rather than the apology.

**Yjs adds one idea we do not have and may not need:** `encodeStateAsUpdate(doc,
targetStateVector)` writes only the differences the reader is missing — the
reader declares what it already has and the writer sends the remainder. That is
Avro's reader/writer schema resolution in another guise, and it is the
industrial-strength version of a version tag. Overkill for a `localStorage`
payload; the right reference point if snapshots ever cross a network.

### 3.5 Event sourcing / Akka Persistence — reframes the time-travel question

The governing principle: **a snapshot is an optimisation, not a replacement for
events.** Recovery loads the latest snapshot and replays only the events after
it. Snapshot frequency is a tunable, not a design commitment.

This directly reframes [`optimisation-options.md`](./optimisation-options.md)
§B1 vs §B2 — see §5.2.

### 3.6 Datomic — the idea nobody here had raised, and why it was DROPPED

Two mechanisms, both apparently a natural fit for an architecture that already
has immutable snapshots and structural sharing:

- **`as-of`** — time travel as a **query over an immutable value**, not a
  mutation of live state.
- **`with`** — apply facts **speculatively**, in memory, producing a queryable
  value that was never committed.

An earlier revision called `with()` "the only item in this document that would
be a NEW capability" and recommended it for 14.0.0. **That recommendation is
withdrawn.** Enumerating the use cases collapses it:

| use case                     | already served?                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimistic update + rollback | **Yes — MEASURED.** `const before = tree()` → mutate → `tree(before)` restores exactly, across `entityMap`, `status`, `form`, plain leaves and derived. And it works _because of_ this release |
| Form drafts                  | Yes — that is what `form()` is                                                                                                                                                                 |
| Time-travel scrub            | Mostly — `jumpTo` exists; preview-without-commit is a devtools nicety                                                                                                                          |
| Preview modes                | No — but a component usually computes the previewed value locally rather than forking global state                                                                                             |

**The decisive argument is structural, not a cost estimate.** Datomic's `with()`
is valuable _because Datomic has a query language_: you speculate, then run
arbitrary queries against the result. SignalTree has no query surface — you read
fields. "What would `$.a.b` be if I set `$.a.b`?" is the value you were about to
set. **Speculation only pays where it propagates**, and the propagation surface
here is `.derived()`, which is a much smaller thing than a query engine.

⚠️ **One argument used to reach this conclusion does NOT hold, and is recorded so
it is not reused:** "46 `.derived()` call sites repo-wide, 18 in the demo" was
offered as evidence that the propagation surface is small. It is not evidence.
That counts _our own_ usage of _our own_ feature — a demo under-uses derived
precisely because demos showcase primitives. Measuring demand for a library
feature by grepping the library's own repo is close to circular. The structural
argument above stands on its own and needs no volume estimate.

There was also a real implementation hazard, now moot: `memoKey()` resolves an
accessor to its backing store, so a speculative tree sharing stores would write
into the same `MATERIALIZED` cells as the real tree — the shared-cell bug step 1
deleted, reintroduced deliberately. Copy-on-write shadow stores would have
solved it (new store objects along the patched path only; `MATERIALIZED` is
keyed on object identity, so unchanged subtrees correctly reuse their cells).
Tractable — but tractability was never the question.

**`as-of` is not dropped, merely unbuilt.** `getHistory()` already returns entry
states by reference, so reading a past value without mutating live state is
close to free. Nobody has asked for it.

---

## 4. The torn-read hypothesis — RUN, and REFUTED

An earlier revision of this document proposed, from reading code, that a `tap`
handler reading `tree()` during a batched multi-entity write would observe a
partially applied state. **MEASURED. It does not.** Recorded in full because the
reasoning was plausible and should not be re-proposed.

**The hypothesis rested on two facts, both true:**

1. `batchScope` (`internals/batch-scope.ts`) only increments and decrements a
   depth counter. Signal values update immediately; only Angular's
   change-detection consolidation is batched.
2. `entityMap` runs `tap` handlers **synchronously** inside `addMany` /
   `updateOne` / etc.

**The inference was wrong.** `addMany` applies every entity to the internal store
and calls `updateSignals()` **once**, and only then runs the tap handlers. So all
three handlers observe the final state:

```
tap onAdd during addMany([r1, r2, r3]):
  snapshot count seen each time: [3, 3, 3]     ← not [1, 2, 3]
  live count seen each time:     [3, 3, 3]
```

A batched entity write is atomic with respect to a synchronous observer.

### 4.1 The narrower thing that IS true, and is by design

Mixing writes inside one `batchScope` **is** observable mid-flight:

```
batchScope(() => { rows.addOne(r1); n.set(99); rows.addOne(r2); })
tap sees:  ["rows=1 n=0", "rows=2 n=99"]        ← first callback predates n.set
```

That is not a torn read of an operation; it is a synchronous observer watching
independent writes land in order. `batchScope`'s own doc comment says values
update immediately and only change detection is consolidated, so this is the
documented contract, not a defect. `batchScope` is also `@internal` — reachable
only via a root write, not called directly by applications.

**Conclusion: SignalTree does not need virtual time.** In a single-threaded
runtime with no deferred writes, the only "inconsistent" read is one taken from
inside a write, by code that chose to run there.

### 4.2 Side finding — ~~hydrate does not fire `tap`~~ — REFUTED

**This section was WRONG, and the error is instructive.** An earlier revision
reported that a hydrating root write "fires **no tap handlers at all**", based on
this measurement:

```
tap onChange during a hydrating root write:  []      (rows did change: 0 -> 1)
```

The observation is correct and the conclusion does not follow. Only `onChange`
was registered. `entityMap.hydrate` calls `setAll`, and a collection going
0 → 1 rows is an **add**, so `onAdd` fires and `onChange` correctly does not.
Re-run with all three handlers registered:

```
after addOne     : ["add:1"]
after hydrate    : ["add:2","add:3"]   count=2
after root write : ["add:9"]           count=1
```

**`hydrate` fires `tap` handlers normally**, through `setAll`, at both the
`hydrateMarkerNode` and root-write entry points. A `tap` used to mirror a
collection into a non-SignalTree store does **not** miss restores.

Kept rather than deleted because the failure mode generalises: a negative
result from a single observation channel says nothing about the other channels.
"No handler fired" needed every handler registered before it could be claimed —
the same shape as the `console.warn` vs `console.error` mistake recorded in
HANDOFF §7, where the wrong channel was captured and a correct claim was falsely
refuted. Here it ran the other way and produced a false defect report.

---

## 5. What to take, ranked

### 5.1 ~~Verify §4~~ — DONE, refuted

The torn-read hypothesis was the only possible **bug** in this document and it
does not reproduce (§4). Everything remaining is a design choice.

One item appeared to fall out of running it — "hydrate fires no `tap`
handlers" — and that has since been **refuted** (§4.2). It was an artefact of
registering only `onChange` for what is an `onAdd` event. Nothing outstanding.

### 5.1b Adopt Automerge's asymmetric compatibility rule, explicitly

We wrote format version `2.0.0` in `98b7dbe1` and deliberately deferred the
enforcement policy. §3.4b supplies the policy worth adopting: **a new reader
tolerates old payloads; an old reader is not expected to read new ones.**

**Mostly already done, and the gap was elsewhere.** The note at
`SNAPSHOT_FORMAT_VERSION` already records the asymmetric rule in substance —
`1.0.0` means LEGACY/UNKNOWN rather than "format 1", and "reject unknown
versions" would reject the entire installed base. Automerge's contribution is
the naming, not the decision.

What was actually missing was any **test** that a legacy payload survives the
upgrade — the one thing a breaking format release has to get right. Now pinned
by `legacy-payload.spec.ts`: a `1.0.0` payload does not throw, plain leaves
restore, an unreadable marker is left unchanged and says so via ST2024, and a
marker absent from the payload keeps its initial value. Nothing is silently
corrupted. Note also what is NOT recoverable: a legacy `entityMap` payload
emitted `map`, which JSON renders as `{}`, so those entities were never in the
file — there is nothing to migrate, which is why the shape had to change.

### 5.2 Reframe the time-travel question as changelog + keyframes

[`optimisation-options.md`](./optimisation-options.md) §533 records B1
(diff-based time travel) as **displaced** by B2 (snapshot-by-reference), on four
grounds: no diff format, no patch-application logic, no inverse-patch correctness
proof, and O(1) restore instead of O(replay).

Two of the four no longer hold as stated, and the reason is not that patches got
cheaper:

| original objection         | status now                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| no inverse-patch proof     | **stands** — still the strongest of the four                                                   |
| O(1) restore vs O(replay)  | **weakened** — assumed replay from zero; keyframes make it replay-from-nearest (§3.3, §3.5)    |
| no diff format             | **moved, not avoided** — snapshot restore now needs a marker-specific `hydrate` payload anyway |
| no patch-application logic | **moved, not avoided** — same reason                                                           |
| _(new)_                    | snapshots turned out to be **wrong for markers**, which was not known when B2 won              |

State the reversal that way and it is honest: the calculus changed because a
premise was falsified, not because the loser got better.

**Also relevant:** time travel already receives the full patch and discards it.
`interceptLeafSignals` calls `onWrite(path, next, prev, getActiveWriteContext())`
and time travel's callback uses those only to set a dirty flag, then materialises
the whole tree. Path, new value, old value and write metadata — in hand, at the
moment of recording, thrown away.

### 5.3 ~~Datomic-style `with()`~~ — DROPPED, with reasons (§3.6)

Not deferred. **Dropped**, so it is not re-proposed on the same grounds.

Optimistic rollback — the strongest use case — is already served by
`tree()` / `tree(before)`, measured across every marker type. And `with()` earns
its keep in Datomic because Datomic has a query language to run against the
speculative value; SignalTree has no query surface, so speculation only pays
where it propagates.

If preview demand appears later, reconsider it **with evidence from users**, not
from a grep of this repo (§3.6 records why that metric is invalid).

### 5.4 ~~Measure the eviction analysis~~ — DONE, do not build eviction

Per §3.2: 3.32 MB retained for 40k scalar leaves, 0 on a repeat read, container
leaves shared by reference. Not worth bounding. Recorded so it is not
rediscovered as a leak — and so the un-GC'd 25.71 MB figure, which pointed the
other way, is on record as an artefact rather than a measurement.

### 5.5 Make `hydrate`'s decisions observable — **DONE (14.0.0)**

Kafka Streams exposes restore progress because "did my state come back, and how
much of it" is a real question. Our `hydrate` makes real decisions — accepted,
**declined because a loader owns the source**, normalised `LOADING → NotLoaded` —
and reported none of them.

The argument that settled it was not "cheapest item on the list":

> Every other silence 14.0.0 fixed was PRE-EXISTING. The loader-declines rule is
> silence this release INTRODUCES.

Shipping a brand-new silent decision inside the release whose thesis is "make
the silence loud" is the one internal inconsistency a careful reader would find,
and it would be ours by construction rather than inherited.

Shipped as `onHydrateDecision` from `@signaltree/core/authoring` — an
observation seam, the same shape as `getPathNotifier`. Deliberately **not** a
warning: declining is correct, and warning on correct behaviour trains people to
ignore the channel, which is how the four bugs behind this release stayed
invisible.

**The design detail worth keeping:** the event carries a stable, machine-readable
`reason` (`'loader-owns-source'` | `'no-request-survives-boundary'`) that ships
to production, and a `detail` prose string that folds away with `ngDevMode`.
That follows the existing rule in
[`dropping-dev-code.md`](../performance/dropping-dev-code.md) — _advisory prose
is removable, identity is not._

An earlier revision guarded the whole call site to keep the prose out of the
bundle (0.19 KB gzip on the entities scenario). That made `onHydrateDecision` a
public API that **silently did nothing in a production build** — the exact defect
class 14.0.0 removed `tree.$.count(5)` for. Reverted, and pinned by a test whose
name says so.

---

## 6. What NOT to take

Recorded so it is not re-proposed:

| technique                            | why not                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| Compaction, leveling, bloom filters  | Disk write-amplification. No disk.                          |
| Memtable / WAL                       | Durability. `persistence()` is an enhancer, not the engine. |
| Standby replicas, rebalancing        | Distribution. Single process.                               |
| Exactly-once semantics, transactions | Needs a broker and idempotence keys.                        |
| Arrangements (multi-version index)   | The current value is one deref away.                        |
| Upqueries                            | We can always rebuild from signals — §3.2.                  |

The general rule: **the analogy is useful exactly as far as "materialised view
over a changelog" and stops there.** Everything past that boundary solves
durability or distribution, and we have neither problem.

---

## 7. What this document did NOT establish

The six gaps the first revision listed have been closed — §4 was run and
refuted, memo retention was measured, `withLoggingDisabled` confirmed,
RisingWave and the CRDT family added. What remains:

- **The +1.54 MB after a single-leaf write and re-read** (§3.2) is larger than an
  O(depth) rebuild should cost and is unexplained. Small, but it is the one
  number here nobody can account for.
- **Nothing outside `@signaltree/core` was examined.** `realtime` in particular
  transmits state, which is where the Yjs state-vector idea (§3.4b) would
  actually earn its keep, and it was not looked at.
- **No comparison was run against the systems themselves.** Every claim about
  Noria, Materialize, Kafka Streams, Akka, Datomic, Automerge and Yjs comes from
  their published papers and docs, not from using them. Where a specific API
  spelling mattered it was checked; the architectural characterisations were not
  independently verified.
- **The SignalTree measurements are single-machine, Node 24.3 / V8 13.6**, same
  caveat as everywhere else in this repo.

---

## Sources

- [Noria: dynamic, partially-stateful dataflow for high-performance web applications (OSDI '18)](https://pdos.csail.mit.edu/papers/noria:osdi18.pdf)
- [Noria — the morning paper summary](https://blog.acolyer.org/2018/10/29/noria-dynamic-partially-stateful-data-flow-for-high-performance-web-applications/)
- [Materialize — Virtual Time for Scalable Performance](https://materialize.com/blog/virtual-time-consistency-scalability/)
- [Materialize — Strong Consistency Guarantees](https://materialize.com/blog/strong-consistency-in-materialize/)
- [Kafka Streams — Changelogs and Standbys](https://developer.confluent.io/courses/kafka-streams/stateful-fault-tolerance/)
- [Kafka Streams — Architecture](https://kafka.apache.org/23/streams/architecture/)
- [Akka — Event Sourcing](https://doc.akka.io/libraries/akka-core/current/typed/persistence.html)
- [Datomic — time-travelling data and immutable semantics](https://medium.com/cmcc-deepdive/5-datomic-time-traveling-data-immutable-semantics-804ae7f6ec05)
