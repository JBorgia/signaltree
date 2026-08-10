Che# Review brief — 14.0.0 hardening session, 2026-08-07

**For:** a reviewing agent, independent of the one that did the work.
**Range:** `b254edc1..HEAD` — 26 commits, 113 files, +11,859 / −3,982.
**State:** working tree clean, `node tools/verify-gates.mjs` 33/33, `npm run format:check` exit 0.

Your job is not to confirm this. Several claims below were wrong when this
session started **and were confirmed green by tooling at the time** — the
tooling was broken. Assume the same could be true of the fixes.

---

## 0. Fastest way in

```bash
node tools/verify-gates.mjs            # 33 gates, builds its own dist first
node tools/verify-gates.mjs --self-test # each gate must FAIL against a mutation
npm run format:check                    # exit 0
git log --format='%h %s' b254edc1..HEAD
```

Every commit message states its evidence. Where a number appears, a tool
produces it — that is itself one of the changes, and the highest-value thing to
attack (§8).

---

## 1. The through-line

Almost every finding came from one question — **"compared to what?"** — applied
to something already shipped and already passing tests. Four defects were
introduced _during this session_, with passing tests, and found by re-auditing
rather than by new work. Two published surfaces had been wrong for releases.

The recurring failure has a single shape: **bounding or judging a proxy instead
of the quantity that costs something.** Row count instead of `entries × width`.
Per-container instead of aggregate. "Does it pass?" instead of "against what?"

If you find nothing else, test that shape against what is here.

---

## 2. `deepEqual` — the default leaf comparator

`packages/shared/src/lib/deep-equal.ts`. Runs on **every leaf write**, so it is
the highest-blast-radius file touched.

| change                                                            | commit     | evidence                                                  |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| per-element inline reference check replacing `.every()`           | `9d312759` | 159µs → 37.9µs, 50k array, one change                     |
| cycle guard — depth-gated lazy `WeakMap` at depth 64              | `6d007e0b` | previously threw `RangeError` on any cyclic value         |
| `hasOwnProperty` instead of `key in objB`                         | `867db431` | **false-EQUAL** on differing own-key sets → dropped write |
| constructor-identity gate replacing the prototype/`toString` gate | `e42823cc` | 168.5µs → 140.0µs (17%), 14.4ns/object node               |

### What to attack

- **The constructor gate is a BREAKING semantic change.** Four pairs flip from
  equal to unequal: class-instance vs plain object, `Object.create(null)` vs
  `{}`, cross-realm `{}`, prototype-forged `Object.create(Date.prototype)`. My
  argument is that all four move toward "changed", which for a signal's `equal`
  costs a redundant notification, whereas the opposite direction **drops the
  write silently**. Verify that asymmetry actually holds for every caller of
  `deepEqual`, not just leaf writes — `edit-session.isDirty` and
  `guardrails.findInPlaceMutations` also call it.
- **The 20,000-pair parity suite passed unchanged through that edit**, because
  its generator only emits plain objects and arrays. Silence there was not
  evidence. Check whether the generator should be extended rather than trusted.
- `CYCLE_GUARD_DEPTH = 64` is a reasoned bound, not a derived one.

---

## 3. `entityMap({ history: false })` + ST2029 — RFC 0012

`048ff729`, then substantially **rewritten** in `54b873d9`.

A history entry holds the tree snapshot; a collection's snapshot is an N-pointer
array rebuilt on every change. Measured over 50 writes at 50k rows: **24.73MB →
5.61MB**. Serialisation verified byte-identical; prune cost 0.09µs with no
exclusions.

### The part worth your attention

**ST2029 as first shipped never fired in a real application.** It checked once
at enhancer attach — the one moment it cannot work, because an app builds its
tree and attaches `timeTravel()` in the same breath while rows arrive later from
a fetch. It passed three tests because all three populated the collection
_before_ attaching.

