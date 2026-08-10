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

## Three gates were added after this policy, and why

`doc-links`, `api-surface` and `error-codes` (each with its `:self` proof) landed
after the "do not add gates" line above. The exceptions are recorded rather than
quietly taken, and each one met the bar at the bottom of this section.

The policy exists to stop gate work becoming its own project. It was never meant
to protect a class of defect that is actively shipping — and these three are the
measured cause of the recurrence this repo has been paying for. 74 commits over
twelve months fix a doc that had gone stale or was never true; the same files
recur (`packages/core/README.md` 8x, `llms-full.txt` 7x, `llms.txt` 4x,
`docs/errors/README.md` 6x, the SKILL 4x). Five hand-written surfaces describe
the API in ~43,000 words with 97 symbols described independently in 3+ of them,
and nothing generated any of it.

What each one found before it existed:

- `doc-links` — 28 broken relative links, five in files that ship in the npm
  tarballs, one pointing at a package deleted in the same release, one claiming a
  file "already exists in this repo" under a gitignored directory.
- `api-surface` — six `/authoring` exports documented on no surface at all; a
  SKILL that said "25 symbols MOVED there" and enumerated roughly fifteen; a
  README promising a deprecation removal three majors after it had happened.
- `error-codes` — ST1031 and ST1032 emittable at runtime and documented nowhere.

**The bar for any future gate**, which these met and a speculative gate will not:
it found real defects before it was written, it cost about one file, and it
proves it can fail. If a proposal cannot say all three, do not add it.

### The limit of all of them

Every gate here checks a property that is mechanically decidable — a symbol
exists, a path resolves, a figure names its generator, a code is catalogued.
**None can check whether a sentence is still true.** Myth 9 in
`docs/myths-and-misconceptions.md` contradicted itself for five versions with
every gate green: it said `rxMethod` was removed in 9.6.0 and then, three lines
later, showed how to import it.

So do not read a green board as "the docs are correct". It means the decidable
subset is correct. The remaining exposure is the ~43,000 words of hand-written
prose, and the only real fix for that is fewer independent copies of the same
claim — which is what `api-surface` starts and does not finish.

## The first gate added after this policy, and why

`doc-links` (plus its `:self` proof) landed after the "do not add gates" line
above. The exception is recorded rather than quietly taken.

The class had already gone red — manually. 28 relative links were broken, 22
outside `docs/archive/`, and five sat in files that ship inside the npm
tarballs, where a README is immutable for the life of a published version. One
pointed at `packages/enterprise/README.md`, deleted in the same release. Another
claimed a file "already exists in this repo" at a path under `.claude/`, which is
gitignored and therefore could never hold it.

The policy exists to stop gate work becoming its own project, not to protect a
class of defect that is actively shipping. The test it should be held to: it
found real bugs before it was written, it cost one file, and it proves it can
fail. If a proposed gate cannot say all three, it should not be added.

## Known blind spots, stated rather than discovered

- `check-release-claims.mjs` does not compare members of types that became
  exported **this** release — for a new type every member is trivially new, and
  enumerating them would bury the report. It now prints which types are in that
  state. This is how `SerializationConfig.transfer` reached zero surfaces with
  the gate green.
- `check-numeric-claims.mjs` matches ASCII `x` ratios, not U+00D7 `×`, and skips
  fenced code. Its backlog is now **zero** — every measured figure on every live
  surface names a generator, or carries a `<!-- measured: -->` marker saying why
  none can exist. A new unbacked figure fails immediately; there is no backlog
  left to hide in. Paying the last 69 off found four figures that were simply
  wrong, which is the argument against grandfathering: a number nothing can
  re-derive is a number nothing can catch.
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
