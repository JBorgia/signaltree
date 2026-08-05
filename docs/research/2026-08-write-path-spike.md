# Spike — write-path architecture: untrusted-key ingress & change notification

- **Status:** OPEN — research in progress
- **Started:** 2026-08-05
- **Owner:** this doc tracks the main agent + research subagents

## Spike rules

**Everything already written in this repo is an unverified CLAIM, including:**

- `docs/rfcs/0004-v12-optimal-iteration.md`'s rejection of `walkTree` unification
  and its "seven config knobs" / "the bug lived in the guard, not the loop"
  reasoning.
- `docs/rfcs/0007` (packaging rule), `docs/rfcs/0010` (enterprise retirement).
- Every code comment, JSDoc, CHANGELOG entry and commit message written during
  this session — several have already been proven wrong by audit.
- The `walker-conformance.spec.ts` header's account of the v11.4/11.5 root cause.
- Any memory or summary carried into this session.

Nothing above may be cited as evidence. Re-derive from **source code** (this
repo) or **primary external sources** (library source, official docs, CVE
records, spec text). If a claim cannot be re-derived, record it as
*unsubstantiated* rather than repeating it.

## The two questions

**Q1 — Security.** Five prototype-pollution-class defects were found and four
fixed, one at a time, across four audit rounds. Do they share a single root
cause? What is the long-term architectural answer, as opposed to the
whack-a-mole that has been happening?

**Q2 — Change notification.** `onPathChange` was added to core this session and
has zero consumers. Core separately contains `PathNotifier`. Is "improve
PathNotifier" actually the right answer, or is it just the nearest one? What
would a greenfield design look like? Is there a third option that supersedes
both?

These may share an answer. That is a hypothesis, not a finding.

## Confirmed observations (re-derived from code this session)

Each of these was reproduced by running code, not read from a doc.

| # | Observation | How established |
| - | ----------- | --------------- |
| O1 | `updateOptimized(JSON.parse('{"__proto__":0}'))` then `(…{"__proto__":{"isAdmin":true}})` set `({}).isAdmin` | probe, enterprise |
| O2 | Lazy proxy `get` used `key in target`, returning a writable proxy over `Object.prototype` | probe, core |
| O3 | `applyState(tree.$, JSON.parse('{"__proto__":{…}}'))` polluted `Object.prototype`; reachable from a devtools `postMessage` | probe, core |
| O4 | `signalTree(JSON.parse('{"__proto__":{…}}'))` replaced the root `$`'s prototype; hidden node accepted later writes | probe, core |
| O5 | `mergeDeep(t, JSON.parse('{"__proto__":{…}}'))` sets `t`'s prototype (no global pollution) — **still unfixed** | probe, shared |
| O6 | `deepEqual(new Error('a'), new Error('b')) === true`; same for `new Number(1)/(2)` — **unfixed** | probe, shared |
| O7 | `deepEqual(Object.create(Date.prototype), new Date(0))` **throws** — **unfixed** | probe, shared |
| O8 | Every `PathNotifier.notify()` call site is in `entity-signal.ts`; ordinary leaf/branch writes never notify | grep, core |
| O9 | `onPathChange` has zero non-doc, non-test consumers anywhere in the repo | grep |

## Hypotheses — UNVERIFIED, to be proven or killed

- **H1.** O1–O5 share one root cause: *no boundary between keys that come from
  trusted tree structure and keys that come from untrusted external input.*
  Prediction if true: the safe `[key] =` sites all iterate tree-derived keys,
  and every unsafe one iterates payload-derived keys. Testable by enumeration.
- **H2.** The fix family is "remove the sink" (null-prototype storage / Map
  storage / `defineProperty`) rather than "add a guard at each site". Untested.
- **H3.** RFC 0004's rejection of walker unification does not cover this bug
  class, because its argument is about *value-shape* guards while this is about
  *key provenance*. Must be checked against the actual walkers, not the RFC.
- **H4.** Q1 and Q2 have the same answer: a single write chokepoint that emits
  a patch/journal, which every consumer (change reporting, path notification,
  time-travel, persistence, devtools, guardrails) subscribes to. Strongly
  suspected to be motivated reasoning on my part — treat with suspicion.
- **H5.** There is a third option for Q2 not yet considered.

## Hypothesis status

Updated as tracks land. A hypothesis is only moved on evidence recorded below.