> **The generalisable failure: a test can encode the implementation's
> assumptions instead of the requirement's, and then confirm them.** Sibling of
> the lesson already in `undo-redo-vs-devtools.md` ("a test that exercises two
> things at once can pass for the wrong one").

Now checked at **record time**, sampled every 16 entries, thresholded on
**retained pointers** (`entries × width`, budget 500k ≈ 5MB) rather than a
guessed row count. A row count called a 20,000-row grid edited twice a problem
and a 50-row list edited for an hour fine.

**Verify:** `packages/core/src/lib/history-scoped-capture.spec.ts`. Every test
uses build → attach → load order. Confirm none of them silently reverts to
test-friendly ordering. Also confirm `undo()` genuinely does _not_ revert an
excluded collection — that partial-undo tradeoff is documented in three places
and is the risk of the whole feature.

---

## 4. Guardrails — redesigned twice

`41b80b64` → `cbd68e76` → `16ce77e7`. This is the largest behavioural change and
the one I would review hardest.

**First pass (`41b80b64`) I got wrong in framing.** I asked keep-the-clone vs
remove-it, found a third option, and stopped. That never asked what the clone
was competing against.

**The premise that changed it:** `tree()` returns the identical object when
nothing changed and a new one when something did, and a **no-op write does not
produce a new one** because the leaf's `equal` suppressed it. So reference
identity is an _exact_ O(1) change oracle.

|                   | idle poll (what guardrails does 20×/s) |
| ----------------- | -------------------------------------- |
| clone + diff      | 32.5µs (100 branches) · 122.8µs (400)  |
| reference compare | **0.080µs · 0.045µs**                  |

The clone was worse on three axes, not one: 87.9µs to make, _and_ it destroyed
the structural-sharing short-circuit in both `deepEqual` and
`detectChangedPaths`, because a copy shares nothing.

**Now:** `cur !== prev` → diff paths. `cur === prev` → a signal-driven change is
impossible, so check containers only. Containers (array/`Map`/`Set`/`Date`) get
an O(1) shape check at any size plus a contents copy under an **aggregate**
5,000-element budget — that budget was per-container (1,000) for an hour, which
is the same wrong-noun error, since fifty containers of 999 pass individually.

Also here: a **polling backstop** now runs alongside PathNotifier (previously
guardrails used a strategy that could see nothing and warned speculatively about
it), and opt-in **`strictImmutability`** freezes snapshots so in-place mutation
throws at the mutating line.

### What to attack

- **The reference-oracle premise is load-bearing.** If `tree()` can ever return
  a new object when nothing meaningfully changed, guardrails reports phantom
  changes. If it can return the same object when something _did_ change,
  guardrails goes blind. Test this against markers (`entityMap`, `form`,
  `status`, `asyncSource`) — my probes used plain state.
- The guardrails tests use a **mock tree**, not real `signalTree`. It honours
  the contract by construction, which is exactly the kind of test that can pass
  for the wrong reason. Worth re-running key cases against a real tree.
- `WATCH_CONTENTS_BUDGET = 5000` is derived from deepEqual's array rate, but the
  in-place gap it leaves (a field edit inside a container past the budget) is a
  real capability loss.
- `strictImmutability` freezes values the caller still owns — `tree.$.rows()` is
  the array they passed to `.set()`. Confirm the docs' warning is prominent.

---

## 5. `createEditSession` — ST2028

`bc1be17a`. **The clearest self-inflicted inconsistency of the session:** I
wrote ST2028 in the morning declaring this JSON fallback acceptable, then four
hours later concluded the _identical_ fallback in guardrails was unacceptable.

`structuredClone` throws on a function, so one callback anywhere dropped the
whole edited value onto `JSON.parse(JSON.stringify())`. After `applyChanges` →
`undo`: `Date` → string, `Map`/`Set` → `{}`, `undefined` key dropped, **and the
callback itself gone.** User-visible data corruption in an undo stack.

Replaced with a type-aware walk preserving `Date`/`Map`/`Set`/`RegExp`/
`undefined`/cycles/class prototypes. Functions pass by reference (correct — no
state to restore).

**Two things to check:**

- I used `Object.keys` first and lost `Error.message` (own but non-enumerable) —
  the trap `deepEqual` documents one file over, and I walked into it anyway. Now
  uses own property **descriptors**, with accessors read once and stored as
  data. Verify that doesn't break anything expecting live getters.
- **There are two spec files here and they overlap**:
  `edit-session-clone-fidelity.spec.ts` (3 tests, the renamed original, one test
  _inverted_ because it had pinned the defect as the contract) and
  `edit-session-lossless-clone.spec.ts` (5 tests, new). Consider merging. The
  inverted test is deliberately kept with a note — a test can lock in a bug as
  firmly as a requirement.

---

## 6. ST2026 — rate, not count

`e216c8c9`. Counting distinct predicate identities eventually accused
`v => v.x > threshold` rebuilt when `threshold` changes: identical source, a
genuinely new closure, and **"hoist it" is advice that would break it.** Now 12
identities within a 2-second window (~6/s). A test runs 500 rebuilds spaced 5s
apart — 40 minutes of simulated use — and asserts silence.

**Attack:** the window uses `performance.now()`. Confirm behaviour under fake
timers and in a zoneless app.

---

## 7. The tooling was lying — read this before trusting any number

`d11cd19a`, `bdbc7e2d`. **Two bugs, survivable alone, blinding together.**

1. `npm run build` resolved to a project with no build target and exited 1, so
   nothing rebuilt `dist/`.
2. `check-bundle-budget.mjs` measures `dist/`, not source, and never checked the
   artifact matched the code under test.
3. Worse: **`needsBuild` was declared on 23 gates in `verify-gates.mjs` and read
   by nothing.** It looked like machinery and was documentation.

So `npm run gates` — the command that decides whether a release ships — ran 23
dist-reading gates against an artifact nobody had rebuilt. **Every "✅ within
budget" in this session's earlier commit messages was measuring code from before
the change it was verifying.**

Both fixed; the gate builds for itself. Timestamps were tried and rejected: an
Nx cache _restore_ writes correct output without bumping mtimes, so
"source newer than dist" reports staleness that isn't real, and a check with
false alarms gets disabled.

**First honest baseline, both ends rebuilt from source:**

|          | b254edc1     | now          | prod Δ |
| -------- | ------------ | ------------ | ------ |
| bare     | 5.70 / 7.45  | 5.79 / 7.80  | +0.09  |
| entities | 9.13 / 11.56 | 9.40 / 12.07 | +0.27  |
| form     | 7.80 / 9.81  | 7.90 / 10.16 | +0.10  |

entities prod re-baselined 9.4 → 9.5. **Older attributions in
`check-bundle-budget.mjs` were left as written with a warning, not corrected** —
they were computed against stale output and inventing replacements would be no
better.

**Attack this hardest.** If the build/measure path is still wrong in some way,
every number in this document is suspect again.

---

## 8. Published numbers were wrong on every surface checked

`bdbc7e2d`, `97470b87`, `51c3d496`.

**Sizes.** The proof they were never verified: the two AI-priming files
disagreed with _each other_ — 5.70KB vs 5.46KB for the same bare tree.
`llms-full.txt`'s competitor figures were wrong too (SignalStore 2.3 vs 1.92
measured; NgXs 8.9 vs 7.44) while `llms.txt`'s were right. Five surfaces
corrected.

