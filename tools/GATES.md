# Gates: the policy

**The gate work is done. Do not add gates. Fix one only when it goes red.**

This file exists because gate maintenance became the work. In the 14.0.0
hardening session, 48 commits split 18 product / 19 docs / **11 gate-and-tooling**
— nearly a quarter of the effort spent on the machinery rather than the library.

## What they are worth, measured

Over that session:

- **Caught by a gate going red: 1.** The numeric-claims ratchet flagging
  ungenerated figures in a brand-new SSR guide, within an hour of them being
  written.
- **Caught by someone asking a question while every gate was green: at least 6.**
  ST2029 never firing in real-app order; `dist/` measured stale for an entire
  session; two gates unable to fail at all; a benchmark result that was pure
  JIT-ordering artifact; a new public option reaching zero surfaces; a lint
  claim confounded by its own fixture's name.

That ratio is the point. **Gates are not how defects are found here.** Questions
are. Gates stop a known defect from returning — which is worth having, and is a
much smaller claim than a green board suggests.

The specific harm to watch for is **false confidence**: three times that session
the board was green while the thing it claimed to check was not being checked.
A green board that means less than it appears to is worse than no board, because
it suppresses the questioning that actually works.

## The rule for adding one

A gate must be able to name **the user it protects**. If it cannot, it is
overhead — and overhead in a checking system is worse than overhead elsewhere,
because it dilutes every other green tick.

Applied honestly, that test splits this suite:

| tier            | question it answers                                                                                                                                          | when        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **ship** (27)   | would a consumer be hurt? missing export, bundle regression, dev code in production, tarball that will not install, docs teaching an API that does not exist | every run   |
| **release** (7) | do the measurement harnesses still produce numbers?                                                                                                          | `--release` |

The seven release-tier gates verify that _benchmarks run_. No consumer is harmed
when `bench-compare.mjs` breaks; the harm is that a published figure becomes
unregenerable, which matters before a release and not before a commit.

## Running them

```bash
node tools/verify-gates.mjs              # ship tier
node tools/verify-gates.mjs --release    # + measurement harnesses, before publishing
node tools/verify-gates.mjs --self-test  # prove each gate can fail — pre-release, not per-change
```

## Known blind spots, stated rather than discovered

- `check-release-claims.mjs` does not compare members of types that became
  exported **this** release — for a new type every member is trivially new, and
  enumerating them would bury the report. It now prints which types are in that
  state. This is how `SerializationConfig.transfer` reached zero surfaces with
  the gate green.
- `check-numeric-claims.mjs` matches ASCII `x` ratios, not U+00D7 `×`, skips
  fenced code, and exempts a whole line when it names a competitor. Its backlog
  is **ratcheted, not clean**: 69 published figures still name no generator.
- `check-numeric-claims.mjs` sees performance figures, not provenance. It looks
  for KB / ms / % / ratios, so a sourcing claim like "40,000+ developer surveys"
  or "10,000+ GitHub repositories" is not a figure to it. Its `SURFACES` list
  also omits `docs/performance/**` and `apps/demo/README.md`. Both gaps were
  found together: a fabricated research bibliography sat on six surfaces,
  including the npm-facing `packages/core/README.md`, and the backlog read 69
  before its removal and 69 after. Deliberately not widened — see the policy
  above; a detector for invented citations is a different gate, and the thing
  that actually caught this was reading the doc.
- `verify-gates.mjs` counts any non-zero exit as "caught it", so a mutation that
  breaks the BUILD proves the build runs, not the thing the gate covers. Prefer
  a mutation that fails the gate's actual comparison.

A gate that cannot see something has to say so. Otherwise its green is read as a
stronger claim than it is — which is the failure this whole file is about.