| # | Status after Track B | Evidence |
| - | -------------------- | -------- |
| H1 | **PARTIALLY TRUE, and the predicted partition does not exist.** Track C enumerated 61 key-iteration sites: 12 TREE, 11 CONFIG, 38 PAYLOAD. The prediction fails in both directions — safe sites that iterate PAYLOAD keys (#1, #3, #40) and an unsafe site that iterates CONFIG keys (`merge-derived.ts:86`). Worse, provenance is not a property of a call site: `unwrap` is TREE at depth 0 and PAYLOAD as soon as it recurses into a leaf's value, which is exactly why the new sink at `utils.ts:325` was missed. Track A's point lands too — 2 of the 38 are unguarded *reads* that recurse into `Object.prototype`. | § C1, § C3 |
| H2 | **RESHAPED, and the framing was too narrow.** Guards do not converge: of six blocklist deployments traced, **four needed a second advisory**, and lodash is still patching instances — five pollution CVEs 2018→2026, the newest (CVE-2026-2950, published 2026-04-01) existing only because the 2025 fix validated a path segment *before* normalising it. But my three proposed sinks-removals all have problems: `Object.freeze(Object.prototype)` does **not** stop `obj.__proto__ = x` (freezing an accessor only clears `[[Configurable]]`; the setter survives); a null-prototype base silently *destroys* immer's protection, which turns out to be emergent rather than designed; and CodeQL recommends `defineProperty` for **neither** code shape — which is what I used in the enterprise fix. | § A |
| H2b | **NEW OPTION, not previously considered — invert the loop.** Redux/NgRx immunity is **not** immutability. `combineReducers` iterates the *developer's reducer map*, so payload keys never reach a property access at all. `@ngrx/signals`' `patchState` is the same idea made explicit, and Track A calls it the cleanest class-closing design in the corpus. Directly applicable here: a SignalTree's shape is declared upfront, and `recursiveUpdate` already DISCARDS keys outside the initial shape (ST2010). Iterating the tree's keys and looking *up* into the payload — rather than iterating payload keys and indexing into the tree — may be behaviour-preserving AND close the class. Untested; Track C's partition decides. | § A |
| H3 | **SUPPORTED by the walkers, but for a reason RFC 0004 does not address.** `visitTree` has exactly two callers (batching, interceptLeafSignals) and carries no key guard at all; ~27 other hand-rolled walkers exist, and the eight key guards that do exist are spread across eight *different* ones, using **four incompatible definitions of "unsafe key"** — one of which is opt-in and one of which (`diff-engine.keyValidator`) is never supplied by any caller. Walk unification and key provenance are orthogonal: `visitTree` proves you can unify the walk and still have no guard. | § C9 |
| H2b | **SUPPORTED and directly actionable.** `recursiveUpdate` (`signal-tree.ts:289`) is exactly the loop Track A describes: it iterates `Object.entries(payload)` and indexes `targetObj[key]`. Inverting it is behaviour-preserving in principle — the ST2010 discard already means only tree keys can land — but Track C measured a cost the inversion does **not** pay for: 32 of the 38 PAYLOAD sites are outside `recursiveUpdate` entirely, including all four proven sinks (#9, #22, #35, #36). Inversion closes the update path and nothing else. | § C1, § C4 |
| H4 | **PARTIALLY KILLED.** The premise "patches are a byproduct of the write" is factually wrong about immer, the library I had in mind: it records only *which keys were touched* and runs a key-scoped diff at COMMIT (`patches.ts:238`). Write-then-revert in one recipe emits ZERO patches. And on unification: only CRDTs unify sync/persistence/observation, and they pay for it — Yjs needs a separate structural-replay stack for undo, Automerge has no undo API at all. Everyone else deliberately keeps them separate. | § B.2 M3, § B.5 |
| H5 | **CONFIRMED — two models I had not considered.** **M0**: notify with NO payload plus a version; consumer pulls. This is where the standards track landed — TC39 `Watcher.notify()` takes no arguments and forbids reading signals inside it. **M5**: versioned immutable snapshots with structural sharing, where "what changed" is a *pull query* answered by reference identity (measured: 0.003 µs to compare vs 0.047 µs merely to BUILD one dot-path string). | § B.2 M0, M5 |

### The bug class has a real name, and it is not "prototype pollution"

CWE-913 → **CWE-915** → CWE-1321. CWE-915's alternate terms are *mass
assignment*, *autobinding*, *object injection*, and its description states this
problem verbatim. Prototype pollution is one variant of it. Of the three-way
split I asked about, only "pollute a global prototype" has a canonical
definition (Silent Spring, USENIX '23 — "root prototype"); local
prototype-setting and prototype *confusion* have **no names in the literature**.
CodeQL splits by *code shape* rather than blast radius, and gives different
remediation per shape: `Map`/`Object.create(null)` for indexing, own-ness or
blocklist for merge.

### Live instances of this exact bug class in shipping libraries

`@ngrx/entity` 21.1.1 and Redux Toolkit 2.12.0 both carry `if (key in
state.entities)` — the identical shape to O2 — today. NgRx additionally replaces
the entities dict's prototype on `setOne({id:"__proto__"})`, and both silently
drop entities with ids `toString`/`constructor`. `deepmerge` 4.3.1, which the
ecosystem treats as hardened and which has no advisory, has an unguarded
target-copy loop at `index.js:57-59`.

Useful as calibration: this class is not a SignalTree failing, it is endemic.
It also shows the sub-classes are separable — immer converts RTK's prototype
*write* into a thrown error while doing nothing about the read-side confusion.

### The chokepoint question has an answer, and it is not the root

I had documented "direct leaf writes bypass the root, so they cannot be observed"
as an unavoidable boundary of `onPathChange`. Track B establishes that (a) nobody
achieves a root chokepoint — NgRx SignalStore was verified to let
`count.set(999)` mutate state while `watchState`'s log stayed unchanged — and (b)
the libraries with complete coverage instrument the **leaves**, not the root.

Angular ships a leaf-level hook: `setPostSignalSetFn`, a process-global callback
fired inside `signalValueChanged` after every writable-signal write, exported
from `@angular/core/primitives/signals`. Track B built a working proof against
the real primitives capturing a direct `t.a.b.c.set(11)` with its dot-path, at
zero cost with no listener.

**Risk to weigh, not to wave away:** one global slot (every consumer must chain,
and Angular DevTools may want it), no angular.dev API page, no stability
annotation, fires after the assignment so the old value is unrecoverable, and it
is leaf-only — branch add/remove stays invisible. Depending on it is a bet on an
unannotated Angular internal.

## Research tracks

| Track | Assigned | Status | Output |
| ----- | -------- | ------ | ------ |
| A — External prior art: untrusted-key ingress & prototype pollution defence in JS state/merge libraries | subagent | RUNNING | § Findings A |
| B — External prior art: change notification / patch streams | subagent | **DONE** | § Findings B |
| C — Internal ground truth: enumerate every external-data ingress and every write site from CODE ONLY | subagent | DONE | § Findings C |

## Findings A — external prior art, untrusted-key ingress

**Method.** Every behavioural claim below was produced by running code against a
real installed package, or by reading that package's shipped source. Probe
scripts live in
`/private/tmp/claude-501/-Users-jonathanborgia-code-signaltree/38f81e2a-96d1-451e-a5a0-7d0db71e820f/scratchpad/`.
Advisory data came from the GitHub Advisory REST API (`gh api /advisories/...`),
not from summaries. Versions under test: Node v24.3.0, lodash 4.18.1 (plus 15
historical versions installed side-by-side), immer 11.1.15, valtio 2.3.2,
yjs 13.6.32, @automerge/automerge 3.4.0, deepmerge 4.3.1, merge-deep 3.0.3,
defaults-deep 0.2.4, mutative 1.3.0, redux 5.0.1, @reduxjs/toolkit 2.12.0,
@ngrx/store 21.1.1, @ngrx/entity 21.1.1, @ngrx/signals 21.1.1,
@angular/core 22.0.7.

Where a finding is second-hand (produced by a delegated probe rather than run
here) it is marked **[delegated]**. Everything unmarked was run directly.

### A.0 — Naming and taxonomy

**There is a recognised parent class, and it is not "prototype pollution".**
From MITRE's own records:

- **CWE-913** *Improper Control of Dynamically-Managed Code Resources* (class)
  → **CWE-915** *Improperly Controlled Modification of Dynamically-Determined
  Object Attributes* (base) → **CWE-1321** *Improperly Controlled Modification
  of Object Prototype Attributes ('Prototype Pollution')* (variant).
- CWE-915's own extended description is a verbatim statement of this spike's
  problem: *"The product receives input from an upstream component that
  specifies multiple attributes, properties, or fields that are to be
  initialized or updated in an object, but it does not properly control which
  attributes can be modified."* Its listed **alternate terms are "Mass
  Assignment", "AutoBinding", and "Object Injection"**, and it is a *PeerOf*
  CWE-502 (deserialization of untrusted data).
- CWE-1321 *CanPrecede* **CWE-471** *Modification of Assumed-Immutable Data*.
  Note lodash's 2018 advisory is tagged CWE-471 + CWE-1321, and merge-deep's is
  tagged CWE-471 — the ecosystem used CWE-471 before CWE-1321 existed.

Sources: <https://cwe.mitre.org/data/definitions/1321.html>,
<https://cwe.mitre.org/data/definitions/915.html>.

So the accurate name for "untrusted keys index into and assign onto objects" is
**CWE-915 / mass assignment / object injection**. Prototype pollution is one
*variant* of it — the variant where the key happens to hit a prototype-reachable
name. That reframing matters: a defence aimed only at `__proto__` addresses the
variant, not the class, and the CWE tree says so explicitly.

**On the (a)/(b)/(c) distinction the question asks about.** The distinction is
made in *tooling*, only partially in the *literature*, and not at all in CWE.

- **(a) global prototype pollution** — the only thing the academic literature
  defines. Shcherbakov, Balliu & Staicu, *Silent Spring: Prototype Pollution
  Leads to Remote Code Execution in Node.js*, USENIX Security '23
  (<https://arxiv.org/abs/2207.11171>) defines it as *"the ability of an
  attacker to inject properties into an object's **root prototype** at
  runtime"*. Its second concept is the **gadget** — pre-existing legitimate
  code that later reads the injected property — and **universal gadget**, a
  gadget in a core Node.js API. The paper does **not** use "prototype
  confusion" and does not treat case (b).
- **(b) local prototype replacement** and **(c) read-walks-off-the-object** have
  **no canonical names I could find**. Targeted searching of USENIX / ACM DL /
  arXiv / NDSS for a taxonomy paper distinguishing them returned nothing.
- CodeQL does split the problem, but along a *different* axis — by code shape,
  not by blast radius. It ships exactly three queries:
  `js/prototype-polluting-assignment` (indexing an object with an untrusted
  key), `js/prototype-pollution-utility` (a merge/extend helper), and
  `js/prototype-pollution` ("prototype-polluting merge call", i.e. calling a
  known-vulnerable helper). All three are tagged CWE-915 + CWE-471.
  <https://codeql.github.com/codeql-query-help/javascript/>
- Notably the two CodeQL queries give **different remediation advice**, which is
  the closest thing to a recognised split of the problem:
  - `js/prototype-polluting-assignment` (our case) recommends, in order: *"an
    associative data structure that is resilient to untrusted key values, such
    as a `Map`"*; *"a prototype-less object created with
    `Object.create(null)`"*; or restricting the key by prefixing/format check.
  - `js/prototype-pollution-utility` (the merge case) recommends: *"Only merge
    or assign a property recursively when it is an own property of the
    destination object. Alternatively, block the property names `__proto__`
    and `constructor`."*
  - **Neither mentions `Object.defineProperty`.**

**Working conclusion on naming:** call the class CWE-915 (mass assignment /
object injection) and treat prototype pollution as its JS variant. If the
(a)/(b)/(c) split is needed internally, it will have to be locally defined —
there is no term of art to borrow for (b) and (c).

### A.1 — What each library actually does

Legend for the last column: **CLASS** = the shape of the code makes the whole
family unrepresentable; **INSTANCE** = a guard bolted onto specific call sites;
**NONE** = no defence found.

| Library / version | What the source actually does | Citation | Verdict |
| --- | --- | --- | --- |
| **lodash** 4.18.1 | Three *independently written* guards. (1) `safeGet(object,key)` returns `undefined` for `__proto__` and for `constructor` when it holds a function — a **read-side blocklist** used by `baseMerge`/`baseMergeDeep`. (2) `baseAssignValue` special-cases `__proto__` to `Object.defineProperty` instead of `=`. (3) `baseSet` early-returns on `key === '__proto__' \|\| 'constructor' \|\| 'prototype'`. (4) `baseUnset` has a *fourth*, separately-written path guard. | `node_modules/lodash/_safeGet.js:8-18`, `_baseAssignValue.js:13-23`, `_baseSet.js:29-31`, `_baseUnset.js:24-45` | **INSTANCE ×4** |
| **immer** 11.1.15 | Two layers. (1) `applyPatches_` blocklists `__proto__`/`constructor` on *intermediate* path segments and `prototype` on functions. (2) The draft Proxy's `setPrototypeOf` trap unconditionally `die(12)`s. (3) Structurally: `each()` iterates `Reflect.ownKeys`/`Object.keys` only, and `has()` is `Object.prototype.hasOwnProperty.call` — it never iterates inherited keys. | `dist/immer.mjs:1105` (patch blocklist), `:591-592` (`setPrototypeOf(){die(12)}`), `:103` (`has`), `:96-102` (`each`) | **INSTANCE + partial CLASS** |
| **valtio** 2.3.2 | **No prototype guard anywhere.** `grep` for `__proto__` in `vanilla.js` returns zero hits. The `set` trap is `Reflect.set(target, prop, nextValue, receiver)`; there is no `get` trap at all, so reads forward straight to the target. The snapshot path is the exception: it uses `Object.defineProperty(snap, key, desc)`. | `vanilla.js:53-67` (handler), `:38` (`defineProperty` in `createSnapshotDefault`), no guard lines exist | **NONE** (write path) / **CLASS** (snapshot path, by accident) |
| **Yjs** 13.6.32 **[delegated]** | Backing store is a real `Map`: `this._map = new Map()`; remote keys decoded off the wire go to `parent._map.set(...)`. No blocklist anywhere (zero grep hits for `__proto__`). The sink **reappears at `toJSON()`**, which builds `const map = {}` then `map[key] = v`. | `src/types/AbstractType.js:270`, `src/structs/Item.js:511`, `src/types/YMap.js:124-137` | **CLASS in storage, sink RELOCATED to `toJSON()`** |
| **Automerge** 3.4.0 **[delegated]** | Storage is Rust/WASM columnar — safe by construction. But *every* value the app sees (`load`, `change`, `view`, `toJS`) comes from WASM `materialize`, whose glue does `new Object()` + `arg0[arg1]=arg2`. So the sink is hit on ordinary reads, not just an opt-in serialize. The only `__proto__` hits in the bundle are `__proto__: null` in wasm-bindgen's *own* import table — unrelated to document data. | `dist/cjs/fullfat_node.cjs:2244`, `:2283-2286`, `:6810-6834` | **CLASS in storage, sink RELOCATED and hit more often than Yjs** |
| **Redux** 5.0.1 | Genuinely immune, for a structural reason: `combineReducers` iterates `Object.keys(reducers)` — the **developer's static reducer map** — and writes `nextState[key]` with that trusted key. The action payload's keys are never used to index anything. Redux core contains no merge and no path-based setter. | `dist/redux.mjs` `combineReducers` (`reducerKeys = Object.keys(reducers)`, `finalReducerKeys`) | **CLASS (by not having the feature)** |
| **NgRx `@ngrx/store`** 21.1.1 | Identical structure to Redux — `finalReducerKeys = Object.keys(reducers)`, `nextState[key] = ...`. Closed key set. | `fesm2022/ngrx-store.mjs:319-343` | **CLASS (by not having the feature)** |
| **NgRx `@ngrx/signals`** 21.1.1 | `patchState` derives an **allowlist** from the declared state: `stateKeys = Reflect.ownKeys(stateSource[STATE_SOURCE])`, then for each incoming key `if (stateKeys.includes(key))` write via `signals[key].set(...)`; otherwise `console.warn` and drop. Writes go through an existing signal's `.set()`, never `obj[k]=v` on a state object. | `fesm2022/ngrx-signals.mjs:205-225` | **CLASS (closed key set + no object sink)** |
| **NgRx `@ngrx/entity`** 21.1.1 | **Live defect.** `entities: {}` (plain object, not null-proto); `addOneMutably` guards with `if (key in state.entities)` — `in` walks the prototype chain; `setOneMutably` does `state.entities[key] = entity` with `key = selectId(entity)`, i.e. a **payload-derived key**. No immer. | `fesm2022/ngrx-entity.mjs:4-8`, `:78-84`, `:97-107`, `:401` | **NONE** |
| **Redux Toolkit** 2.12.0 | *Byte-for-byte the same adapter logic* as NgRx (`if (key in state.entities)`, `state.entities[key] = entity`, `entities: {}`), but the operators run inside an immer draft, so the prototype write hits immer's `setPrototypeOf` trap and throws instead of corrupting. The `key in` confusion is **not** fixed. | `dist/redux-toolkit.modern.mjs:1321`, `:1437-1458` | **INSTANCE (inherited from immer); read-side confusion NONE** |
| **deepmerge** 4.3.1 | `propertyIsUnsafe(target,key)` = *"key is reachable on the chain but is not an own **enumerable** property of the destination"* → skip. This is the own-ness strategy, not a blocklist; the string `__proto__` never appears. **But it guards only the `source` loop.** The `target`-copy loop two lines earlier is unguarded. | guard `index.js:47-52`, applied at `:62`; **unguarded loop at `:57-59`** | **INSTANCE (one of two loops)** |
| **merge-deep** 3.0.3 **[delegated + verified here]** | `isValidKey(key)` blocklists exactly `__proto__`, `constructor`, `prototype`, combined with `hasOwn(obj,key)`. Reached that state via **two** advisories: CVE-2018-3722 (blocked `__proto__` only, v3.0.1) then GHSL-2020-160 (added the other two, v3.0.3). | `index.js:34-36`, `:61-63` | **INSTANCE, patched twice** |
| **defaults-deep** 0.2.4 **[delegated + verified here]** | The entire guard is `if (key === '__proto__') return;`. CVE-2018-3723 fixed that; **CVE-2018-16486 (the `constructor.prototype` route) was never fixed** — package abandoned. Delegated probe confirmed it still pollutes `Object.prototype` today. | `index.js:19-21` | **INSTANCE; second advisory unfixed since 2018** |
| **mutative** 1.3.0 **[delegated]** | Same two-layer shape as immer: blocklist in `apply()` (JSON-Patch) + unconditional `setPrototypeOf` rejection on drafts. No advisories; proactive. | `dist/mutative.cjs.development.js:1611-1615` | **INSTANCE + partial CLASS** |

#### A.1.1 — lodash: the full patch archaeology

I installed 15 lodash versions and probed each. The transition points I measured
line up exactly with the advisories, and show **five separate rounds over eight
years, each fixing one function family**:

| Advisory | CVE | Function family | First patched (advisory) | First patched (measured) | Fix shape in source |
| --- | --- | --- | --- | --- | --- |
| GHSA-fvqr-27wr-82fm | CVE-2018-3721 | `merge`/`mergeWith`/`defaultsDeep`, `__proto__` | 4.17.5 | **4.17.5** | introduced `safeGet`, blocking `__proto__` only |
| GHSA-4xc9-xhrj-v574 | CVE-2018-16487 | same, `constructor.prototype` | 4.17.11 | **4.17.11** | — |
| GHSA-jf85-cpcp-j695 | CVE-2019-10744 | `defaultsDeep`, `constructor.prototype` | 4.17.12 | **4.17.12** | `safeGet` gained the `constructor` clause |
| GHSA-p6mc-m468-83gw | CVE-2020-8203 | `set`/`setWith`/`update`/`zipObjectDeep`/`pick` | 4.17.19 | **4.17.17** | a *new, separate* 3-name blocklist inside `baseSet` |
| GHSA-xxjr-mmjv-4gpg | CVE-2025-13465 | `unset`/`omit` | 4.17.23 | **4.17.23** | a *fourth* blocklist, inside `baseUnset` |
| GHSA-f23m-r3pf-42rh | CVE-2026-2950 | `unset`/`omit`, array-path bypass | 4.18.0 | **4.18.0** | `toKey()` moved *before* the check |

Three things fall out of this that are worth more than the list itself.

**(i) The 2018 CVE was a READ-side bug, not a write-side one.** The obvious
story is "lodash was doing `obj[k] = v`, they hardened the write". The source
says otherwise. `baseAssignValue`'s `Object.defineProperty` branch for
`__proto__` **already existed in 4.17.4**, i.e. before the CVE
(`v4.17.4/node_modules/lodash/lodash.js:2572`). The actual bug was in
`baseMergeDeep`, which read `var objValue = object[key]` — for `key ===
'__proto__'` that walks off the object and yields `Object.prototype`, which was
then passed as the *recursion target*. Verified:

```
lodash 4.17.4: _.merge({}, JSON.parse('{"__proto__":{"X":1}}'))
  Object.prototype.X = 1
  target own props   = []                        // nothing was written to the target
  getPrototypeOf(target) === Object.prototype     // target's own prototype untouched
```

The write went into `Object.prototype` *through the recursion*, not through an
assignment on the target. The fix — `safeGet` — is therefore a **read-side**
blocklist. This is exactly the (c) "read walks off the intended object" shape,
and it is the highest-profile prototype-pollution CVE in the ecosystem.

**(ii) `_.merge` still copies INHERITED source keys.** `baseMerge` iterates with
`keysIn`, not `keys`. Measured on 4.18.1:

```
const src = Object.create({inherited:'yes'}); src.own = 1;
_.merge({}, src)  =>  {"own":1,"inherited":"yes"}
```

So a source object that is *itself* sitting on a polluted prototype propagates
that pollution into the destination as own properties. The guard family does not
address this.

**(iii) The guards are lossy, asymmetrically.** On 4.18.1:

```
_.merge({}, JSON.parse('{"__proto__":"hi"}'))     => {"__proto__":"hi"}  (own prop, via defineProperty)
_.merge({}, JSON.parse('{"__proto__":{"a":1}}'))  => {}                  (key SILENTLY DROPPED)
```

Primitive-valued `__proto__` survives (the `baseMerge` non-object branch reads
`srcValue` directly from the iterator); object-valued `__proto__` is destroyed
(the `baseMergeDeep` branch reads it through `safeGet`, gets `undefined`, and
`assignMergeValue` no-ops because `'__proto__' in object` is true). Two code
paths, two different answers for the same key.

**(iv) The 2026 CVE is a validate-before-normalize bug, and I reproduced it.**
The 4.17.23 fix contained:

```js
var key = path[index];
if (typeof key !== 'string') { continue; }   // <-- the bypass
if (key === '__proto__' && !hasOwnProperty.call(object,'__proto__')) return false;
```

An array-wrapped segment is `typeof 'object'` → skipped by the guard → later
coerced back to `'__proto__'` by `toKey()`. 4.18.0 fixes it by hoisting the
normalisation: `var key = toKey(path[index]);`. Measured, deleting a real method
off `Number.prototype`:

```
                                       4.17.21   4.17.23   4.18.0
_.unset(5, ['__proto__','toFixed'])     DELETED   blocked   blocked
_.unset(5, [['__proto__'],'toFixed'])   DELETED   DELETED   blocked
_.unset(5, [{toString:…},'toFixed'])    DELETED   DELETED   blocked
```

The third row is mine, not the advisory's: any object with a hostile `toString`
is a third coercion channel into the same sink. **Answer to "are they still
patching instances?" — yes, most recently 2026-04-01, and the 2026 CVE exists
solely because the 2025 fix validated a value before normalising it.**

#### A.1.2 — immer's protection is largely emergent, not designed

`produce(base, d => { d['__proto__'] = payload })` throws
`[Immer] Object.setPrototypeOf() cannot be used on an Immer draft`. That looks
like a deliberate `__proto__` guard. It is not. The `set` trap's *first*
statement is a general accessor-forwarding feature:

```js
set(state, prop, value) {
  const desc = getDescriptorFromProto(latest(state), prop);
  if (desc?.set) { desc.set.call(state.draft_, value); return true; }
  …
```

For `prop === '__proto__'`, `getDescriptorFromProto` walks the chain, finds
`Object.prototype`'s `__proto__` **accessor**, and invokes its setter with the
draft Proxy as receiver — which lands on the `setPrototypeOf` trap and dies. The
`set` trap contains no mention of `__proto__` at all
(`dist/immer.mjs:530-556`, `:633-644`).

Proof that it is emergent: remove the accessor from the chain and the guard
vanishes.

```
base = Object.create(null); base.a = 1;
produce(base, d => { d['__proto__'] = {p:1} })
  => own names ["a","__proto__"], prototype still null, no error
```

Also unguarded: `d['constructor'] = {...}` succeeds silently (harmless — it just
creates an own `constructor` key). And immer's `applyPatches_` blocklist only
scans `i < path.length - 1`; the final segment is covered only by the same
accidental accessor route.

Two things immer *does* get structurally right, and they matter more than the
guard: `each()` iterates `Reflect.ownKeys`/`Object.keys` (never inherited), and
`has()` is `Object.prototype.hasOwnProperty.call(...)` rather than `in`.
Round-tripping is also lossless where lodash's is not — an own `__proto__` data
property from `JSON.parse` survives `produce` intact.

#### A.1.3 — valtio: measured, no defence

All run against valtio 2.3.2:

```
proxy(JSON.parse('{"__proto__":{"v1":1},"a":1}'))
  own ["__proto__","a"], prototype unchanged        // safe ONLY because the JSON target
                                                    // already had an own __proto__ data prop
store = proxy({a:1}); store['__proto__'] = payload
  Object.getPrototypeOf(store) !== Object.prototype  // TRUE — store's prototype replaced
  subscribe() fired with ops = [[]]                  // empty op list: notification is bogus too
proxy({a:1}).__proto__.v3 = 1        => ({}).v3 === 1   // GLOBAL pollution
proxy({a:{b:{}}}).a.b.__proto__.v4=1 => ({}).v4 === 1   // GLOBAL pollution, nested
```

The outcome flips purely on whether the proxy target happens to already carry an
own `__proto__` key. There is no advisory for valtio (GitHub Advisory API
returns empty for the package).

#### A.1.4 — the NgRx / RTK natural experiment

`@ngrx/entity` and `@reduxjs/toolkit`'s entity adapter ship *the same algorithm*.
The only difference is that RTK runs it inside an immer draft. Measured:

| operation, id from `JSON.parse` | @ngrx/entity 21.1.1 | RTK 2.12.0 |
| --- | --- | --- |
| `setOne({id:"__proto__"})` | **`entities`' prototype replaced by the entity**; `ids: []` | **throws** `[Immer] Object.setPrototypeOf…` |
| `addOne({id:"__proto__"})` | silently dropped (`ids: []`) | silently dropped |
| `addOne({id:"toString"})` | silently dropped | silently dropped |
| `setOne({id:"toString"})` | stored in `entities`, **absent from `ids`** → invisible to `selectAll` | same |
| `setAll([{id:"toString"},{id:"constructor"},{id:"ok"}])` | — | `ids: ["ok"]`, two entities vanish |

Both defects come from one line — `if (key in state.entities)`, where `in` walks
the prototype chain, so any id equal to an `Object.prototype` member name reads
as "already present". This is the *identical shape* to observation **O2** in this
doc. It is live in two of the most widely deployed state libraries in the
ecosystem, and immer catches only the prototype-write half of it. **Key finding:
a structural write chokepoint converted a silent corruption into a loud error but
did nothing about the read-side confusion — they are separable sub-classes.**

#### A.1.5 — deepmerge: the "correct" one is half-guarded

deepmerge is the package the ecosystem holds up as having solved this properly,
and it has no CVE. Its guard is real and it is the own-ness strategy, not a
blocklist. But `mergeObject` has *two* loops and only the second is guarded:

```js
function mergeObject(target, source, options) {
  var destination = {}
  if (options.isMergeableObject(target)) {
    getKeys(target).forEach(function(key) {
      destination[key] = cloneUnlessOtherwiseSpecified(target[key], options)   // :58 — NO GUARD
    })
  }
  getKeys(source).forEach(function(key) {
    if (propertyIsUnsafe(target, key)) { return }                              // :62 — guarded
    …
```

Measured on 4.3.1:

```
deepmerge(JSON.parse('{"__proto__":{"evil":1},"a":1}'), {b:2})
  Object.getPrototypeOf(result) !== Object.prototype   // TRUE
  Object.getPrototypeOf(result)                        // {evil:1}  — attacker's object
  result.evil === 1
  ({}).evil === undefined                              // no GLOBAL pollution
deepmerge(JSON.parse('{"n":{"__proto__":{"evil3":1}}}'), {n:{z:1}})
  result.n's prototype replaced too                    // nested, same result
```

This is class (b) — local prototype replacement — in the reference-quality
package, reachable whenever the *first* argument came from `JSON.parse`. Not
global pollution, so arguably out of scope for a CVE, which is likely why it has
gone unreported. I found no advisory covering it.

### A.2 — The distinct architectural strategies

Eight strategies appear in the corpus. For each: mechanism, cost, breakage, and
who actually ships it.

---

**S1 — Name blocklist (`__proto__`, `constructor`, `prototype`).**

*Mechanism:* reject a small set of literal key strings before indexing.
*Ships in:* lodash (×4 independent copies), immer `applyPatches`, mutative
`apply`, merge-deep, defaults-deep.
*Cost:* ~free at runtime, trivial to add.
*What it breaks:* legitimate data whose keys are those names. lodash's `baseSet`
silently returns without writing; merge-deep silently drops the key.
*Track record — the single most important number in this section:* of the six
blocklist deployments I traced, **four needed a second advisory**. merge-deep
(2018 → 2021), defaults-deep (2018 → still unfixed), lodash `merge` (2018 →
2018), lodash `unset` (2025 → 2026). The failure mode is always the same: the
first version enumerates the names the reporter used.
*Verdict:* patches instances. Empirically the least durable option in this
corpus.

---

**S2 — Own-ness check on the destination (`hasOwnProperty` / `propertyIsEnumerable`).**

*Mechanism:* only write a key that is already an own (and, in deepmerge's case,
enumerable) property of the destination. Never names a string.
*Ships in:* deepmerge (`index.js:47-52`); recommended by CodeQL's
`js/prototype-pollution-utility`; immer's `has()` uses the same primitive.
*Cost:* one extra descriptor lookup per key.
*What it breaks:* it is *by definition* a closed-world policy — new keys can't be
added unless the destination already has them. deepmerge tolerates this because
its unguarded first loop seeds `destination` from `target`; that is also where
its hole is.
*Verdict:* closes the class **for the loop it is applied to**. It is not
inherited by other loops in the same function — see A.1.5.

---

**S3 — `Object.defineProperty` instead of `obj[k] = v`.**

*Mechanism:* `defineProperty` performs `[[DefineOwnProperty]]`, which never
consults the prototype chain and never invokes an accessor. It is the only
write primitive in JS that structurally cannot trigger the `__proto__` setter.
*Ships in:* lodash `baseAssignValue` (for `__proto__` only), valtio's
`createSnapshotDefault` (for *all* keys — the one place valtio is safe by
construction).
*Cost:* measurably slower than `=` in hot loops; more verbose; you must decide
`writable`/`enumerable`/`configurable` explicitly.
*What it breaks:* it bypasses setters — so any legitimate accessor on the target
stops firing. That is fatal for anything proxy-based that relies on trap
interception (immer would lose its `set` trap semantics entirely).
*Notable:* **CodeQL does not recommend this in either query.** It is nonetheless
the strategy with the cleanest theoretical story, and the one that generalises
past `__proto__` to *any* inherited accessor.
*Verdict:* closes the class at the site where it is used.

---

**S4 — Closed key set / allowlist from declared structure.**

*Mechanism:* derive the set of writable keys from something the developer
declared, and drop anything not in it. The untrusted key is never used to index;
it is used to *look up* in a trusted set.
*Ships in:* Redux `combineReducers` and NgRx `combineReducers` (key set =
`Object.keys(reducers)`); **`@ngrx/signals`' `patchState`**, which is the
purest example: `stateKeys = Reflect.ownKeys(STATE_SOURCE)`, then
`if (stateKeys.includes(key)) signals[key].set(v)` else warn and drop.
*Cost:* the shape of state must be declared up front. Dynamic/open-ended maps
(entity dictionaries, user-defined fields) cannot use it — which is exactly why
`@ngrx/entity` doesn't and is broken.
*What it breaks:* nothing, within its applicability. `@ngrx/signals` emits a dev
warning on drop, so it fails loudly.
*Verdict:* **closes the class**, and is the reason Redux/NgRx have zero
prototype-pollution advisories despite handling untrusted payloads constantly.
The protective property is *not* immutability and *not* reducer purity — it is
that the payload's keys never reach a property access. Worth stating plainly
because "Redux is safe because it's immutable" is the folk explanation and it is
wrong.

---

**S5 — Null-prototype storage (`Object.create(null)`).**

*Mechanism:* an object with no prototype has no `__proto__` accessor and no
inherited names, so `o[k] = v` always creates an own data property and `k in o`
is equivalent to own-ness for every `k`. It kills (a), (b) and (c) at once for
that object.
*Ships in production:* Node's `querystring.parse` returns null-prototype
(verified: `Object.getPrototypeOf(qs.parse('a=1')) === null`, and
`qs.parse('__proto__=1')` yields an own `__proto__` key with prototype intact).
**`Object.groupBy` returns a null-prototype object per spec** — verified — which
is TC39's own current answer to "give me a plain keyed container".
*Cost / what breaks* (all measured on Node 24.3.0):

```
JSON.stringify(o)              WORKS      => {"a":1,"b":{"c":2}}
Object.keys / entries / for-in WORKS
Object.hasOwn(o,'a')           WORKS
o?.x?.y                        WORKS
util.inspect(o)                WORKS but renders "[Object: null prototype] { … }"
Object.prototype.toString.call WORKS      => [object Object]

o instanceof Object            FALSE                    <-- silent wrong answer
o.hasOwnProperty('a')          TypeError: not a function
o.toString()                   TypeError: not a function
String(o) / `${o}` / o + ''    TypeError: Cannot convert object to primitive value
```

*The decisive cost is that it does not stick.* Every ordinary copy re-introduces
`Object.prototype`:

```
{...o}                     -> prototype is Object.prototype
Object.assign({}, o)       -> prototype is Object.prototype
structuredClone(o)         -> prototype is Object.prototype
JSON.parse(JSON.stringify(o)) -> prototype is Object.prototype
```

So null-prototype must be *re-applied at every construction site*. That is the
same discipline burden as a blocklist, relocated — a point worth weighing
against the "it closes the class" framing.
*Framework interop, concrete:* Angular's `renderStringify` is
`if (typeof value === 'string') return value; if (value == null) return '';
return String(value);` (`@angular/core@22.0.7`,
`fesm2022/_pending_tasks-chunk.mjs:483-487`). `String()` on a null-prototype
object throws, so `{{ someNullProtoObject }}` in a template is a runtime
TypeError.
*Verdict:* closes the class per-object; does not close it per-codebase.

---

**S6 — `Map` (or other non-object) storage.**

*Mechanism:* `Map` keys live in a separate slot with no prototype chain, so the
whole class is unrepresentable.
*Ships in:* **Yjs** (`this._map = new Map()`), Automerge (WASM columnar store),
`Map.groupBy` (spec).
*Cost / what breaks* (measured):

```
JSON.stringify(new Map([['a',1]]))  => "{}"            <-- total data loss
{...map}                            => {}              <-- total data loss
structuredClone(map)                => WORKS, stays a Map
Object.fromEntries(map)             => WORKS and is SAFE (CreateDataProperty)
```

Plus: no spread, no destructuring, no `?.` by key, no dot access, different
iteration protocol, and — for Angular specifically — templates need `keyvalue`
or explicit conversion.
*The critical finding:* **it relocates rather than eliminates.** Both Yjs and
Automerge reintroduce the sink the moment they materialise a plain object.
Yjs's `toJSON` does `const map = {}; map[key] = v`. Automerge's WASM glue does
`new Object()` then `arg0[arg1] = arg2` — and Automerge hits it on *every*
`load`/`change`, not just on an explicit serialize. **[delegated]** Neither
project has a `__proto__` blocklist; neither has an advisory; neither produced
global pollution in probes — only per-object prototype replacement at the
materialisation boundary.
*Verdict:* closes the class in storage; **the boundary is where you must then
defend**, and it is easy to forget because the storage looks obviously safe.

---

**S7 — Reject prototype mutation structurally (Proxy `setPrototypeOf` trap).**

*Mechanism:* a Proxy whose `setPrototypeOf` trap unconditionally throws makes (b)
impossible for anything behind the proxy, regardless of key name.
*Ships in:* immer (`die(12)`), mutative **[delegated]**.
*Cost:* only applies to proxied objects, and only while they are proxied.
*What it breaks:* nothing legitimate — code that deliberately reassigns a state
object's prototype is already pathological.
*Caveat established above:* in immer this trap is only *reached* via the
accessor-forwarding path, so it silently does not fire on null-prototype targets.
The trap itself is structural; the routing into it is not.
*Verdict:* closes sub-class (b) cleanly. Does nothing for (a) via a gadget, and
nothing for (c).

---

**S8 — Freeze the prototypes at startup (SES `lockdown()` / `Object.freeze(Object.prototype)`).**

*Ships in production, verified from source rather than a README* **[delegated]**:
MetaMask's browser extension calls `lockdown({consoleTaming:'unsafe',
errorTaming:'unsafe', domainTaming:'unsafe', overrideTaming:'severe'})` in
`app/scripts/lockdown-run.js`, wired in via `@lavamoat/webpack` with generated
policy files checked in. `ses`'s `hardenIntrinsics()`
(`packages/ses/src/lockdown.js:556-580`) walks the full permitted-intrinsics
graph from `permits.js` — every built-in prototype, not just `Object.prototype`.

*The load-bearing negative result:* **`Object.freeze(Object.prototype)` does NOT
prevent `obj.__proto__ = x`**, in strict or sloppy mode. Measured:

```
[strict]  obj.__proto__ = proto2  -> succeeded, prototype changed
[sloppy]  obj.__proto__ = proto2  -> succeeded, prototype changed
descriptor before freeze: {getter:true, setter:true, configurable:true}
descriptor after  freeze: {getter:true, setter:true, configurable:false}
```

Only `configurable` flips. Per ECMA-262 §7.3.15 `SetIntegrityLevel`, freezing an
*accessor* property sets `[[Configurable]]: false` and nothing else — `[[Get]]`
and `[[Set]]` are untouched. And the `__proto__` setter (§20.1.3.8.2, Annex B
legacy-normative-optional) operates on `thisValue.[[SetPrototypeOf]]` — the
**receiver**, not on `Object.prototype`. So freezing blocks (a) global pollution
but leaves (b) local prototype replacement wide open. **[delegated]**

*What breaks under freeze-only-`Object.prototype`:* narrow. Polyfills onto
`String.prototype`/`Array.prototype`, `class extends Array`/`Error`, mixins via
`Object.assign(Cls.prototype, …)`, `Object.create(null)` — all still work. Only
code that extends `Object.prototype` itself breaks. A verified real casualty:
`should.js` throws at import time (`lib/should.js:104-108` defines onto
`Object.prototype` by default).
*What breaks under full `lockdown()`:* substantial, from Endo's own wiki —
`tape`, `depd` (used by **express** and **morgan**), `better-assert`,
`node-lmdb`, `brace-expansion`/`temp` (import-time `Math.random`), `jsesc`,
`babel`, `json-merge-patch`. **[delegated]**
*Verdict:* closes (a) globally and process-wide; does not close (b) or (c). Only
viable for an application, never for a library — a library cannot freeze its
host's intrinsics.

---

**S9 (platform, not a library strategy) — what Node/TC39 now offer.** **[delegated]**

- **`--disable-proto`** (Node ≥ v12.17.0/v13.12.0, `doc/api/cli.md`): affects
  **only** the `Object.prototype.__proto__` accessor. Measured across all three
  modes: `Object.setPrototypeOf` and `Object.create` keep working in every mode,
  and `JSON.parse`'s `__proto__`-as-own-key behaviour is unchanged. In `throw`
  mode the replacement descriptor is created `configurable: true`
  (`src/api/environment.cc:805-869`), so **any code in the process can restore
  the accessor with one `defineProperty`** — verified. It is a startup default,
  not a boundary. **No browser equivalent found.**
- **`Object.hasOwn`** (Stage 4, finished 2022): purely a read-side ergonomic
  over `Object.prototype.hasOwnProperty.call`. **It does nothing for the write
  side.** Worth stating because it is often cited as though it were a fix.
- **`Object.groupBy` returns null-prototype; `Map.groupBy` returns a `Map`** —
  both verified. This is the clearest signal of what TC39 currently considers
  the safe default container.
- **`JSON.parse` is not the vulnerability.** Verified:
  `JSON.parse('{"__proto__":{"z":1}}')` creates an **own, enumerable data
  property named `"__proto__"`** and leaves the prototype alone. The danger is
  entirely in what walks the result afterwards.
- **`structuredClone` is safe on the way in, lossy on the way out**: per WHATWG
  `StructuredDeserialize` it uses `CreateDataProperty` (so an own `__proto__`
  round-trips as data), but it always assigns the realm's default prototype —
  custom prototypes and null prototypes are *not* preserved. Verified.
- **Records & Tuples is WITHDRAWN** — `tc39/proposal-record-tuple` is archived;
  consensus to withdraw reached at the 2025-04-14 plenary (issue #394), from
  Stage 2. The successor, `tc39/proposal-composites`, is **Stage 1** and much
  narrower (structural keys for `Map`/`Set` equality, not immutable value
  semantics). **This removes what would have been the cleanest long-term answer
  from the table.**
- **Symbols as WeakMap keys** (Stage 4, finished 2023): orthogonal, no bearing
  on this class.
- No active TC39 proposal for null-prototype object literal syntax was found.

### A.3 — Things that surprised me / contradict the obvious answer

1. **The canonical prototype-pollution CVE was a read bug, not a write bug.**
   lodash's `defineProperty` write hardening predated CVE-2018-3721; the actual
   defect was `object[key]` in `baseMergeDeep` returning `Object.prototype` and
   the merge recursing *into* it. "Harden the assignment" would not have fixed
   it. (§A.1.1(i))

2. **immer's `__proto__` protection is a side effect, not a design.** It comes
   from the `set` trap's generic accessor-forwarding, which happens to route
   `__proto__` into the `setPrototypeOf` trap. On a null-prototype base the
   protection silently disappears. (§A.1.2)

3. **deepmerge — the package with no CVE and the "proper" own-ness guard — has
   an unguarded loop and will hand you an object with an attacker-chosen
   prototype.** Reachable whenever the first argument came from `JSON.parse`.
   I found no advisory for it. (§A.1.5)

4. **`Object.freeze(Object.prototype)` does not stop `obj.__proto__ = x`.**
   Freezing an accessor property only clears `[[Configurable]]`; the setter
   survives and operates on the receiver. The most commonly recommended one-line
   mitigation addresses only half the problem.

5. **CRDTs do not solve this; they move it.** Map-backed storage is genuinely
   immune, and both Yjs and Automerge then rebuild plain objects key-by-key at
   the materialisation boundary. Automerge hits that boundary on ordinary reads.
   Neither has a blocklist. **[delegated]**

6. **`@ngrx/entity` and RTK's entity adapter both carry the `key in obj` bug
   right now** — the identical shape to this doc's O2. immer converts RTK's
   prototype-write into a thrown error but leaves the read-side confusion
   intact. Two of the most-deployed state libraries in the ecosystem silently
   drop entities whose id is `toString` or `constructor`. (§A.1.4)

7. **`Object.assign` is a pollution sink; spread is not.** Measured:
   `Object.assign({}, JSON.parse('{"__proto__":{"z":1}}'))` **replaces the
   target's prototype** and creates no own key, because `Object.assign` uses
   `[[Set]]`. `{...src}` uses `CreateDataProperty` and is safe. These are used
   interchangeably in most codebases.

8. **The blocklist track record is quantifiably bad.** Four of six blocklist
   deployments needed a second advisory; one (`defaults-deep`) has been
   knowingly unfixed since 2018. lodash's most recent bypass (CVE-2026-2950,
   published 2026-04-01) exists purely because the prior fix validated before
   normalising.

9. **Redux's immunity has nothing to do with immutability.** It comes from
   `combineReducers` iterating the *developer's* reducer map. `@ngrx/signals`'
   `patchState` is the same idea made explicit and is, in this corpus, the
   cleanest class-closing design for a state library specifically.

10. **CodeQL gives different advice for the two shapes** — `Map` /
    `Object.create(null)` / key-format-restriction for the indexing case, and
    own-ness-check / blocklist for the merge case — and recommends
    `Object.defineProperty` in neither.

11. **Null-prototype does not stick.** Spread, `Object.assign`,
    `structuredClone`, and JSON round-trip all silently restore
    `Object.prototype`. The invariant has to be re-established at every
    construction site.

### A.4 — Could not establish

- **No canonical name exists for sub-classes (b) and (c).** I searched USENIX,
  ACM DL, arXiv and NDSS and found no taxonomy paper distinguishing global
  pollution from local prototype replacement from read-side confusion. Silent
  Spring (USENIX '23) defines only the global case. CodeQL splits by code shape,
  not blast radius. If this doc needs the distinction, it must define it.
- **Whether deepmerge's target-loop behaviour (§A.1.5) is known to its
  maintainers.** I established the behaviour by running it and the absence of a
  GitHub advisory via the API; I did not search its issue tracker.
- **`GHSA-w36w-cm3g-pc62`**, cited in lodash 4.18.0's own `_baseUnset.js`
  comment as a third `unset` advisory, returns **404** from the global GitHub
  Advisory API. It may be repo-scoped, withdrawn, or unpublished. Its content is
  unknown.
- **The exact fix commits for merge-deep and deepmerge** were retrieved via
  WebFetch summarisation rather than raw `git show`; the resulting *source state*
  was verified directly here, but the byte-level diffs are second-hand.
  **[delegated]**
- **Automerge's Rust source** was not read — only the compiled `.wasm` plus
  generated JS glue is in `node_modules`, so whether the Rust side filters keys
  before calling back into `__wbg_set_*` is inferred from observed behaviour.
  **[delegated]**
- **Whether any browser offers a `--disable-proto` equivalent.** Not found in
  MDN or via the searches performed; Chromium/Gecko/JSC source and flag
  registries were not exhaustively checked. Treat as "not found", not "proven
  absent". **[delegated]**
- **Whether any dormant/stage-0 TC39 proposal addresses null-prototype literal
  syntax.** GitHub code search across `org:tc39` found only the dormant 2018
  `proposal-object-freeze-seal-syntax`; that search is not a complete index.
  **[delegated]**
- **Runtime cost.** I measured no performance numbers for any strategy —
  `defineProperty` vs `=`, `Map` vs object, `hasOwn` per key. If bundle/runtime
  cost is a decision input, that has to be measured separately.
- **Bundle-size cost** of any strategy: not measured.
- **Other versions.** Every result is for the exact version listed in the Method
  note. Only lodash was tested across a version range.

## Findings B — external prior art, change notification

**Method.** Every claim below was re-derived by reading installed library source or
running a script against the real package. Versions read: immer 11.1.15 (ships
`src/`), valtio 2.3.2, mobx 7.0.0, @vue/reactivity 3.5.41, @angular/core 22.0.7,
yjs 13.6.32, @automerge/automerge 3.4.0, @legendapp/state 2.1.15, zustand 5.0.14,
jotai 2.20.2, solid-js 1.9.14, @ngrx/{store,store-devtools,effects,signals}
(from this repo's `node_modules`). Scripts live in the session scratchpad
(`trackb/`). Specs quoted from `rfc-editor.org` originals; TC39 text from
`raw.githubusercontent.com/tc39/proposal-signals/main/README.md`.

### B.1 Survey table

| Library | Mechanism | Shape of what's emitted | When / batching | Source |
| ------- | --------- | ----------------------- | --------------- | ------ |
| **immer** | `produceWithPatches` / `produce(base, fn, patchListener)` | `{op:'add'\|'replace'\|'remove', path:(string\|number)[], value?}` + a parallel **inverse** array. Path is a mixed-type array, *not* a JSON Pointer. | Once, synchronously, at the end of `produce()`. `finalize.ts:57` calls `patchListener_` exactly once per produce. | `immer/src/plugins/patches.ts:132,171,238`; `src/core/finalize.ts:57`; `src/core/scope.ts:62` |
| **JSON Patch (RFC 6902)** | wire format, not a runtime | 6 ops: `add remove replace move copy test`; `path` is an RFC 6901 Pointer **string** | n/a. "application of the entire patch document SHALL NOT be deemed successful" if any op fails (atomic). | rfc-editor.org/rfc/rfc6902.txt |
| **JSON Merge Patch (RFC 7386)** | wire format | a partial object; `null` means *delete* | n/a | rfc-editor.org/rfc/rfc7386.txt |
| **fast-json-patch** `compare()` | whole-tree diff after the fact | RFC 6902 ops — but **only** `replace/add/remove`; never `move`/`copy`/`test` | on demand, O(total tree) | ran it; see B.3 |
| **valtio** | `subscribe(proxyObj, cb, notifyInSync?)` | **positional tuple**: `['set', path[], value, prevValue]` / `['delete', path[], prevValue]`. Path elements are strings (array indices too). Relative to the subscribed node. | **microtask** by default, all ops since last flush coalesced into one array; `notifyInSync=true` → one sync call per write. | `valtio/esm/vanilla.mjs:41-68,90-116,191-223` |
| **valtio** (ops disabled — the **default**) | same `subscribe` | `ops === []`; callback still fires | same | `vanilla.mjs:79` `let createOp;` — undefined until `unstable_enableOp()` (`:266`) |
| **valtio** `snapshot()` | versioned immutable snapshot, structurally shared | a frozen-ish POJO tree; unchanged subtrees are **reference-identical** across versions | pull, cached per global version | `vanilla.mjs:5-40,71,224` |
| **MobX** `observe(target, cb)` | per-observable listener | `{observableKind, type:'add'\|'update'\|'remove'\|'splice', name/index, object, newValue, oldValue, added, removed, addedCount, removedCount, debugObjectName}` | **synchronous**, inline in the write; **shallow only** — a parent's listener does *not* fire for nested mutations | `mobx/src/types/observableobject.ts`, `observablearray.ts`, `observablemap.ts`; dispatch `src/types/listen-utils.ts` |
| **MobX** `intercept` | pre-write hook | receives the change object, may mutate it or return `null` to cancel | before the write commits; FIFO; `null` breaks the chain | `mobx/src/types/intercept-utils.ts` `interceptChange` |
| **MobX** `spy` | global firehose | same events as `observe`, plus action/reaction/computation events | sync; **stripped in production** | `mobx/src/core/spy.ts` — `if (!__DEV__) { console.warn("[mobx.spy] Is a no-op in production builds"); return ... }` |
| **MobX** `reaction`/`autorun` | derivation | `reaction(expr, eff)` → `(newValue, oldValue, r)` for **the selector's result only**; `autorun` gets no payload at all | batched by transaction | `mobx/src/api/autorun.ts` |
| **MobX** `onBecomeObserved/Unobserved` | 0↔1-observer transition hook | no change payload; fires once per transition | on transition | `mobx/src/api/become-observed.ts`; `src/core/atom.ts` `onBO()/onBUO()` |
| **Yjs** `observeDeep` | per-type events bubbled to ancestors | `YMapEvent.keys: Map<string,{action:'add'\|'update'\|'delete', oldValue}>`; `YArrayEvent/YTextEvent.delta: [{retain},{insert},{delete}]`; **`event.path: (string\|number)[]`** relative to the observed root | **synchronous at the end of the outermost `Y.transact()`**, batched per transaction, before the `update` event | `yjs/dist/yjs.mjs:3245-3384` (`cleanupTransactions`), `:4558` `path`, `:4577` `keys`, `:4638` `delta` |
| **Yjs** `Doc.on('update')` | binary CRDT op stream | `Uint8Array` | end of transaction; **encoder is gated**: `if (doc._observers.has('update')) { ... }` | `yjs.mjs:3348` |
| **Automerge** `patchCallback` | patches from applying ops | `{action:'put'\|'del'\|'splice'\|'inc'\|'insert'\|'mark'\|'unmark'\|'conflict', path:(string\|number)[], value?/values?}` | at commit of `change()`/`applyChanges()`/`merge()`/`receiveSyncMessage()` | types `@automerge/automerge/dist/wasm_types.d.ts:153-224`; threading `dist/cjs/fullfat_node.cjs:6716-6788` |
| **Legend-State** `obs.onChange(cb)` | per-node listener with bubbling | `{value, getPrevious(), changes: [{path: string[], pathTypes, valueAtPath, prevAtPath}]}` — **parent listeners get the child path** | **synchronous** by default; inside `batch()` coalesced and flushed synchronously at `endBatch()`; `{immediate:true}` bypasses batching; `{trackingType:true}` = shallow (fires only at that exact node) | `@legendapp/state/index.js:470,478,498,525,542,555,611`; types `src/observableInterfaces.d.ts:54-59,88-93` |
| **Zustand** `subscribe` | whole-store listener | `(state, previousState)` — whole objects | sync per `setState` | `zustand/vanilla.js` |
| **Zustand** `subscribeWithSelector` | selector-diff wrapper | `(nextSlice, prevSlice)` | sync; fires only if `equalityFn` says different | `zustand/middleware.js:251-274`. `grep "path\|wildcard\|glob"` over `zustand/*.js` → **zero hits** |
| **Jotai** | `store.sub(atom, cb)` — per-atom, no payload | public store is exactly `{get, set, sub}` | sync | `jotai/vanilla/internals.js` `buildStore()` :784-810 |
| **Jotai** internal `storeHooks` | wildcard "an atom changed" | receives the **atom object**, not a value or path; `f` (flush) hook has zero payload | per write / per commit | `INTERNAL_getBuildingBlocksRev3(store)[6]`; `jotai/vanilla/internals.js:106-144,773-777`. `INTERNAL_`-prefixed, `Rev3` = third incompatible revision |
| **Solid** `createStore` | fine-grained per-property signals | **nothing** — `setProperty` writes the value then calls one per-property signal setter | n/a | `solid-js/store/dist/store.cjs:74-81,130-152`. `grep "subscribe\|listener\|onChange\|observe"` → **zero hits** |
| **Solid** `produce`/`reconcile` | mutate + fire per-node signals | nothing emitted; `reconcile` runs an old-vs-new diff and calls `setProperty` only for differing leaves | n/a | `store.cjs:338-452` (`applyState`) |
| **Solid** `DEV.hooks.afterUpdate` | dev-build global | **zero payload** ("something updated"). Store fields are deliberately hidden from `registerGraph`/`afterCreateSignal` — store signals are created with `{internal:true}` | dev build only (`store.cjs:454` sets `const DEV = undefined` in prod) | `solid-js/dist/dev.cjs:175-180,210-234,1801-1805`; `store.cjs:76-79` |
| **Vue 3** `watch(src, cb, {deep:true})` | deep dependency tracking | `(value, oldValue)` — and for a reactive object **`value === oldValue`** (same proxy). Tells you nothing about what changed. | scheduler-batched | verified by running; `@vue/reactivity 3.5.41` |
| **Vue 3** `onTrack`/`onTrigger` | debugger hooks | `{effect, target, type:'set'\|'add'\|'delete'\|'clear', key, newValue, oldValue, oldTarget}` — **no path**, just the raw target object + key | **synchronous at the write**, before the watcher callback | `dist/reactivity.cjs.js:604,626,701`. `grep onTrack\|onTrigger\|subsHead` in `reactivity.cjs.prod.js` → **0 hits**. **Dev-only.** |
| **Angular** `effect` / `linkedSignal` / `resource` | derivations | nothing about *what* changed; an effect can only react to signals it reads | — | angular.dev/guide/signals documents no global write-observation API |
| **Angular** `setPostSignalSetFn(fn)` | **global post-write hook on every writable signal in the process** | the raw `SignalNode` (`{value, version, kind:'signal', debugName?}`) — after the write, so no old value | **synchronous**, inside `signalValueChanged`, after `producerNotifyConsumers` | `@angular/core/fesm2022/_effect-chunk.mjs:332,349,384`; exported from the public entrypoint `@angular/core/primitives/signals` |
| **Angular** `ɵgetSignalGraph(injector)` | pull-based graph snapshot for DevTools | `{nodes:[{kind,id,epoch,label,value}], edges:[{consumer,producer}]}` | on demand | `types/core.d.ts:4601-4625`; `fesm2022/_debug_node-chunk.mjs:12219` |
| **TC39 proposal-signals** `Signal.subtle.Watcher` | notify-then-pull | `notify()` takes **no arguments**; you call `getPending(): Signal[]` to learn what's dirty | once per dirty transition until re-`watch()`ed; "No signals may be read or written during the notify" | proposal README lines 272-295 |
| **RxDB** `collection.$` | change feed | `{operation:'INSERT'\|'UPDATE'\|'DELETE', documentId, documentData, previousDocumentData, isLocal}` — whole documents, **not** field-level | synchronous `Subject.next()` at the write | `src/rx-change-event.ts`, `src/rx-database.ts` `$emit()` |
| **PouchDB/CouchDB** `_changes` | ordered, resumable feed | `{id, seq, changes:[{rev}], doc?, deleted?}`; feed modes `normal\|longpoll\|continuous\|eventsource`, PouchDB `live:true` | pull or streamed; `since=seq` resumes | docs.couchdb.org/en/stable/api/database/changes.html — `seq` "is the primary key for the changes feed, and is also used as a checkpointer by the replication algorithm" |
| **Firebase RTDB** | `child_added/changed/removed/moved`, `value` | **child-level**, one tree level under the ref. No wildcard path query. | local-optimistic: "All writes to the database trigger local events immediately, before any interaction with the server" | firebase.google.com/docs/database/web/read-and-write |
| **Redux / NgRx** | one `dispatch` chokepoint + action log | serializable actions | sync through the middleware/meta-reducer chain | `@ngrx/store/fesm2022/ngrx-store.mjs:197,359,485` |
| **NgRx store-devtools** | **recompute-from-action-log** | `LiftedState = {committedState, actionsById, stagedActionIds, computedStates, currentStateIndex}` | replay on invalidation | `@ngrx/store-devtools/fesm2022/ngrx-store-devtools.mjs:467` `computeNextEntry`, `:491` `recomputeStates`, `:521` `liftInitialState` |
| **NgRx SignalStore** | `patchState` + `watchState` | `watchState` gets whole state; **no interceptor of any kind** (`withHooks` is init/destroy only) | sync | `@ngrx/signals/fesm2022/ngrx-signals.mjs:5,205,789` |

### B.2 The distinct architectural MODELS

Nine mechanisms recur across the survey. They are not variants of one thing —
they differ in *who computes the delta* and *when*.

---

**M0 — Notify-only, no payload; consumer pulls.**
The notification carries nothing but "something under here is dirty". The
consumer then pulls whatever granularity it wants.

- Who: **TC39 Signals `Watcher`** (`notify()` takes no args; `getPending(): Signal[]`),
  **Solid** `DEV.hooks.afterUpdate` (zero payload), **Jotai**'s internal `f` flush hook
  (zero payload), **valtio with ops disabled** (the default — the listener fires,
  `ops === []`), **Angular** `producerNotifyConsumers` + global `epoch`, **Vue**'s
  `globalVersion`.
- Enables: invalidation, "redraw/resave something", cheap epoch-based staleness checks.
- Costs: O(1) per write, **zero allocation**. Measured: valtio write with a sync
  subscriber and ops off = 0.00035 ms/op.
- Does NOT enable: knowing *what* changed. Every consumer that needs that must
  pair M0 with a pull mechanism (M5 or M6).
- **Surprise:** this is the model the *standards track* chose. The TC39 proposal
  explicitly forbids reading or writing signals inside `notify`, forcing the
  pull.

---

**M1 — Selector diff.** Run a user-supplied selector before and after; call back
if the result differs.

- Who: **Zustand** `subscribeWithSelector` (`middleware.js:251-274`), **valtio**
  `subscribeKey` (`vanilla/utils.mjs:3` — literally `subscribe` + re-read +
  `Object.is`), **MobX** `reaction`.
- Enables: precise, typed, refactor-safe subscriptions with old/new values.
- Costs: O(selectors × writes). No structural information ever exists — you get
  the *value* you asked for, never a path. Cannot answer wildcard questions.
- This is what Angular `computed` + `effect` already gives SignalTree for free.

---

**M2 — Raw ops emitted at the write trap.** The setter itself pushes an op.

- Who: **valtio** (opt-in), **MobX** `observe`, **Legend-State** `changes[]`.
- Enables: exact per-write path + old/new value; cheapest possible emission.
- Costs: **the ops are raw** — they leak the JS engine's actual property writes.
  Measured: `splice(0,1)` on a 3-element valtio array emits **four** ops
  including `['set', ['list','length'], 2, 3]`. immer's commit-time diff of the
  same operation emits **two** patches. Also no coalescing: a set followed by a
  delete on the same path within one batch keeps both.
- Runtime: near-free. valtio ops on, 1 sync subscriber = 0.00044 ms/op vs
  0.00035 with ops off. Path construction is O(depth) array spreads per hop
  (`vanilla.mjs:113` `newOp[1] = [prop, ...newOp[1]]`), which shows up as
  superlinear depth cost: depth 1/5/20 = 0.00032 / 0.00055 / 0.00191 ms/op.
- **Both maintainers of this model have retreated from it.** valtio 2.3 made op
  creation **opt-in** — `vanilla.mjs:79` is a bare `let createOp;` and the
  default `subscribe` callback receives an **empty array**. MobX's own docs call
  it an anti-pattern (see B.4).
- Legend-State is the exception that proves the cost: its parent-chain walk
  (`computeChangesRecursive`, `index.js:525`) runs **unconditionally on every
  `set()`**, listeners or not; the listener check only gates whether a `Change`
  object gets constructed.

---

**M3 — Write-time key bookkeeping, diffed at commit.** *This is what immer
actually does, and it is not "patches emitted by the write".*

- The write path records only **which keys were touched**, value-free and cheap:
  `proxy.ts:212` `state.assigned_.set(prop, true)`. At `produce()` commit,
  `generatePatchesFromAssigned` (`patches.ts:238`) iterates *only those keys* and
  compares `base_[key]` vs `copy_[key]`.
- Proof that it is a diff and not a journal: **write-then-revert inside one
  recipe emits zero patches**, and two writes to the same path emit one patch.
  Ran both.
- Enables: minimal, normalized, coalesced patches **and** exact inverse patches
  for free (verified: `applyPatches(next, inverse)` round-trips to `base`
  exactly).
- Costs: requires a transaction boundary. Runtime cost scales with the **breadth
  of each node along the write path** (the copy-on-write shallow copies), not
  with total tree size. Measured, one leaf write, 10 000 leaves total:
  500 root keys → 0.083 ms/op; 50 root × 200 leaves → 0.023; 5 root × 2000
  leaves → 0.310. And the patch generation itself is **≈ free**:
  `produceWithPatches` 0.0683 vs plain `produce` 0.0679 ms/op on the same tree.
- The bookkeeping (`assigned_` Map allocation, `prepareCopy` at `proxy.ts:349`)
  is paid **whether or not** patches are enabled; only the generation is gated
  (`scope.ts:62` sets `patchPlugin_` only if a listener was passed).

---

**M4 — Whole-tree diff after the fact.** Keep the old tree, structurally compare.

- Who: **fast-json-patch** `compare()`; **Solid** `reconcile` in the *inverse*
  direction (diff an incoming new state into existing fine-grained signals,
  `store.cjs:338-452`).
- Enables: works with **any** write mechanism — no instrumentation, no
  chokepoint, no proxies. Immune to the bypass problem entirely.
- Costs: **O(total tree) per observation**, independent of how small the change
  was. Measured, one leaf write: 1 000 leaves = 0.099 ms/op; 10 000 leaves =
  0.783 ms/op. That is ~1 800× the cost of a valtio op and ~11× immer's
  commit-time diff on the same tree. Also requires retaining a full previous
  copy.
- Loses information the other models keep: it cannot distinguish "written with
  the same value" from "not touched", and it cannot see intermediate states.

---

**M5 — Versioned immutable snapshot with structural sharing; "what changed" is a
*query*, answered by reference identity.**

- Who: **valtio** `snapshot()` (`vanilla.mjs:5-40,224`). Also what immer's output
  is, and what Automerge/Yjs materialised docs are.
- Verified: after `s.a.b.c = 2`, `snap1.untouched === snap2.untouched` is **true**
  (O(1) proof that an entire subtree is unchanged) while `snap1.a !== snap2.a`;
  `snapshot()` is cached per global version so calling it twice returns the same
  reference; snapshot properties are non-writable (writing throws `TypeError`).
- Enables: every consumer diffs **lazily and only the subtrees it cares about**,
  at O(depth of the question) rather than O(tree). Persistence can walk only its
  own slice. Devtools can hold two references. Nothing is emitted, nothing is
  allocated per write, and there is no subscription API to design.
- Costs: requires copy-on-write along the write path (M3's cost) and immutable
  reads; you cannot mutate in place. Reference identity is a *conservative*
  answer — same reference proves unchanged, different reference does not prove
  changed.
- Measured cost of the primitive: reference identity compare = 0.003 µs vs
  0.047 µs to *build* a `'a.b.c'` dot-path string. Building the string is the
  dominant cost of a path-string model and is paid per write.

---

**M6 — Ordered, replayable log with a checkpoint cursor.** State is *derived
from* the log rather than the log describing the state.

- Who: **CouchDB/PouchDB** `_changes` (`seq` "is the primary key for the changes
  feed, and is also used as a checkpointer by the replication algorithm";
  `since=seq` resumes), **NgRx store-devtools** (`recomputeStates` replays the
  staged action log through the reducer from `committedState` —
  `ngrx-store-devtools.mjs:467,491,521`), **Yjs** binary `update` stream,
  **Automerge** `getChanges`/`applyChanges`.
- Enables the one capability **no other model has: resumability**. A consumer
  that was offline, or that starts late, can ask for "everything since N". Time
  travel becomes exact and free because state is a fold over the log.
- Costs: the log must be retained and compacted; every write must be expressible
  as a log entry (serializable); and for Redux/NgRx, every write must go through
  one dispatch.
- Note the honest limits: CouchDB explicitly warns "The results returned by
  `_changes` are partially ordered… Only the most recent change for a given
  document is guaranteed to be provided." RxDB and Firebase RTDB deliver events
  but expose **no** app-facing sequence cursor — resumability is SDK-internal.

---

**M7 — Interception before the write.** MobX `intercept` (mutate `change` or
return `null` to cancel — `intercept-utils.ts`; verified that returning `null`
cancels the write *and* suppresses the downstream `observe`), Redux middleware.
Officially discouraged in MobX (B.4). This is the only model that can *veto*.

---

**M8 — Lazy attach / detach.** Not a change model — the cost-control mechanism
that makes M2 affordable.

- **valtio**: child proxies are wired into the parent's notification chain only
  when `listeners.size` hits 1, and torn down at 0 (`vanilla.mjs:124-129,142-160`).
- **MobX**: `onBecomeObserved/Unobserved` fire on the 0↔1 observer transition;
  `hasListeners()` gates change-object allocation on every write path.
  Benchmarked by the subagent: 2 M writes = ~90 ms with 0 listeners, ~113 ms with
  1, ~188 ms with 10.
- **Yjs**: the binary update encoder is skipped entirely unless someone
  subscribed (`yjs.mjs:3348`); `delta`/`keys`/`path` are **lazy memoized
  getters** — instrumented, they were invoked **0 times** when the observer never
  read them, and 0 times with no observer at all.
- **TC39**: `Signal.subtle.watched`/`unwatched`.
- **Counter-example — Automerge does not do this**: `applyAndReturnPatches` runs
  unconditionally on every commit (`fullfat_node.cjs:6716-6736`); benchmarked
  20 000 `change()` calls with vs without a `patchCallback` = 1.02× ratio. You
  pay for patches whether or not anyone wants them.

### B.3 Known limits of the patch formats (verified, not read)

- **No move op in practice.** RFC 6902 defines `move` and `copy`, but neither
  immer nor fast-json-patch ever emits them. Confirmed by running: across four
  different mutations, fast-json-patch's `compare()` produced only
  `replace/add/remove`. A subtree rename `{o:{x:1}}` → `{p:{x:1}}` becomes
  `remove /o` + `add /p` **with a full copy of the value**.
- **Array reordering is O(n) positional replaces.** immer, `unshift(0)` on
  `[1,2,3]` → 4 patches (3 `replace` + 1 `add`). `reverse()` on `[1,2,3]` → 2
  positional replaces. Nothing in either format expresses "these elements moved".
  This is exactly why CRDTs exist: Yjs's `delta` (`[{retain},{insert},{delete}]`)
  and Automerge's `splice`/`insert` are sequence-aware where JSON Patch is not.
- **Path types are inconsistent across implementations.** immer array paths are
  `['string','number']` (mixed); its Map paths are strings; valtio's are all
  strings (`['list','3']`); RFC 6902 is a single Pointer string; Yjs/Automerge
  use mixed arrays. There is no interop without a conversion layer.
- **JSON Merge Patch cannot express two things you will hit.** Per RFC 7386, a
  `null` in the patch means *delete*, so **you cannot set a value to null**; and
  "it is not possible to patch part of a target that is not an object, such as
  to replace just some of the values in an array." It is a fine wire format for
  coarse partial updates and useless as a change *record*.
- **Prototype-pollution guard exists in the apply path, not the generate path.**
  immer's `applyPatches_` throws on `__proto__`/`constructor`/`prototype`
  (`patches.ts:340-346`, added for immer issue #738). Verified: both throw
  `[Immer] Patching reserved attributes like __proto__, prototype and
  constructor is not allowed`. Relevant to Q1: *a patch stream is an untrusted-key
  ingress the moment it can be applied from outside.*

### B.4 What the maintainers themselves say (verbatim, with URLs)

- **MobX**, mobx.js.org/intercept-and-observe.html: *"⚠️ Warning: intercept and
  observe are low level utilities, and should not be needed in practice. Use some
  form of reaction instead, as observe doesn't respect transactions and doesn't
  support deep observing of changes. Using these utilities is an anti-pattern."*
  And on `intercept` specifically: *"Please avoid this API. It basically provides
  a bit of aspect-oriented programming, creating flows that are really hard to
  debug."* Both stated reasons were reproduced empirically: `observe` on a parent
  did **not** fire for a nested mutation, and it fires inline rather than at
  transaction end.
- **MobX**, mobx.js.org/analyzing-reactivity.html: *"In production builds, the spy
  API is a no-op as it will be minimized away."* Confirmed by grep:
  `spyReportStart` appears 15× in `mobx.cjs.development.js`, **0×** in
  `mobx.cjs.production.min.js`.
- **MobX 7 CHANGELOG**: *"The public `trace` API and its related runtime support
  have been removed."* `require('mobx').trace === undefined`; both trace doc URLs
  404.
- **valtio**, `vanilla/utils.mjs:20`: the `watch` util now warns
  *"[DEPRECATED] The `watch` util is no longer maintained."* `proxyWithHistory` is
  gone from the 2.x exports entirely.
- **Redux**, redux.js.org: the chokepoint is a convention, not a guarantee —
  *"nothing prevents you from accidentally mutating the current state value!…
  The Redux store doesn't do anything else to prevent accidental mutations."*

### B.5 Direct answers to the key questions

---

**Q. Is "patches emitted by the write path" better than "diff after the fact" and
better than "notify with path strings"?**

They are not on one axis, and the framing of the question contains an error worth
naming: **immer does not emit patches from the write path.** It records touched
*keys* during the write and runs a key-scoped **diff at commit** (M3). The
libraries that genuinely emit at the write trap are valtio and MobX (M2), and
their output is measurably worse-shaped: `splice(0,1)` gives four raw ops
including a `length` write, where immer's commit diff gives two normalized
patches. Coalescing and normalization are *free* in M3 and *absent* in M2.

Ranked on the things that actually differ:

| | diff-after (M4) | commit-diff from write-bookkeeping (M3) | raw ops at the trap (M2) | path strings only |
| - | - | - | - | - |
| runtime, 1 leaf write in 10 k-leaf tree | **0.783 ms** | **0.068 ms** | **0.0004 ms** | ~0.05 µs to build the string |
| scales with | total tree size | breadth along the write path | depth of the write | depth of the write |
| coalesces repeated writes | yes (implicitly) | **yes, verified** | **no** | no |
| normalizes array ops | partly | yes | **no — leaks `length` writes** | n/a |
| gives old value | yes | yes | yes | **no** |
| gives inverse for undo | derivable | **free and exact, verified round-trip** | derivable from prev | **no** |
| needs instrumented writes | **no** | yes (proxy/draft) | yes (proxy/trap) | yes |
| needs a transaction boundary | no | **yes** | no | no |

The thing "notify with path strings" uniquely fails at is **carrying a value**. A
path with no value can drive invalidation and audit logging and nothing else — it
cannot drive persistence (you must re-read), undo (no inverse), sync (nothing to
send), or devtools (nothing to show). Every consumer degrades into "path told me
something happened; now go read the tree", i.e. M0 with extra allocation. That is
strictly worse than M0, because M0 doesn't pay 0.047 µs/write to build a string
nobody uses.

---

**Q. Does anything unify undo/redo, persistence, devtools, sync and change
observation behind ONE mechanism?**

**Only the CRDTs, and they pay for it with a completely different data model.**

- **Yjs**: one binary `update` stream serves sync *and* persistence; structured
  `observeDeep` deltas serve UI; `Y.UndoManager` serves undo. But undo is **not**
  inverse patches — `StackItem` records `DeleteSet`s of CRDT struct IDs and
  `undo()` structurally replays by deleting previously-inserted structs
  (`yjs.mjs:3435-3448,3468-3556`). Three mechanisms over one substrate.
- **Automerge**: patches + `getChanges`/`applyChanges` cover sync, replication
  and change observation from one op log. But `grep -ci "undo\|redo"` over the
  whole package = **0**. There is **no undo API at all**. Application-level undo
  must be built from `diff`/`view(doc, heads)`.

The non-CRDT libraries **deliberately keep them separate**, and the sharpest
evidence is valtio's own devtools integration (`vanilla/utils.mjs:82-158`): it
turns ops on (`unstable_enableOp()`, `:95`), then uses the ops **only to build a
human-readable action label** (`"set:a.b.c"`), and ships a full `snapshot()` as
the state (`:106-114`). Time travel is `Object.assign(proxyObject, wholeState)`
from a snapshot (`:133`) — **not** inverse patches. The author of the op stream
did not use the op stream for state transfer.

NgRx is the other end: store-devtools *is* unified with the action log
(`recomputeStates` re-derives state by replaying actions through the reducer),
but only because state is defined as a fold over that log. Persistence and undo
there are still separate concerns.

**Finding: no library in this survey unifies all five behind one mechanism
without adopting a CRDT/event-sourced data model.** Two out of five (sync +
observation) unifies easily; adding undo requires either inverse patches (immer,
which nobody in this survey actually ships as their undo story) or a separate
structural-replay stack (Yjs).

---

**Q. In a system where a write can happen directly on a leaf and bypass any root
chokepoint, what do libraries do? Is a chokepoint even achievable?**

Three observed answers, and the empirical result is unambiguous: **nobody
achieves a root chokepoint; the ones that get complete coverage instrument the
leaves.**

1. **Accept the bypass and be honest about it.** **NgRx SignalStore** is the
   direct comparable — Angular signals, a state tree, a `patchState` API. Its
   state source is **one writable signal per top-level key**
   (`ngrx-signals.mjs:789` `stateSource[key] = signal(state[key])`), and the
   `toDeepSignal` proxy (`:5`) falls through to `target[prop]` for non-record
   values, **handing the caller the real `WritableSignal.set`**. Verified by
   running against `@ngrx/signals@21.1.1`: `count.set(999)` changed the state to
   999 while the `watchState` log stayed at `[{count:0},{count:1}]`. `patchState`
   is a convention. There is no interceptor hook of any kind — `withHooks` is
   `onInit`/`onDestroy` only. Redux has the same gap in weaker form ("nothing
   prevents you from accidentally mutating the current state value").
2. **Instrument every leaf so there is no bypass to have.** valtio, MobX,
   Legend-State, Vue and Solid all put the trap on the *node*, not the root. A
   "direct write" is still a trapped write. The root API is then just sugar. This
   is the only construction in the survey that is actually complete.
3. **Own the data type entirely.** Yjs/Automerge: you cannot write except through
   their types, so the log is total by construction.

**And Angular already ships mechanism (2) for signals.** `setPostSignalSetFn`
(`@angular/core/fesm2022/_effect-chunk.mjs:349`) installs a process-global
callback invoked inside `signalValueChanged` (`:384`) after **every** writable
signal write. I built a working proof against the real Angular primitives
(`trackb/ng-chokepoint.mjs`): tag each leaf's `SignalNode` with its dot-path at
construction, install one chained hook, filter by a tree-id tag. Result — a
**direct leaf write `t.a.b.c.set(11)` that bypasses every root API was captured
with its path**:

```
C. after microtask: [[{"path":"a.b.c","value":11,"version":2},
                      {"path":"a.b.d","value":22,"version":1},
                      {"path":"z","value":5,"version":1}]]
```
…with zero journal entries while no listener was registered, equal-value writes
suppressed by Angular's own equality gate before the hook, and another tree's
signals filtered out. `linkedSignalSetFn` routes through `signalSetFn`, so
`linkedSignal` writes are covered too; `computed` recomputation is not (it never
calls `signalSetFn`), which is correct.

Caveats that must be recorded: it is **one global slot** (`setPostSignalSetFn`
returns the previous fn — every consumer must chain, and Angular DevTools may
want it); it is exported from the public entrypoint `@angular/core/primitives/signals`
but **has no angular.dev API page and no stability annotation**; it fires *after*
the assignment so the **old value is not recoverable** from the node; and it sees
leaf writes only — branch add/remove is invisible because branches aren't signals.
Nothing in the shipped `@angular/*` packages currently installs a hook, so there
is no conflict today — but that is an observation, not a guarantee.

---

**Q. Is there a THIRD model, neither "return changed paths" nor "subscribe to a
notifier"?**

Yes — at least three, and two of them are what the strongest libraries actually
converged on.

1. **M5 — versioned immutable snapshot with structural sharing; "what changed" as
   a *pull query* answered by reference identity.** Nothing is emitted and there
   is no subscription payload to design. `snap1.untouched === snap2.untouched`
   proves an entire subtree is unchanged in O(1) — 0.003 µs, ~16× cheaper than
   *constructing* one dot-path string. Each consumer descends only into the
   subtree it cares about, so persistence pays for its slice and devtools pays
   for theirs, instead of every write paying for the union of everyone's needs.
   valtio ships this (`vanilla.mjs:5-40`) and, notably, **uses it in preference
   to its own op stream** for devtools state transfer.
2. **M0 — notify-with-no-payload plus a monotonic version, consumer pulls.** This
   is where the *standards track* landed: TC39 `Watcher.notify()` takes no
   arguments and forbids reading signals inside it; you call `getPending():
   Signal[]` afterwards. Angular already has both halves (`producerNotifyConsumers`
   and a global `epoch`, `_effect-chunk.mjs:9,91,384`). The consumer decides
   granularity; the write path allocates nothing.
3. **M6 — an ordered log with a checkpoint cursor**, which buys the one thing
   neither "return paths" nor "subscribe" can offer: a consumer that missed
   events can resume from `since=N`. Both current APIs are lossy for any consumer
   that wasn't attached at the moment of the write.

The genuinely interesting composition — and the one the evidence points at — is
**M0 + M5**: instrument the leaves (Angular's `setPostSignalSetFn` gives this for
free), notify with a version and nothing else, and let each consumer pull exactly
what it needs from version-stamped structurally-shared snapshots. That collapses
`updateAndReport`, `onPathChange` and `PathNotifier` into *one* invalidation
signal plus a query, rather than three payload formats.

### B.6 Surprises

1. **valtio's ops are OFF by default in 2.3.2.** `vanilla.mjs:79` is a bare
   `let createOp;`. A default `subscribe(state, cb)` callback receives
   `ops === []`. The op stream — the feature valtio is most cited for — is now
   opt-in via `unstable_enableOp()`, and valtio's own devtools is what turns it
   on. Any documentation claiming "valtio subscribe delivers ops" is describing
   an older version.
2. **valtio's devtools doesn't use ops for state, and its time travel isn't
   patch-based.** Ops become a string label; the state is a full snapshot;
   `JUMP_TO_STATE` is `Object.assign(proxy, snapshot)`.
3. **immer is a commit-time diff, not a write-time journal**, and the patch
   generation is essentially free on top of the copy-on-write it already does
   (0.0683 vs 0.0679 ms/op). The write-then-revert-to-zero-patches result is the
   clean proof.
4. **Angular ships a global post-write hook on every writable signal in the
   process**, from a public entrypoint, undocumented, unused by Angular itself.
   It solves the "direct leaf write bypasses the root" problem outright.
5. **The TC39 Signals proposal deliberately gives the notify callback no
   payload** and forbids signal access inside it. The standards-track answer to
   "what changed" is *pull the dirty set*.
6. **Solid deliberately hides store fields from its own devtools graph** — store
   per-property signals are created with `{internal: true}`, which skips
   `registerGraph`/`afterCreateSignal` (`store.cjs:76-79`, `dev.cjs:210-234`).
   And Solid's public store API has **zero** subscribe/observe surface. This is a
   choice, not an omission.
7. **Vue's `watch(deep: true)` hands you `value === oldValue`** — the same proxy.
   The closest analogue to a signal tree gives you *nothing* about what changed
   through its public deep-watch API, and its only path-ish channel
   (`onTrack`/`onTrigger`) is **completely stripped in production** (0
   occurrences in `reactivity.cjs.prod.js`) and carries no path anyway, just
   `{target, key}`. Directly relevant to the "guardrails dead in prod" note:
   Vue's answer is that hot-path/debug instrumentation *should* be dev-only, and
   it accepts an expensive dev payload (it clones whole Maps/Sets as `oldTarget`)
   precisely because prod strips it.
8. **Automerge has no undo/redo API at all** (0 grep hits across the package) and
   pays for patch generation unconditionally (1.02× with vs without a callback).
9. **Yjs's `delta`/`keys`/`path` are lazy memoized getters that throw if read
   after the handler returns.** Instrumented: 0 invocations when the observer
   never reads them. The library that most *needs* deltas still refuses to
   compute them speculatively.
10. **MobX's `observe` is shallow-only** — a parent's listener does not fire for
    a nested mutation. The API that looks most like `onPathChange` doesn't do the
    deep case at all, and its docs say to stop using it.

### B.7 What I could NOT establish

- **Whether `setPostSignalSetFn` is intended as supported public API.** It is in
  `package.json` `exports` under `./primitives/signals` with no `ɵ` prefix and no
  `@developerPreview`/`@experimental` tag, but I found **no angular.dev API
  reference page** for the entrypoint. Its stability is unknown; treat as
  unsupported until someone asks the Angular team.
- **Whether anything else in an Angular app competes for that single hook slot.**
  Grep found no installer in the shipped `@angular/*` packages, but Angular
  DevTools is a browser extension I did not inspect, and I could not test the
  interaction.
- **Old values from the Angular hook.** The hook fires after `node.value =
  newValue`; I found no way to recover the previous value from the node. Capturing
  it would require wrapping every setter, which reintroduces the bypass problem.
- **A same-workload benchmark across libraries.** My numbers compare *models*
  (M2/M3/M4) using each library's idiomatic path; they are not a like-for-like
  library shootout, and immer's absolute numbers include its copy-on-write, which
  the others don't do.
- **MobX 6 vs 7 by direct source diff.** Only mobx 7.0.0 was installed; the 6→7
  API stability claim for `observe`/`intercept`/`spy`/`reaction`/`onBecomeObserved`
  rests on the CHANGELOG, not a tarball diff. `trace()` removal in 7 *is* directly
  verified.
- **Legend-State's zero-listener cost in ns/op.** Established qualitatively from
  source (the parent walk is unconditional) but not measured.
- **Official Automerge prose docs for patch semantics** — automerge.org has no
  patches page at the URLs tried; that section rests on `.d.ts` + bundled source
  + live runs.
- **RxDB cross-tab (BroadcastChannel) delivery semantics** — only the
  single-instance synchronous `$emit()` path was traced.
- **Whether an M0+M5 design actually works for this repo's consumers**
  (`persistence`, `timeTravel`, `devTools`, `guardrails`). That is a synthesis
  question and depends on Findings C.

## Findings C — internal ground truth

**Method.** Every row below was derived from source in `packages/*/src/**`
(excluding `*.spec.ts`) or reproduced by running throwaway `zz-*.spec.ts`
probes under `npx vitest run zz-` in `packages/core`, `packages/shared`,
`packages/enterprise` and `packages/guardrails`. Comments, JSDoc and RFCs were
read only to be checked *against* the code; where they disagree the
disagreement is listed in §C7. All probe files were deleted; `git status
--porcelain` shows only this doc.

Notation for provenance:
- **TREE** — key came from the tree's own signal graph (`Object.keys(store)`,
  `Object.keys(node)` on a live accessor).
- **PAYLOAD** — key came from data crossing the library boundary
  (`signalTree(initial)`, a `Partial<T>` update, `JSON.parse`, storage,
  devtools message, realtime event, form model).
- **CONFIG** — key came from a developer-authored literal (schema map,
  validator map, derived factory result, slice names). Not attacker-controlled
  in the usual threat model, but also not tree-derived.

### C1 — Ingress table: every payload-key iteration site

Loops are listed once (not once per assignment inside them).

| # | Site | Keys from | Use | Guard | Verified |
| - | ---- | --------- | --- | ----- | -------- |
| 1 | `core/src/lib/signal-tree.ts:465` `createSignalStore` | PAYLOAD (`signalTree(initial)`) | WRITE `store[key] = …` ×6 | `key === '__proto__'` inline (line 480), dev-only diagnostic ST2016 | probe D1/D2 clean |
| 2 | `core/src/lib/signal-tree.ts:289` `recursiveUpdate` | PAYLOAD (`Partial<T>`) | READ `targetObj[key]` | **none** — reads `Object.prototype` for `__proto__`, falls through with no branch and no diagnostic | probe D3/D4/D5 clean (no sink present) |
| 3 | `core/src/lib/utils.ts:468` `applyState` | PAYLOAD (devtools postMessage, snapshot restore) | READ + WRITE `stateNode[key] = val` (2 sites) | `key === '__proto__'` **and** `hasOwnProperty(stateNode, key)` | probe D6/D7 clean |
| 4 | `core/src/lib/lazy/lazy-tree.ts:90` proxy `get` | PAYLOAD (any property read) | READ | `isUnsafeKey` = `key === '__proto__'` only | probe P3 clean |
| 5 | `core/src/lib/lazy/lazy-tree.ts:208` proxy `set` | PAYLOAD | WRITE `target[key] = value` | `isUnsafeKey` | — |
| 6 | `core/src/lib/lazy/lazy-tree.ts:240` proxy `defineProperty` | PAYLOAD | WRITE | `isUnsafeKey` | — |
| 7 | `core/src/lib/lazy/lazy-tree.ts:247` proxy `has` | PAYLOAD | READ | `isUnsafeKey` | — |
| 8 | `core/src/lib/utils.ts:243` `unwrap` (accessor branch) | TREE | WRITE `result[key] = …` into fresh `{}` | `hasOwnProperty` on source | — |
| 9 | `core/src/lib/utils.ts:325` `unwrap` (plain branch) | **PAYLOAD** (recurses into leaf *values*) | WRITE `result[key] = …` into fresh `{}` | `hasOwnProperty` on source only — **no name check** | **PROVEN**: probe A1/A2 — a leaf holding `JSON.parse('{"deep":{"__proto__":{…}}}')` yields a snapshot whose `blob.deep` has an attacker-keyed prototype; `JSON.stringify` shows `{}` |
| 10 | `core/src/enhancers/serialization/serialization.ts:276` `unwrapObjectSafely` | PAYLOAD (leaf values) | WRITE into fresh `{}` | none | same class as #9 |
| 11 | `…/serialization.ts:368` `detectCircularReferences` | PAYLOAD | READ | none | no sink |
| 12 | `…/serialization.ts:553` `restoreSpecialTypes` | PAYLOAD (`JSON.parse` of storage) | WRITE into fresh `{}` | none | same class as #9 |
| 13 | `…/serialization.ts:595` `updateSignals` (rehydrate) | PAYLOAD (`JSON.parse` of storage) | READ `target[key]`, then **recurses into `Object.prototype`** | `hasOwnProperty` on **source**, not on target; no name check | probe P1 clean (no write sink: only `signal.set()` is reachable) |
| 13b | `…/serialization.ts:659` nodeMap path walk | PAYLOAD (dotted paths from the persisted metadata) | READ `node[p]` walking arbitrary segments | none | no sink found |
| 14 | `…/serialization.ts:745` `encodeSpecials` | PAYLOAD | WRITE into fresh `{}` | none | same class as #9 |
| 15 | `…/serialization.ts:813` `walkAlias` | TREE | WRITE `nodeMap[path]` | n/a | — |
| 16 | `core/src/enhancers/devtools/devtools-impl.ts:380` snapshot diff | PAYLOAD ∪ TREE | READ | none | — |
| 17 | `…/devtools-impl.ts:458` `sanitizeState` | PAYLOAD | WRITE into fresh `{}` | none | same class as #9 |
| 18 | `…/devtools-impl.ts:1775` `refreshTreeTopKeys` | TREE | READ | n/a | — |
| 19 | `core/src/enhancers/batching/batching.ts:356` `batchUpdate` | PAYLOAD | READ `$[key]` then call `.set` | none | `$['__proto__']` → `Object.prototype`, `typeof … === 'function'` false → skipped; no sink |
| 20 | `core/src/enhancers/utils/copy-tree-properties.ts:12,24` | TREE | WRITE `defineProperty` | `hasOwnProperty` + skip non-configurable | — |
| 21 | `core/src/lib/entity-signal.ts:246` `createEntityNode` | **PAYLOAD** (an entity from realtime/HTTP) | WRITE `Object.defineProperty(node, key, {get})` | **none** | mints an own `__proto__`/`constructor` accessor on the node; no global sink |
| 22 | `core/src/lib/markers/form.ts:391` `readFromStorage` | **PAYLOAD** (`localStorage` JSON) | WRITE via object **spread** `{…initial, …JSON.parse(stored)}` | none | **PROVEN**: probe P4 — result has a real own `__proto__` key (`ownProtoKey=true`, prototype unchanged) |
| 23 | `core/src/lib/markers/form.ts:599` `createFieldsProxy` | CONFIG (`config.initial`) | WRITE `proxy[key]`, `defineProperty(fieldAccessor, childKey)` | none | uses `initial`, not the hydrated values — so #22's own `__proto__` does not reach it |
| 24 | `core/src/lib/markers/form.ts:419/473/489/665/813/825/844` | CONFIG (`config.initial`) | READ/WRITE into fresh `{}` | none | — |
| 25 | `core/src/lib/markers/entity-loader.ts:239` param key sort | CONFIG/PAYLOAD (loader params) | READ | none | cache-key building only |
| 26 | `core/src/lib/markers/entity-loader.ts:713` tag walk | TREE | READ | none | — |
| 27 | `core/src/lib/markers/stored.ts:229` `createStorageKeys` | CONFIG | WRITE into fresh `{}` | none | — |
| 28 | `core/src/lib/markers/entity-map.ts:264` slice install | CONFIG | WRITE `entitySignal[name] = …` | none | — |
| 29 | `core/src/lib/internals/merge-derived.ts:86` `ensurePathAndGetTarget` | CONFIG (derived factory keys) | WRITE `current[part] = {}` after an **inherited** `part in current` test | none | a derived factory returning `{__proto__: …}` is a sink; developer-controlled |
| 30 | `core/src/lib/internals/merge-derived.ts:170/185/201` | CONFIG | WRITE `target[key] = …` | none | — |
| 31 | `core/src/lib/internals/materialize-markers.ts:241/316` | TREE | WRITE `node[key] = materialized` | n/a | — |
| 32 | `core/src/lib/internals/visit-tree.ts:70` | TREE | READ, try/catch | n/a | the canonical walker; used by batching, interceptLeafSignals |
| 33 | `core/src/lib/audit/audit.ts:125` | PAYLOAD (keys returned by `getChanges`) | READ `previousState[key]` | none | — |
| 34 | `core/src/security.ts:47` `security()` walk | PAYLOAD | READ + `validateKey` | denylist `['__proto__','constructor','prototype']` — **opt-in only** | never runs unless the consumer passes `security()` |
| 35 | `shared/src/lib/merge-deep.ts:19` | **PAYLOAD** (`JSON.parse(localStorage)` via ng-forms) | WRITE `targetObj[key] = …` ×2 | **none** | **PROVEN (O5 still open)**: probe S1 sets the target's prototype; S2 the same one level down; S3 replaces `target.constructor` |
| 36 | `shared/src/lib/get-changes.ts:19` | **PAYLOAD**, and `for…in` so **inherited keys too** | WRITE `changes[key] = …` into fresh `{}` | **none** | **PROVEN**: probe S4 — the returned `changes` object's prototype is attacker-supplied while `Object.keys(changes)` is `[]` |
| 37 | `shared/src/lib/deep-clone.ts:107` | PAYLOAD | WRITE `defineProperty(result, key, descriptor)` | none (uses `defineProperty`, so no setter invocation) | probe S6: clone keeps a real own `__proto__` (`ownProto=true`) — mints the own-key primitive |
| 38 | `shared/src/lib/deep-equal.ts:83` | PAYLOAD | READ | none | O6/O7 still open — probe S7 `deepEqual(new Error('a'), new Error('b')) === true`; S8 same for `new Number(1)/(2)`; S9 `deepEqual(Object.create(Date.prototype), new Date(0))` **throws** |
| 39 | `enterprise/src/lib/update-engine.ts:377` path walk | PAYLOAD | READ | `isUnsafeKey` (name first) **then** `hasOwnProperty` | probe E1/E2 clean |
| 40 | `enterprise/src/lib/update-engine.ts:450` `applyPatch` | PAYLOAD | WRITE `defineProperty` | `isUnsafeKey` + own **enumerable** descriptor required | — |
| 41 | `enterprise/src/lib/update-engine.ts:479` `applyDeepToNode` | PAYLOAD | READ + recurse | `isUnsafeKey` + `hasOwnProperty` | — |
| 42 | `enterprise/src/lib/diff-engine.ts:243/266` | PAYLOAD | READ | `opts.keyValidator` — **optional, defaulted `undefined` at line 120, and supplied by no caller in the repo.** Dead guard. | grep |
| 43 | `enterprise/src/lib/update-engine.ts:539` `isEqual` | PAYLOAD | READ | none | — |
| 44 | `enterprise/src/lib/path-index.ts:301` | TREE | READ | none | — |
| 45 | `ng-forms/src/core/ng-forms.ts:1291` `hydrateInitialValues` | **PAYLOAD** (`storage.getItem` → `JSON.parse`) | passes straight to `mergeDeep` (#35) | none | **this is the live consumer of the O5 sink** — it is `mergeDeep`'s only caller in the repo |
| 46 | `ng-forms/src/core/ng-forms.ts:662` `enhanceArraysRecursively` | TREE via `for…in` (walks inherited) | WRITE `obj[key] = enhanceArray(…)` | none | — |
| 47 | `ng-forms/src/core/ng-forms.ts:817` `createAbstractControl` | PAYLOAD (form values) | WRITE `controls[key] = …` into fresh `{}` | none | same class as #9 |
| 48 | `ng-forms/src/core/ng-forms.ts:528` `setValues` | PAYLOAD (`Partial<T>`) | READ, forwards each key to `setValue` | none | — |
| 49 | `ng-forms/src/core/ng-forms.ts:1192/1198/1230/1236/1313/1347` validator maps | CONFIG | READ/WRITE `normalized[path] = …` | `findValidator` uses `hasOwnProperty` (line ~1338); `resolveFieldConfig` (line 1310) uses a bare truthiness `fieldConfigs[path]` — **inconsistent** | — |
| 50 | `ng-forms/src/enhancer/form-bridge.ts:348` `createFormGroupFromValues` | PAYLOAD (form values, possibly storage-hydrated) | WRITE `controls[key] = …` into fresh `{}` → `new FormGroup(controls)` | none | a `__proto__` key silently vanishes from the FormGroup |
| 51 | `ng-forms/src/enhancer/form-bridge.ts:403` `patchFormGroupValues` | PAYLOAD | READ via `group.get(key)` | Angular's own lookup | — |
| 52 | `ng-forms/src/enhancer/form-bridge.ts:127` `findFormSignals` | TREE | READ | `_`/`set`/`update` skip | — |
| 53 | `ng-forms/src/enhancer/form-bridge.ts:448` `collectControlErrors` | TREE (Angular controls) | WRITE `result[path]` | none | — |
| 54 | `schema/src/lib/schema.ts:131` `compileEntries` | CONFIG (`config.schemas`) | READ | none | — |
| 55 | `schema/src/lib/internals/matcher.ts:157/215` | TREE | READ + WRITE `out[key]` into fresh `{}` | none | — |
| 56 | `realtime/src/create-realtime-enhancer.ts:151` | CONFIG (subscription paths) | READ | none | — |
| 57 | `realtime/src/create-realtime-enhancer.ts:~170` path walk `entitySignal?.[part]` | CONFIG | READ | none | dotted-path navigation, developer-supplied |
| 58 | `realtime` `callback` → `entitySignal.upsertOne(transformed)` | **PAYLOAD** (server realtime event) | hands the raw entity to `entityMap` → feeds #21 | none | untrusted server payload reaches `defineProperty` at #21 |
| 59 | `events/src/angular/entity-events.ts:93` | PAYLOAD (event) | READ `Object.keys(value).sort()` for an idempotency key | none | no sink |
| 60 | `guardrails/src/lib/guardrails.ts:431/500/1036` | PAYLOAD (snapshots) | READ | none | diffing only |

**Distinct unsafe-key definitions in the repo: four, none shared.**
`core/src/lib/lazy/lazy-tree.ts:27` (`__proto__` only) ·
`enterprise/src/lib/update-engine.ts:59` (`Set(['__proto__','constructor','prototype'])`) ·
`core/src/lib/security/security-validator.ts:68` (`DANGEROUS_KEYS`, same three, **opt-in only**) ·
two inline `key === '__proto__'` literals at `core/src/lib/signal-tree.ts:480` and `core/src/lib/utils.ts:483`.

### C2 — Entry doors (built from code, not from docs)

Public/API surfaces through which external data reaches a tree:

1. `signalTree(initialState, config?)` → `create()` → `createSignalStore` (#1) or `lazyFeature.build` (#4–7).
2. `tree(payload)` — the callable root form → `recursiveUpdate` (#2).
3. `tree(updater)` — updater result → `recursiveUpdate`.
4. `tree.batchUpdate(payload)` → `recursiveUpdate` (core) **or** `batching()`'s replacement (#19, updater-only).
5. `tree.updateAndReport(payload)` → `recursiveUpdate`.
6. `tree.$.branch(payload)` — any nested `NodeAccessor` call form → `recursiveUpdate`.
7. `tree.$.leaf.set(v)` / `.update(fn)` — Angular `WritableSignal` API, direct.
8. **`tree.$.key = v`** — the accessor/store properties are `writable: true` (`signal-tree.ts:244`), so a plain assignment replaces the live signal. See §C5 B7.
9. `applyState(tree.$, snapshot)` (`core/authoring`) — used by devtools `DISPATCH`/`IMPORT_STATE` after a bare `JSON.parse` (`devtools-impl.ts:471` → `parseDevToolsState` → `applyExternalState` → `applyState`).
10. `persistence().load()` / `.deserialize()` / `.fromJSON()` → `JSON.parse` of `StorageAdapter.getItem` → `restoreSpecialTypes` (#12) → `updateSignals` (#13) / nodeMap walk (#13b).
11. `stored(key, default, {storage, deserialize})` → `storage.getItem` → `deserialize` (default `JSON.parse`), `markers/stored.ts:587`.
12. `form({initial, persist, storage})` → `readFromStorage` (#22).
13. `entityLoader` persistence → `JSON.parse` at `markers/entity-loader.ts:378` and `:433`.
14. `entityMap` mutation API — `upsertOne/upsertMany/updateOne/removeOne/setAll` → `createEntityNode` (#21).
15. `realtime()` adapter callbacks → `entitySignal.upsertOne(event.new)` (#58).
16. `ng-forms` `signalForm({initialValues, persistKey, storage})` → `hydrateInitialValues` → `mergeDeep` (#45/#35). **The only live caller of the O5 sink.**
17. `ng-forms` FormGroup bridge — `group.getRawValue()` / `patchValue` (#50, #51).
18. `enterprise().updateOptimized(payload)` / `.restore(snapshot)` → diff engine (#42) → update engine (#39–41).
19. `security()` — opt-in construction-time validator (#34), the only allowlist/denylist in the whole pipeline, and off by default.
20. Angular DevTools message channel (`__REDUX_DEVTOOLS_EXTENSION__.subscribe`) → `handleDevToolsMessage` → 9.

### C3 — VERDICT on H1

**H1 is PARTIALLY TRUE — and the partition it predicts does not exist.**

What H1 gets right: every *proven* defect (O1–O5, plus the three new ones
below) is a payload-derived key reaching an indexing expression. There is not
one counter-example: no TREE-provenance site has ever produced one of these
bugs, and the reason is structural — TREE keys are produced by
`Object.keys()` on an object the library itself built, so `__proto__` can only
appear there if a PAYLOAD site let it in first.

What H1 gets wrong, and this is the load-bearing part:

- **The prediction "the safe `[key] =` sites all iterate tree-derived keys" is
  false.** Sites #8, #20, #31, #53, #55 write with TREE keys and are safe; but
  sites #1, #3, #5, #6, #40 write with PAYLOAD keys and are *also* safe,
  because each grew its own guard. Provenance does not predict safety —
  *whether someone remembered to add a guard* does.
- **There is a large third class the hypothesis has no name for: CONFIG.**
  Sites #23–#30, #49, #54, #56–#57 iterate developer-authored literals. They
  are neither tree-derived nor attacker-derived. Under a strict "guard every
  PAYLOAD site" rule they are all skipped; under a strict "only trust TREE
  keys" rule they all need guards. The codebase currently guards none of them,
  and `merge-derived.ts:86` (`part in current` — an *inherited* membership
  test followed by `current[part] = {}`) is a real sink that only a
  developer-authored derived factory can reach.
- **Sites that are BOTH.** `unwrap` (#8/#9) is one function whose keys are
  TREE at the top level and PAYLOAD as soon as it recurses into a leaf's
  *value*. Same for `unwrapObjectSafely` (#10), `sanitizeState` (#17) and
  `enhanceArraysRecursively` (#46). Provenance is not a property of a call
  site; it changes with recursion depth inside a single loop. This is why #9
  was missed: everyone reading it sees "walking the tree".
- **Three distinct sink shapes, not one.** (a) plain assignment invoking the
  `Object.prototype.__proto__` setter (#35, #36, #9) — the classic; (b)
  `defineProperty`/spread *minting a real own `__proto__`* (#21, #22, #37),
  which is not pollution itself but permanently defeats every
  `hasOwnProperty`-based guard downstream — `update-engine.ts:381`'s own
  comment describes exactly this two-call bypass; (c) unguarded *reads* that
  walk into `Object.prototype` and recurse there (#13, #2), harmless today
  only because no write happens to be reachable from that branch.

So: one *mechanism* (payload key meets an index expression), but not one root
cause you can fix at one place, and no clean partition. The honest statement
is: **the defect class is "a key of unknown provenance is used as an index",
and provenance is not tracked anywhere in the codebase — not in a type, not in
a wrapper, not in a naming convention.**

### C4 — The two counts from (e)

61 rows enumerated. By key provenance:

| Class | Count | Rows |
| ----- | ----- | ---- |
| TREE | 12 | #8, #15, #18, #20, #26, #31, #32, #44, #46, #52, #53, #55 |
| CONFIG | 11 | #23, #24, #25, #27, #28, #29, #30, #49, #54, #56, #57 |
| **PAYLOAD** | **38** | all remaining rows |

Of the 38 PAYLOAD rows:

- **10 are genuinely guarded** — #1, #3, #4, #5, #6, #7, #39, #40, #41, and
  #34 (only when the consumer opts into `security()`).
- **3 carry a guard that does not actually cover the case** — #13
  (`hasOwnProperty` on the *source*, not the target, then recurses into
  `Object.prototype`), #42 (`keyValidator` never supplied by any caller),
  #37 (`defineProperty` avoids the setter but mints the own-key primitive).
- **25 have no guard at all.**

**Count 1 — "guard every site": 38 distinct sites** (or 63 if the CONFIG class
is also treated as untrusted, which is the defensible reading given #29). **25
of the 38 are unguarded today.**

**Count 2 — "one write chokepoint": 6 sites covered.** A chokepoint at "all
writes into the signal graph" covers #1, #2, #3, #19, #40, #41 — i.e. the
existing write-path guards plus `recursiveUpdate`. It covers **none** of #9,
#10, #12, #13, #17, #21, #22, #35, #36, #37, #47, #50, because those are
*snapshot / clone / serialize / hydrate-before-construction* paths that never
touch a signal.

**The decision-relevant number: a single write chokepoint closes 6 of 38
PAYLOAD sites (16%), and 1 of the 25 currently-unguarded ones (#2, which has
no known sink anyway).** Every proven defect — O5 (#35), and the three new ones
here (#9, #22, #36) — is outside a write chokepoint's reach.

For contrast, since it bears on H2: **13 of the 61 rows write into a
freshly-constructed accumulator object** (#8, #9, #10, #12, #14, #17, #24,
#27, #36, #47, #50, #53, #55) — 8 of them PAYLOAD-provenance and unguarded.
All 13 would be closed by one change (null-prototype accumulators) with no key
check at all. That is a different, larger, and cheaper 13 than the chokepoint's
6, and it is measurable independent of any architecture decision.

### C5 — Write-path × observer matrix (MEASURED)

Tree: `signalTree({ a: 1, nested: { b: 2 } })`, one enhancer at a time.
`—` = not observed. All values measured, not inferred.

| Write path | `onPathChange` | `updateAndReport` return | `PathNotifier` (bare) | `PathNotifier` (+devTools *or* timeTravel) | timeTravel history | devTools | persistence | guardrails |
| ---------- | -------------- | ------------------------ | --------------------- | ------------------------------------------ | ------------------ | -------- | ----------- | ---------- |
| `tree({a:10})` root call | ✅ `[a]` | n/a | — | ✅ `a` | ✅ +1 | ✅ | ✅ (poll) | ❌ |
| `tree(fn)` root updater | ✅ `[a]` | n/a | — | ✅ | ✅ | ✅ | ✅ (poll) | ❌ |
| `tree.batchUpdate({a:11})` | ✅ `[a]` | n/a | — | ✅ | **❌ (and the write itself is LOST — see §C7 #1)** | ✅ | ✅ (poll) | ❌ |
| `tree.updateAndReport({…})` | ✅ | ✅ `['nested.b']` | — | ✅ | **❌ (write LOST)** | ✅ | ✅ (poll) | ❌ |
| `tree.$.a.set(99)` leaf | **❌** | ❌ | — | ✅ `a` | ✅ +1 | ✅ | ✅ (poll) | ❌ |
| `tree.$.deep.x.y.update(fn)` | **❌** | ❌ | — | ✅ `deep.x.y` | ✅ | ✅ | ✅ (poll) | ❌ |
| `tree.$.nested({b:77})` branch call | **❌** | ❌ | — | ✅ `nested.b` | ✅ | ✅ | ✅ (poll) | ❌ |
| `applyState(tree.$, {…})` | **❌** | ❌ | — | ✅ `a` | ✅ | ✅ | ✅ (poll) | ❌ |
| `entityMap.upsertOne(…)` | **❌** | ❌ | ✅ `users.a` | ✅ | ✅ | ✅ | ✅ (poll) | ✅ |
| `tree({users:[…]})` on an entityMap | ❌ ret `[]` | ❌ `[]` | — | — | ❌ | ❌ | ❌ | ❌ — **the write is silently discarded** (`signal-tree.ts:429` fall-through, no diagnostic) |
| `status().setLoading()` / `.setLoaded(v)` | ❌ | ❌ | — | ✅ `st.state` | ✅ | ✅ | ✅ | ❌ |
| `form().patch({…})` / `.set()` | ❌ | ❌ | ❌ | **❌** | **❌** | **❌** | **❌** | ❌ |
| `tree.$.a = 12345` (raw property) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (poll only) | ❌ |
| `toWritableSignal(node).set(v)` | ❌ | ❌ | — | ✅ `nested.b` | ✅ | ✅ | ✅ | ❌ |

Notes on the measurements:

- **`PathNotifier` fires for exactly two things in a bare tree**: `entityMap`
  mutations (the eight `pathNotifier.notify(...)` calls in
  `core/src/lib/entity-signal.ts`) and nothing else. O8 confirmed.
- **Leaf writes only reach `PathNotifier` if devTools or timeTravel is
  attached**, because those two are the only things that call
  `interceptLeafSignals`. `@signaltree/schema` calls it too but routes the
  callback to its own dispatcher, never to the notifier. So "does a leaf write
  notify?" depends on which *unrelated* enhancer happens to be installed.
- **guardrails observes literally nothing on a plain-object tree.** Measured:
  `getStats().updateCount` is `0` after both `tree.$.a.set(99)` and
  `tree({nested:{b:42}})`. It subscribes to `PathNotifier` `'**'` and returns
  early — its own dev warning says so, and the code matches the warning.
- **`form()` is a total black hole.** `tree()` on
  `{ plain, st: status(), f: form(…), s: stored(…), users: entityMap(…) }`
  returns keys `["plain","st","s","users"]` — **`f` is absent**. After
  `f.patch({email:'z@z.z'})` the snapshot is byte-identical while
  `tree.$.f()` returns `{"email":"z@z.z"}`. Consequence: form state is invisible
  to persistence, time-travel, devtools, guardrails and audit, and no
  diagnostic fires (the `[ST2008]` warning at `utils.ts:281` lives only in
  `unwrap`'s *accessor* branch; a root-level marker takes the plain branch at
  `utils.ts:338` which skips silently).
- **`onPathChange` has zero consumers (O9 confirmed) and is the only observer
  with no polling and no monkey-patching — but it is blind to every write that
  does not go through the three root APIs**, which is the majority of the
  matrix.

### C6 — Bypass routes (h): can a consumer escape every root-level API?

**Yes, trivially, by seven distinct routes.** A single write chokepoint at the
root is not achievable without removing capability that is currently public:

1. **`tree.$.leaf.set(v)` / `.update(fn)`** — the leaf *is* an Angular
   `WritableSignal`. `core/src/index.ts` exposes `$`; leaves are handed out
   unwrapped. Measured: no `onPathChange`.
2. **`tree.$.branch(payload)`** — every nested `NodeAccessor` has the same
   call signature as the root but no `out`/`notifyPaths` plumbing
   (`makeNodeAccessor`, `signal-tree.ts:204`, calls `recursiveUpdate(store, …)`
   with no `out` argument).
3. **Raw property assignment `tree.$.a = 12345`.** Measured: succeeds, replaces
   the live signal with a plain number, no diagnostic, no notification.
   `makeNodeAccessor` deliberately defines every state key `writable: true`
   (comment at `signal-tree.ts:239` explains why: `materializeMarkers` needs
   it). The root store is a plain object literal, so its keys are writable by
   default.
4. **Captured references.** `const s = tree.$.a` before any enhancer attaches,
   then `s.set(…)` later. Measured as *still observed* (interception mutates
   the signal object in place), but capturing the *method* — `const set =
   tree.$.a.set` — escapes, and so does any write between tree construction and
   `.with(devTools())`.
5. **Marker-private signals.** `form()`'s `valuesSignal` lives in a closure and
   is never exposed as a child of the node, so `interceptLeafSignals` cannot
   reach it — its `isWritableSignal` test requires **both** `set` *and*
   `update`, and the materialized form callable has `.set`/`.patch` but no
   `.update`, so the walker recurses past it into `.valid`/`.dirty`/`.errors`
   and finds nothing writable. Measured: `notifier=[]`.
6. **`applyState()`** — exported from `@signaltree/core/authoring`, writes
   straight into leaves, and its last branch (`utils.ts:549`) will *replace* a
   node with a raw value.
7. **`enterprise().updateOptimized()`** — writes through `defineProperty` at
   `update-engine.ts:450`, entirely outside `recursiveUpdate`.

Additionally, four independent mechanisms currently monkey-patch leaf
`.set`/`.update`, and they do not coordinate:
`interceptLeafSignals` (devtools), `interceptLeafSignals` (time-travel),
`interceptLeafSignals` (schema), and `batching`'s `wrapSignalSetters`. Only
`batching` has an idempotence flag (`__batchingWrapped`). **Measured: with
`.with(devTools()).with(timeTravel())`, one `tree.$.a.set(5)` emits `PathNotifier`
events `[a, a]` — count 2.** Every `'**'` subscriber (including guardrails'
`updateCount`) double-counts.

### C7 — Duplication between the four observers (i)

There are **nine** distinct change-detection mechanisms in the repo, not four:

| Mechanism | Where | Trigger | Cost |
| --------- | ----- | ------- | ---- |
| `onPathChange` + `collectPaths`/`notifyPaths` | `core/src/lib/signal-tree.ts:617-700` | root call / `batchUpdate` / `updateAndReport` only | ~free (a `Set.size` check per write) |
| `PathNotifier` global singleton | `core/src/lib/path-notifier.ts` | `entityMap` self-notify; leaf writes iff someone installed an interceptor | microtask flush |
| `interceptLeafSignals` → notifier | devtools `devtools-impl.ts:1808`, time-travel `time-travel.ts:345` | every leaf `.set`/`.update` | monkey-patch per leaf, full-tree walk at attach |
| `interceptLeafSignals` → own dispatcher | `schema/src/lib/schema.ts:82` | same | a second full monkey-patch pass |
| `wrapSignalSetters` | `core/src/enhancers/batching/batching.ts:158` | same | a third |
| wrapped callable + `deepEqual(before, after)` | `time-travel.ts:~365-400` | root call form only | full snapshot + deep compare **per write** |
| `PathNotifier.onFlush` | `time-travel.ts:352` | once per microtask flush | full snapshot per flush |
| `JSON.stringify(tree())` polling | `serialization.ts:1160-1172` | **`setInterval`-equivalent, every 100 ms, forever** | full snapshot + full JSON stringify, 10×/s |
| `structuredClone` + `getChanges` polling | `core/src/lib/audit/audit.ts:158-162` | **`setInterval(handleChange, 100)`** | full structuredClone + shallow diff, 10×/s |

Duplication and correctness findings, all measured:

- **The two polling mechanisms both claim to prefer `tree.subscribe()` and both
  always fall back to polling.** `subscribe` is *declared* on
  `EffectsMethods<T>` (`core/src/lib/types.ts:344`) and **implemented nowhere in
  the repo.** Measured: `typeof tree.subscribe === 'undefined'` on a
  `persistence()`-enhanced tree. So the "no polling needed in production"
  comment at `serialization.ts:1146` is never true.
- **`createAuditTracker` logs phantom changes forever.** Measured: with **zero
  writes**, the log had **2 entries after 250 ms**, each
  `{"nested":{"b":2}}`. Cause: `getChanges` (`shared/src/lib/get-changes.ts`)
  is a *shallow reference* comparison, and `unwrap` builds a brand-new nested
  object on every call, so every top-level branch reports "changed" on every
  poll. It is also blind to any change deeper than one level that does not
  alter the top-level reference — which, because of the above, it can never
  distinguish.
- **`guardrails` and `devtools` both subscribe `'**'` to the same global
  notifier, but only devtools filters by tree ownership**
  (`isPathOwnedByTree`, `devtools-impl.ts:1790`). Measured: two independent
  trees, one enhanced, share one notifier; guardrails on tree A will receive
  tree B's paths verbatim, and paths carry no tree identity.
- **`signalTree()` construction mutates global notifier state.**
  `signal-tree.ts:594` calls `getPathNotifier().setBatchingEnabled(...)` on
  *every* tree creation, so a tree created with `batchUpdates: false` silently
  switches every other tree in the process to synchronous notification.
  Reproduced accidentally while writing the probes.
- **`persistence` is the only observer that sees all nine non-marker write
  paths** — precisely because it ignores every notification mechanism and
  brute-forces `JSON.stringify(tree())`. It is also the only one that observes
  the raw-property-assignment bypass (§C6 route 3).
- **timeTravel double-records.** It records once from its wrapped callable
  (`deepEqual` compare) *and* once from `PathNotifier.onFlush`. For a root call
  both fire; the `onFlush` entry is labelled `'batch'`, the other `'update'`.

### C8 — Where a comment / RFC contradicts the code

Each of these was checked by running the code.

1. **`.with(timeTravel())` silently breaks `batchUpdate`, `updateAndReport`
   and `onPathChange`.** Measured: on `signalTree({a:1}).with(timeTravel())`,
   `t.batchUpdate({a:10})` leaves `a === 1`; `t.updateAndReport({a:20})` leaves
   `a === 1` and returns `[]`; `t.onPathChange(fn)` returns a function but the
   listener never fires even for a root call that does change `a`. Cause:
   time-travel builds a *fresh* `enhancedTree` function and copies with
   `Object.assign(enhancedTree, tree)`, which does not copy non-enumerable
   properties — and `batchUpdate`/`updateAndReport`/`onPathChange` are all
   defined `enumerable: false` on the base tree. The builder's forwarders
   (`signal-tree.ts:1219`, `:1235`, `:1250`) then do `if (fn) fn.call(...)`,
   so a missing method is a **silent no-op returning `[]`**. devTools,
   batching and guardrails are unaffected (they mutate the tree in place).
2. **`batching()` changes `batchUpdate`'s signature.** Core's accepts an object;
   `batching.ts:349` replaces it with one that requires an updater *function*.
   Measured: `b.batchUpdate({a:10})` throws `TypeError: updater is not a
   function`. Nothing in either JSDoc mentions this.
3. **`.with(enterprise())` replaces `onPathChange` semantics.**
   `enterprise-enhancer.ts:134` assigns its own implementation over core's.
   Measured: after `enterprise()`, `tree({a:5})` and `updateAndReport({a:6})`
   fire **no** listener; only `updateOptimized({a:7})` does. This directly
   contradicts core's own JSDoc at `signal-tree.ts:931-934` — *"The enterprise
   version only fired for `updateOptimized()`; this one fires for every
   root-level write"* — which is true right up until you apply `enterprise()`.
4. **`onPathChange`'s "deliberate boundary" comment
   (`signal-tree.ts:936-940`) is accurate but incomplete.** It names only
   `tree.$.user.name.set('x')`. Measured, it is also blind to branch-accessor
   calls, `applyState`, every entityMap mutation, every marker API, and raw
   property assignment — six more routes.
5. **`enterprise/src/lib/diff-engine.ts:76` `keyValidator`** is documented as
   *"Optional key validator for security (e.g., to prevent prototype
   pollution)"*. It is defaulted to `undefined` (line 120) and **no caller in
   the repo ever supplies one.** The comment describes a guard that does not
   run.
6. **`core/src/lib/utils.ts:470-482`'s security note claims own-ness is "the
   load-bearing guard".** True for `applyState`, but the *same file's* `unwrap`
   (line 325) uses own-ness with **no** name check and is a live sink (row #9),
   so the file simultaneously asserts and violates its own rule.
7. **`interceptLeafSignals`' doc block claims it "centralizes that traversal"
   (`intercept-leaf-signals.ts:15`).** Measured: three separate callers each
   install their own independent wrapper with no idempotence, producing
   duplicate notifications. It centralizes the *walk*, not the *wrapping*.
8. **`serialization.ts:1146`'s "This leverages Angular's effect system - no
   polling needed in production"** — `tree.subscribe` does not exist, so the
   `try` always throws and the polling branch always runs.
9. **`signal-tree.ts:429-435`'s justification for having no diagnostic on the
   fall-through** ("the only values reaching here are materialized markers …
   which do not accept merge writes BY DESIGN") is accurate about the cause but
   the consequence is unstated and severe: measured,
   `tree.updateAndReport({users: [{id:'c'}]})` on an `entityMap` returns `[]`,
   changes nothing, and warns nothing. `tree(tree())` — the documented
   snapshot-restore pattern — therefore silently drops all entity state.
10. **`RFC 0004`'s "the bug lived in the guard, not the loop"** — not
    re-derivable. Rows #9, #35, #36 have **no guard at all**; there is nothing
    for the bug to live in. Recorded as *unsubstantiated* per the spike rules.

### C9 — H3, checked against the actual walkers

H3 asks whether RFC 0004's rejection of walker unification covers this bug
class. Answering it from the walkers rather than the RFC:

**`visitTree` (`core/src/lib/internals/visit-tree.ts`) has exactly two
callers** — `batching.ts:156` and `intercept-leaf-signals.ts:53`. Both are
*enhancer-attach* walks that monkey-patch `.set`. Neither reads nor writes
state by key.

Every other tree walk in the repo is hand-rolled. Enumerated, at least 27
distinct recursive walkers exist:

`core`: `createSignalStore`, `recursiveUpdate`, `unwrap` (accessor branch),
`unwrap` (plain branch), `unwrap` (symbol branch), `applyState`,
`materializeMarkers`, `estimateObjectSize`, `security()`'s `walk`,
`createFieldsProxy`, `createEntityNode`, entity-loader's `walk`,
`unwrapObjectSafely`, `detectCircularReferences`, `restoreSpecialTypes`,
`encodeSpecials`, `updateSignals`, `walkAlias`, `sanitizeState`, the devtools
snapshot diff, `ensurePathAndGetTarget`.
`shared`: `cloneValue`, `deepEqual`, `mergeDeep`, `getChanges`.
`enterprise`: `DiffEngine.traverse`, `applyDeepToNode`, `PathIndex.buildFromTree`.
`ng-forms`: `findFormSignals`, `enhanceArraysRecursively`,
`createAbstractControl`, `createFormGroupFromValues`, `patchFormGroupValues`,
`collectControlErrors`.
`schema`: `snapshotTreeNode`.

**Every one of the eight guards in §C1 lives in a different one of these
walkers, and no two guards are the same code.** Four distinct definitions of
"unsafe key" exist (§C1 footer) with two different denylists and one that is
opt-in.

So H3 is answerable without reference to RFC 0004: whatever RFC 0004 argued
about *value-shape* guards, the measurable fact is that **the guard for this
bug class is currently duplicated 4 ways across ~29 walkers, 2 of which share a
skeleton.** The unification question and the key-provenance question are
independent — you can unify the walk without touching key provenance
(`visitTree` does exactly that today and carries no key guard), and you can fix
key provenance without unifying the walk. Recorded as **H3 supported by the
code, but for a reason the RFC's argument does not address either way.**

### C10 — What I could NOT establish

- **Whether any *global* prototype pollution is still reachable.** Every door I
  tested (D1–D11, P1–P4, E1–E2, S1–S9, A1–A4) either is guarded or produces
  only *contained* damage (a local object's prototype, or a minted own
  `__proto__`). I could not construct a two-step chain from a contained
  primitive (#21, #22, #37) to a global sink, but I also could not prove no
  such chain exists — `mergeDeep` (#35) is a global-shaped sink that I could
  only reach through `ng-forms` `persistKey`, and I did not run the full
  ng-forms hydration end-to-end in a browser-ish environment.
- **Whether the lazy proxy tree has a `get`-trap read path that reaches a
  write.** Probe P3 was clean, but the lazy path only activates above
  `LAZY_THRESHOLD` with the `lazy()` feature injected, and I exercised only one
  shape.
- **What the demo app and `apps/*` actually use.** I restricted the scan to
  `packages/*/src` as instructed, so consumer-side entry doors are unmeasured.
- **`realtime`'s Supabase adapter end-to-end.** I read the code path
  (`supabase-realtime.ts` → `create-realtime-enhancer.ts` → `upsertOne`) but
  did not run it against a live or mocked Supabase channel, so row #58 is
  code-derived, not probe-derived.
- **Whether the double-notification in §C6 causes an observable *behavioural*
  bug** (as opposed to double-counting) in guardrails' budget rules — I
  measured the duplicate events but guardrails observed nothing at all on the
  trees I built, so the two findings could not be combined.
- **Bundle/runtime cost of any candidate fix.** Out of scope for this track and
  not measured.
- **Whether `stored()`'s traversal behaviour interacts with any of the above.**
  Deliberately left to the existing open item; `s: stored(…)` did appear
  correctly in the snapshot in my probe, which is narrower than the known
  nested-marker issue.

## Synthesis — all three tracks in

### Verified personally (not relayed from an agent)

```
timeTravel: report=[] value=0 listeners=[] subErr=none
directAssign: raw:12345 snapshot={"a":12345}
subscribe typeof=undefined
```

1. **`.with(timeTravel())` silently swallows the write.**
   `updateAndReport({count:1})` returns `[]`, `count` stays `0`, listeners never
   fire, nothing throws. That is DATA LOSS in a documented enhancer combination,
   and it means the API shipped this session is broken under a common enhancer.
2. **`tree.$.a = 12345` destroys the leaf signal**, leaving a raw number in the
   snapshot. No error, no diagnostic.
3. **`tree.subscribe()` is declared in `types.ts` and does not exist at runtime.**
   Two change-detection mechanisms poll at 100 ms because of it.

### Q1 — the security class

**H4 is dead.** A single write chokepoint covers 6 sites, closes **1 of the 25
unguarded payload sites**, and that one has no known sink. *Every proven defect
is outside its reach.* It was motivated reasoning, exactly as suspected.

**H1 is partially true and the predicted partition does not exist.** 61 sites:
12 TREE, 11 CONFIG, 38 PAYLOAD. It fails both ways — guarded sites iterate
payload keys, and an unguarded one iterates config keys. Three structural
reasons, and the second is the important one:

- CONFIG is a third provenance class the hypothesis had no name for (11 sites,
  zero guards).
- **Provenance is DYNAMIC, not static.** `unwrap` is TREE at depth 0 and PAYLOAD
  the moment it recurses into a leaf's *value*. A per-site static classification
  cannot express that, which is precisely why the newest sink was missed.
- Three distinct sink SHAPES, not one: setter-invoking assignment;
  `defineProperty`/spread *minting a real own `__proto__`* (which permanently
  defeats every downstream `hasOwnProperty` guard); and unguarded *reads* that
  recurse into `Object.prototype`.

**Guards do not converge** — four of six blocklist deployments traced needed a
second advisory; lodash is on its fifth CVE across eight years. And the canonical
lodash CVE was a READ bug, so my four fixes were write-biased.

Ranked by sites-closed per unit of risk:

| Option | Sites closed | Cost / risk |
| ------ | ------------ | ----------- |
| **Null-prototype accumulators** — every site that writes into a freshly-built object | **13** | Very low. No API change, no behaviour change; `Object.create(null)` where `{}` is built. Larger AND cheaper than the chokepoint. |
| **Invert the loop** — iterate the tree's DECLARED keys and look *up* into the payload, so payload keys never index anything | the payload-write class | Low-medium. Behaviour-preserving in principle: ST2010 already discards keys outside the initial shape. This is Redux/NgRx's actual immunity mechanism and Track A's cleanest class-closer. Needs measurement on wide payloads. |
| Guard each site | up to 25 | Proven not to converge. Rejected as a strategy, retained only as spot fixes. |
| Single write chokepoint | 1 of 25 | Rejected — does not address the class. |
| `Object.freeze(Object.prototype)` | 0 | Rejected — does not stop `obj.__proto__ = x`. |

**Not yet fixed, all reproduced:** `unwrap()` returns objects with
attacker-controlled prototypes to every snapshot consumer; `form.ts:391` mints a
real own `__proto__`; `get-changes.ts`; `mergeDeep` (live path:
`localStorage` → `JSON.parse` → ng-forms `hydrateInitialValues`); the three
`deepEqual` defects.

### Q2 — onPathChange

**Cut it.** Not because it is unused — because it is *broken*, and because the
problem is not a missing mechanism.

- It silently does nothing under `timeTravel()` (verified above).
- `.with(enterprise())` reverts it to enterprise semantics, contradicting core's
  own JSDoc.
- Core already has **nine** change-detection mechanisms, two of which poll at
  100 ms because `tree.subscribe()` was never implemented. A tenth is not the fix.
- MobX's docs call the equivalent API an anti-pattern, and its `observe` is
  shallow-only. Vue's nearest equivalent is dev-only and carries no path.
- The models worth building toward are **M0** (notify + version, consumer pulls)
  and **M5** (structural sharing; "what changed" answered by reference identity
  at 0.003 µs, versus 0.047 µs merely to BUILD one dot-path string).

The real finding underneath is not "core needs onPathChange". It is that **nine
overlapping mechanisms exist, several are broken, `form()` is invisible to all of
them, and guardrails observes nothing at all on a plain-object tree.** That is
its own RFC.

## The endpoint — what this should look like if built once, correctly

Derived from the tracks, not from what is cheap to reach from here. Migration
comes after; it is not allowed to shape the target.

### The one structural idea

Both questions have the same answer, but it is **not** the write chokepoint I
guessed. It is:

> **A node's children are a first-class indexed structure, not JS object
> properties.**

Every finding in this spike falls out of that one decision:

- **Pollution immunity is definitional.** A `Map` has no `__proto__` accessor and
  no prototype chain to walk off. Track A found CodeQL prescribes exactly this
  for the *indexing* shape, and Track C found this repo's own `path-index.ts` is
  already Map-backed and is the one walker with no sink. There is nothing to
  guard, so there is nothing to forget to guard — which is the property the
  blocklist strategy provably lacks (4 of 6 deployments needed a second
  advisory).
- **It gives change-recording a home.** The same index that resolves a child is
  the natural place to stamp "this path is dirty as of version N".
- **It kills the depth-dynamic provenance problem** that defeated H1: a payload
  key is *looked up*, never *dereferenced*, so it never matters how deep the
  recursion is or whose keys we are holding.

SignalTree has a property almost nothing else in the corpus has, and currently
does not exploit: **its shape is declared and fixed at construction.** That makes
it structurally closer to Redux — whose immunity Track A established comes from
`combineReducers` iterating the *developer's* map, so payload keys never reach a
property access — than to lodash, whose model it currently follows.

### Three invariants

**I1 — External keys resolve through a lookup, never a dereference.**
`children.get(key)` instead of `node[key]`. O(1), O(payload) not O(tree), and
pollution-immune by construction. Closes the write class *and* the read class —
which matters, because the canonical lodash CVE was a **read** bug and four of my
five fixes were write-biased.

**I2 — Accumulators built from external keys are null-prototype.**
`Object.create(null)` wherever a fresh object is built from foreign keys. Track C
counted **13 such sites**; this closes all of them, costs nothing, and changes no
behaviour. (Track A's caveat is noted and does not apply: null-prototype bases
destroy *immer's* emergent protection, and we are not immer.)

**I3 — A leaf's value is opaque data, never traversed for structure.**
This is the invariant whose absence produced the newest sink: `unwrap` is
trusted at depth 0 and untrusted the instant it recurses into a leaf's value.
Never crossing that boundary means provenance stops being depth-dependent.

Enforced by a lint rule and a conformance suite — not by review, which is what
has been failing.

### Notification: one invalidation primitive, N pull-based consumers

Track B's evidence points one way:

- **Nobody achieves a root chokepoint** (NgRx SignalStore verified leaking
  `count.set(999)` past `watchState`). Complete coverage means instrumenting the
  **leaves**.
- **The standards track chose notify-without-payload.** TC39's `Watcher.notify()`
  takes no arguments and forbids reading signals inside it; you call
  `getPending()`. Angular and Vue both already run on a global version/epoch.
- **Path strings are the expensive part.** 0.047 µs to *build* one dot-path
  string versus 0.003 µs to answer "did this change?" by reference identity —
  and the string is paid on every write in a push model, versus only when asked
  in a pull model.
- **Do not unify sync/persistence/observation.** Only CRDTs do, and they pay:
  Yjs needs a separate replay stack for undo, Automerge has no undo API at all.

So the endpoint is: **every write bumps a monotonic version and stamps its node
dirty. Nothing else happens.** No allocation, no string building, no dispatch,
no listener list — unless someone asks. Consumers pull `changedSince(version)`.

**Core owns the leaf write path at construction, and this is the key move.**
SignalTree *creates every leaf signal itself*, so it does not need Angular's
`setPostSignalSetFn` — that hook is a real capability (Track B proved it
captures a direct `tree.$.a.b.set(x)`) but it is an unannotated internal in a
single global slot, and depending on it is an avoidable bet. Owning the leaf at
creation gives the same coverage with no external dependency, **and it is
idempotent by construction** — which fixes the defect Track C found where four
separate mechanisms monkey-patch `.set` after the fact and
`.with(devTools()).with(timeTravel())` therefore emits every event twice.

Nine mechanisms collapse into one primitive plus consumers:
`updateAndReport` becomes a pull at the call site; `onPathChange` becomes
notify-then-pull; `PathNotifier`, guardrails' 100 ms poll, the audit tracker's
100 ms poll, persistence, devtools and time-travel all become consumers of the
same version stamp. `form()` — currently invisible to every one of them — becomes
visible for free, because its values are leaves like any other.

### What this endpoint explicitly does NOT include

- **No diff engine.** Track B measured after-the-fact diffing at 0.783 ms/op
  versus 0.068 for commit-scoped. This is the model already retired with
  `@signaltree/enterprise`; it should not return by another door.
- **No patch/op stream.** immer does not actually emit patches from the write
  path (it diffs at commit), valtio's ops are off by default, and MobX's docs
  call the equivalent API an anti-pattern. A raw op stream also leaks
  implementation noise — valtio emits 4 ops including a `length` write for one
  `splice`.
- **No CRDT/log-derived state.** Enormous data-model cost for capabilities not
  asked for.
- **No blocklist as the primary defence.** Retained only as belt-and-braces where
  it costs nothing.

### Honest cost of the endpoint

- **Map-backed children is the expensive change.** `tree.$.user.name()` is
  property access, so the accessor must stay property-shaped while the store
  becomes indexed — the two already diverge today (that is what
  `NODE_STORE_SYMBOL` exists for), but this widens the split and needs measuring
  against the existing depth benchmarks.
- **Pull-based reporting changes `updateAndReport`'s cost profile**, from
  paid-per-write to paid-per-question. Better for the common case, worse for a
  caller that asks after every single write.
- **I1 across 38 payload sites is a large mechanical change** touching five
  packages.
- Unmeasured: everything above. No option in this doc has bundle or runtime
  numbers yet, and Track A explicitly flagged that gap.

## SPIKE RESULT — branch `spike/indexed-node-store`

Built. The thesis holds; the measurement is inconclusive and I nearly reported
noise as a finding.

### What was built

A parallel authoritative child index — `Map<stateKey, child>` per node, attached
by a non-enumerable symbol — and `recursiveUpdate` rewritten to resolve external
keys through it (`resolveChild(node, key)`) instead of dereferencing them
(`node[key]`). Properties stay exactly as they were, so `tree.$.user.name()` and
`TreeNode<T>` are untouched: a DEVELOPER-written key is still property access, an
OUTSIDE key is now a lookup. New file: `internals/child-index.ts`.

### The thesis holds — `indexed-store.spec.ts`

`recursiveUpdate` now contains **no name check of any kind**, and all of these
are inert:

```
tree(JSON.parse('{"__proto__":{"zzP":1}}'))
tree(JSON.parse('{"b":{"__proto__":{"zzP":1}}}'))
tree(JSON.parse('{"constructor":{"prototype":{"zzP":1}}}'))
tree(JSON.parse('{"__proto__":0}')) then ({"__proto__":{"isAdmin":true}})   // mint-then-walk
```

They resolve to `undefined` because they were never keys in the Map, and fall
into the ST2010 not-in-initial-shape discard that already existed. The
mint-then-walk bypass that defeated the own-property guard has nothing to mint
into. And state legitimately named `constructor`/`prototype` still round-trips —
the thing the name-blocklist version broke.

**744/744 core tests pass. 11/11 projects green. Bundle budgets pass.**

### Cost, honestly

Integration was smaller than expected: **two** shape-mutation points needed to
keep the index in sync (marker materialization, `.derived()`).

`unwrap()` needed an internal-symbol filter, and that is a **latent bug found by
the spike, not caused by it**: `unwrap` copies own symbols into snapshots via
`getOwnPropertySymbols`, which returns NON-ENUMERABLE symbols too — so
`enumerable: false` was never sufficient to keep library metadata out of user
snapshots. Fixed with an `INTERNAL_SYMBOLS` set.

### Performance — MEASURED (superseded the inconclusive first attempt)

Harness: `scripts/benchmarks/ab-indexed-store.mjs`. All three builds imported
into ONE process with samples INTERLEAVED and arm order rotated per sample, so
process noise hits every arm equally instead of being confounded with the arm.
15 samples, medians, and a difference is only called real if it exceeds the IQR
of both arms. The first attempt ran arms in separate processes and the variance
swamped everything — those numbers were noise and are discarded.

Costs are split by how they are PAID, which is the axis that decides:

| | | base | +Map, `{}` store | +Map, null-proto |
| - | - | ---- | ---------------- | ---------------- |
| ONE-TIME | construct 1.7k leaves | 680 µs | +3.3% ~ | +10.9% ~ |
| RECURRING | deep read (15 levels) | 0.005 µs | −0.0% ~ | +0.2% ~ |
| RECURRING | shallow read | 0.005 µs | +0.4% ~ | +1.0% ~ |
| RECURRING | deep walk + read | 0.082 µs | +2.8% ~ | +2.8% |
| RECURRING | write 1 of 40 | 0.080 µs | +3.6% ~ | +3.5% ~ |
| RECURRING | write 20 of 40 | 1.78 µs | **+6.1%** | +7.5% |
| RECURRING | nested write (depth 3) | 0.34 µs | **+18.5%** | +12.8% |
| RECURRING | unwrap 512 leaves | 56 µs | **+7.6%** | **+50.2%** |
| RECURRING | retained memory | 3961 B/node | **+311 B (+7.9%)** | +660 B (+16.7%) |

**Reads are free.** Both variants are within noise on every read metric, which
matters most — reads dominate any real application.

**Null-prototype storage is rejected on measurement.** It is the more elegant
answer (it removes the construction sink structurally rather than guarding it)
and it costs **~43 percentage points of every `unwrap()`** plus 351 more bytes
per node. V8 puts null-prototype objects in dictionary mode. `unwrap` is on the
hot path of every snapshot, every persistence write and every devtools frame;
construction happens once per tree. Paying O(keys) of string comparison once
beats paying 43% forever, so the construction-time `__proto__` check stays and
is documented as load-bearing rather than defence-in-depth.

**The accepted cost of the Map index** is: reads free, +3.6% on a single-key
write (within noise), +6.1% on a wide write, +18.5% on a nested write, +7.6% on
unwrap, +311 B/node, +3.3% construct. The unwrap and memory costs are GC
pressure from one extra Map per node — removing a per-node `.filter()` I had
added recovered only ~1 point, so the rest is allocation, not code.

Whether +18.5% on nested writes is worth closing a CWE-915 class structurally is
a judgement call, not a measurement. Recorded so it is made with numbers rather
than vibes. Not yet attempted: caching the index reference to collapse
`resolveChild`'s two lookups (symbol read, then `Map.get`) into one.

### First attempt — INCONCLUSIVE, kept as a caution

Medians of 3 runs, µs/op (`zz-bench`, since deleted):

| metric | main | Map + `{}` | Map + null-proto |
| ------ | ---- | ---------- | ---------------- |
| construct 1.7k leaves | 1434 | 1279 | 1790 |
| deep read (15 levels) | 0.012 | 0.007 | 0.007 |
| deep walk + read (15) | 0.050 | 0.036 | 0.048 |
| write 1 of 40 | 0.227 | 0.269 | 0.243 |
| write 20 of 40 | 2.256 | 2.346 | 2.401 |
| unwrap 512 leaves | 360 | 381 | 414 |

**Run-to-run variance swamps the effect.** Baseline `deepWalk` alone ranged
0.042–0.091 across three runs; construct ranged 1188–1664. On single runs I had
computed "+47% deepWalk" and "+37% write" and was about to report them — they
were noise, and that is the same mistake pattern this session has already made
twice. Nothing here is a measured regression.

What is *suggestive* but not established: the null-prototype store may cost on
construct and unwrap (its ranges sit above baseline on both), consistent with
V8 putting null-prototype objects in dictionary mode. The **Map index alone
shows no detectable cost at all**.

Next measurement, before any decision rests on this: a real harness (fixed
iteration budget, interleaved A/B in one process where possible, ≥10 samples,
report medians and IQR) against the existing depth benchmarks — not this.

### WHERE the cost comes from — attribution, measured

The obvious question about "+12.7% on nested writes" is *why*, and I had only
guessed ("GC pressure"). A third build settles it: **the Map is allocated and
attached, but `recursiveUpdate` still resolves by property access.** That splits
the cost into ALLOCATION (one extra Map per node) versus LOOKUP (symbol read +
`Map.get` instead of a property read).

| metric | alloc-only | alloc + lookup | attributable to LOOKUP |
| ------ | ---------- | -------------- | ---------------------- |
| construct 1.7k leaves | +11.5% | +11.7% | ~0 |
| deep read (15) | +0.2% ~ | +1.0% ~ | ~0 |
| shallow read | +1.0% ~ | +0.3% ~ | ~0 |
| deep walk + read | +4.3% | +4.5% | ~0 |
| write 1 of 40 | +4.0% | +3.5% | ~0 |
| write 20 of 40 | +4.3% | **+9.1%** | **~4.8 pp** |
| nested write (depth 3) | +7.5% | **+12.7%** | **~5.2 pp** |
| unwrap 512 leaves | +6.9% | +7.0% | ~0 |
| retained memory | +310 B/node | +308 B/node | 0 |

**Roughly two thirds of the cost is one extra Map object per node, and one third
is the lookup — with the lookup showing up ONLY on multi-key and nested writes**,
in proportion to how many keys get resolved.

That is why `unwrap` is affected at all despite never calling `resolveChild`: it
is not resolution, it is 73 extra Map objects per tree (+310 B/node) making the
heap bigger and GC more expensive. `deep walk + read` is the same story — pure
property access, slowed only by heap shape.

**Which points straight at the optimisation: make the Map LAZY.** Build it on
first external-key resolution rather than at construction, from `Object.keys` of
the store, so it stays authoritative. A tree that is only ever read — very
common — allocates nothing, and construct / read / unwrap / memory all return to
baseline. Only the write path would pay, which is the path that gets the safety.
Not built; it is the obvious next step and would remove most of the measured
cost.

### Competitive position — vs `@ngrx/signals` SignalStore 21.1.1

The microbenchmarks above time a write in ISOLATION. Applications write and then
read. Measured on the full cycle — update one deeply nested field, then read it
through N subscribers — against the actual competitor, same reactive substrate,
same operation (`scripts/benchmarks/ab-signalstore-cycle.mjs`):

| subscribers | SignalStore | SignalTree base | SignalTree indexed |
| ----------- | ----------- | --------------- | ------------------ |
| 1 | 0.969 µs | 0.374 µs (**2.59x**) | 0.374 µs (**2.59x**) |
| 10 | 3.360 µs | 0.730 µs (**4.60x**) | 0.736 µs (**4.57x**) |
| 100 | 25.293 µs | 3.885 µs (**6.51x**) | 4.200 µs (**6.02x**) |

**The indexed store does not move the competitive position.** Its cost on the
full cycle is −0.0% / +0.8% / +8.1% — the write is a minority of the work, so
the isolated +12.7% dilutes to near nothing. SignalTree leads SignalStore by
2.6x–6.5x with or without it, and the lead WIDENS with subscriber count because
SignalTree writes one leaf while `patchState` rebuilds the object down the path
and invalidates the deep-signal chain above it.

(Classic `@ngrx/store` was measured too and is a different animal: a bare
reducer + memoised selectors is ~8-14x faster on this operation because it does
far less — it allocates a new object and defers everything else. It is not the
competitor and not a like-for-like comparison; recorded only so nobody
rediscovers it and mistakes it for a regression.)

### RISK of not doing this

- **The class stays open.** 38 payload-key sites, 25 unguarded. Three sinks
  found by Track C are still live: `unwrap()` hands attacker-controlled
  prototypes to every snapshot consumer; `form.ts:391` mints a real own
  `__proto__` via `{...initial, ...JSON.parse(stored)}`; `get-changes.ts`
  returns an object with an attacker-supplied prototype. `mergeDeep` has a live
  path — `localStorage` → `JSON.parse` → ng-forms `hydrateInitialValues`.
- **Guards demonstrably do not converge.** Four of six blocklist deployments
  traced needed a second advisory; lodash has shipped five pollution CVEs across
  eight years, the newest in April 2026. This session is its own evidence: four
  audit rounds, each finding a sink the previous round missed, **including one I
  introduced while fixing another**.
- **The failure mode is invisible to review.** Provenance changes with recursion
  depth inside a single loop, so "is this key trusted?" has no answer a reviewer
  can check at a glance.
- **A name blocklist has a live behavioural cost**: the version that shipped
  briefly this session silently DELETED legitimate state named `constructor` or
  `prototype` on lazy trees, and made eager and lazy trees disagree.

### GAIN

- **The update path needs no name check at all.** `__proto__`, `constructor` and
  `prototype` are not keys in the index, so they resolve to `undefined` and fall
  into the ST2010 discard that already existed. Nothing to forget.
- **No behaviour change**, because discarding unknown keys is already the
  semantics. Legitimate state named `constructor`/`prototype` works again.
- **The two-call mint-then-walk bypass has nothing to mint into** — the class of
  bug that defeated the own-property guard is structurally unreachable.
- **Provenance stops being depth-dependent**, removing the property that made
  this class invisible to four rounds of review.
- **It gives change-recording a home** — the same index is where a version stamp
  would live, which is the other half of the endpoint.
- **It found a latent bug**: `unwrap` copied non-enumerable internal symbols into
  user snapshots, so `enumerable: false` was never sufficient.
- **Competitive position unaffected**, as measured above.

### What the spike does NOT yet cover

`applyState`, the lazy proxy, `mergeDeep`, `diff-engine` and the ~34 other
payload sites still resolve by dereference; only `recursiveUpdate` was converted.
The version-stamp / notify-and-pull half of the endpoint (Q2) is not built at
all. Both are deliberate — the point was to test the load-bearing risk first.

## Options considered

_pending — to be filled once A/B/C land, with each option weighed on:
correctness, blast radius, bundle cost, runtime cost, API surface added,
migration burden, and whether it closes the bug CLASS or just instances._

## Decision

_pending_