**Two rows deleted, not corrected.** `overview.md`'s "Core publishable (gzipped)
25.64KB" / "Total ecosystem 36.32KB" — no tool produces either; a v9-era
methodology that no longer exists. Replaced with figures `validate:budget`
emits, removal annotated in place.

**A performance table that was unfalsifiable.** "Performance targets (Sept
2025)", four latency figures, no generator — and "operation" was never defined,
so the two plausible readings differ by three orders of magnitude. Both
measured; every figure was **10×–1000× larger than reality**. New
`tools/bench-depth-latency.mjs`.

**Equality figures, ~50 claims across three surfaces.** New
`tools/bench-leaf-equality.mjs`:

|                          | claimed               | measured              |
| ------------------------ | --------------------- | --------------------- |
| object leaf, changing    | 53.8 → 8.9ns (6.0x)   | 104.0 → 31.0ns (3.4x) |
| re-fetched, new identity | 110.3 → 9.0ns (12.2x) | 89.8 → 30.1ns (3.0x)  |
| `Object.is` floor        | 8.6ns                 | 14.1ns                |
| whole-state read         | 1807.8 → 149.2µs      | ~314µs                |
| unchanged read           | 0.044µs               | ~0.3µs                |

**One was inverted.** All three surfaces said `deepEqual` (6.5ns) beats
`Object.is` (8.1ns) on a primitive, therefore "nothing to specialise." Measured:
13.4 vs 8.0ns — `Object.is` is faster. The advice survives, the reason does not,
and the correction says so in place.

### The structural fix

`tools/check-numeric-claims.mjs` — every measurement-shaped figure on a live
surface must sit in a section naming its generator. **Ratcheted** per file
against `tools/numeric-claims-baseline.json`, following `check-lint-budget.mjs`
and its reasoning that a permanently red gate teaches people to ignore gates.
201 at inception, **144 now**. New ungenerated numbers cannot land; a drop fails
until the baseline is tightened.

**Attack:** the `CLAIM` regex is narrow (KB/MB/ms/µs/ns/`12x`) and skips fenced
code and blockquotes. It will miss "twice as fast", "sub-millisecond", "an order
of magnitude", and percentages. The `EXEMPT` list has two broad entries — the
cross-library one may be too generous. Check whether the exemptions hide real
claims.

---

## 9. Where I am least confident

Ranked. Start at the top.

1. **§7.** If build-then-measure is still wrong, everything numeric here is
   suspect again. Two independent bugs already hid in this path.
2. **§4's reference-oracle premise**, untested against markers, and tested via a
   mock tree that satisfies the contract by construction.
3. **§2's constructor gate** — a breaking change whose safety argument depends
   on an asymmetry I asserted across all callers but verified mainly for leaf
   writes.
4. **§8's remaining 144 unbacked figures.** Held flat, not verified. Biggest:
   `docs/compare/real-implementations.md` (32),
   `docs/performance/TREE_SHAKING_OPTIMIZATION.md` (21),
   `docs/compare/ngrx-signalstore.md` (16).
5. **Thresholds still guessed, named honestly:** `isLargeEnoughToMatter = 32`
   (ST2027), `PREDICATE_CHURN_THRESHOLD = 12`, `RETENTION_CHECK_INTERVAL = 16`,
   `CYCLE_GUARD_DEPTH = 64`. Each gates a _warning_, where both error directions
   cost one message — unlike ST2029's row count, which misjudged real shapes.
   That distinction is a claim, not a fact; test it.

---

## 10. Process notes, so you can weigh the work

- **I repeated a mistake twice.** `git stash push -- <path>` no-ops when the
  file is unmodified, so the following `pop` applied a foreign stash — 4
  conflicts, staged edits across untouched files. Recovered surgically; the
  other agent's `stash@{0}` is intact. Switched to patch files after.
- **I committed four unrelated changes under a message describing one**, then
  split it.
- **I published a false "FORMAT CLEAN"** from an `&&` chain reading `tail`'s exit
  code, and committed an unformatted file. Caught and amended.
- Every new guard is **mutation-verified** — reverting the mechanism must fail
  exactly the tests that mechanism serves. Re-run
  `node tools/verify-gates.mjs --self-test` and spot-check a few by hand;
  a guard test that passes without the guard is worthless, and that is the
  standard the rest of this repo already holds itself to.

## 11. Not done, deliberately

- **14.0.0 is not cut.** Still `14.0.0-rc.1`; tag `v14.0.0-rc.1` exists.
- 144 unbacked numeric claims (§8).
- `stash@{0}` belongs to another agent; untouched.
- Another agent was editing the demo and docs concurrently. The surfaces edited
  here — `llms.txt`, `llms-full.txt`, `packages/core/README.md`,
  `docs/overview.md`, `docs/compare/capability-matrix.md` — are likely conflict
  points.
