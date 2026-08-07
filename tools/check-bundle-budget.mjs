#!/usr/bin/env node
/**
 * Bundle-budget gate. Re-measures SignalTree's own gzip cost and fails on a
 * regression.
 *
 * TWO BUDGETS PER TARGET, and the split is the point.
 *
 *   - `prodKB`  — built with `ngDevMode: false`, which is what a production
 *     Angular app actually ships. THIS is the number that guards users.
 *   - `devKB`   — the default build, dev diagnostics and all. A loose ceiling
 *     that catches a genuinely leaked module, not a tightrope.
 *
 * Before 14.0.0 there was one budget, measured on the DEV build. It moved five
 * times in two releases — 5.8 → 6.9 → 7.1 → 7.2 → 7.3 for the bare tree — and
 * every single bump comment says some version of "entirely dev-only text,
 * production is unchanged". The gate was fighting the project's own policy of
 * making silent failures loud: every new ST-code diagnostic is a string, every
 * string costs gzip, and the ritual response was to raise the number and write
 * a paragraph explaining why it did not matter.
 *
 * A number that gets raised whenever it fires is not a budget. Splitting it
 * puts the tight constraint where the cost is real (production) and lets dev
 * text grow, which is the trade this codebase deliberately makes.
 *
 * Budgets are gzip KB, own-code only (@angular/rxjs/tslib external). Bump them
 * deliberately in a commit if a real feature justifies it — never silently. A
 * PROD bump needs a genuine justification; a DEV bump usually means a new
 * diagnostic and can just say so.
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CORE = new URL('../dist/packages/core/dist/index.js', import.meta.url)
  .pathname;
const REPO_NODE_MODULES = new URL('../node_modules', import.meta.url).pathname;

/**
 * This gate measures BUILT OUTPUT (`dist/`), not source — and for a long time
 * it never checked whether that output matched the source it was run against.
 * It could not fail on a stale `dist`; it measured whatever was lying there.
 *
 * Not hypothetical. `npm run build` was itself broken (it resolved to a project
 * with no build target and exited 1), so nothing rebuilt `dist`, so this gate
 * reported a green number from an artifact several commits old through an
 * entire release-hardening session. Two bugs, each survivable alone: the dead
 * script let the artifact go stale, and the missing freshness check made the
 * staleness invisible. Every budget "verification" in between was measuring
 * code nobody had written yet.
 *
 * So the gate builds for itself now rather than trusting what it finds. Nx
 * caches, so a fresh tree costs a cache hit; an unbuilt one costs a build,
 * which is the correct price for a number that claims to describe the code.
 *
 * Timestamps were tried first and rejected: an Nx cache RESTORE writes correct
 * output without bumping mtimes, so "source newer than dist" reports a stale
 * build that is not stale. A check with false alarms gets disabled, which
 * leaves you back here.
 */
const BUILD_PROJECTS = 'core,shared,ng-forms,guardrails,events,realtime,schema';

function ensureBuilt() {
  try {
    execSync(`npx nx run-many -t build --projects=${BUILD_PROJECTS}`, {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: 'pipe',
    });
  } catch (err) {
    console.error(
      `\n❌ Could not build the packages this gate measures.\n` +
        `   It reads dist/, so it refuses to report a number rather than\n` +
        `   report one for whatever happens to be there.\n\n` +
        String(err.stdout ?? err.message).slice(-1500)
    );
    process.exit(1);
  }
  try {
    statSync(CORE);
  } catch {
    console.error(`\n❌ Build reported success but ${CORE} is missing.\n`);
    process.exit(1);
  }
}

ensureBuilt();

// id -> { code, budgetKB }
const TARGETS = {
  'signaltree-bare': {
    // Bumped 5.8 → 6.9 for 13.5.0. Measured 6.81KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.    //
    // Bumped 6.9 → 7.1 for 14.0.0: the ST2020 (duplicate stored() key) and
    // ST2021 (marker inside an array) diagnostic messages. Measured 6.99KB.
    // Entirely dev-only text — production is 5.46 / 8.04 / 7.42KB, unchanged
    // by these two beyond the O(1) non-enumerable defineProperty that closes
    // the stored() storage leak. check-devmode-foldable confirms it folds.    //
    // Bumped 7.1 → 7.2 for the marker snapshot/hydrate registry. Measured 7.04KB;
    // production 5.53KB (dev code still folds fully — check-devmode-foldable
    // confirms ~1.5-1.9KB reclaimed per tree).
    //
    // What it bought: `form()` and `asyncSource()` values reach snapshots at
    // all — before this, `persistence()` wrote `{}` for a form and reported
    // success. The cost is the snapshot/hydrate hooks on status, form and
    // entityMap plus the O(1) processor stamp; it REPLACED two hardcoded
    // duck-type tests, so part of the growth is offset.    //
    // Bumped 7.2 → 7.3 for the async-marker snapshot hooks and ST2022.
    // Measured 7.12KB; production 5.59KB.
    //
    // What it bought: `asyncSource`/`asyncQuery`/`asyncStream` values reach
    // snapshots at all — before this `tree()` dropped them entirely, the same
    // defect `form()` had — plus ST2022, which fires when a marker registers
    // without declaring what of it is state. That diagnostic is the guard
    // against a SEVENTH instance of this defect class, so its bytes are the
    // cheapest on this list.
    // 14.0.0: split into dev/prod. Measured dev 7.35KB, prod 5.59KB. The dev
    // figure grew ~50 bytes for ST2023's message; prod is unchanged, because
    // the guard is inline at the call site and folds.
    //
    // Bumped 5.7 → 5.8 at the 14.0.0 RC. Measured prod 5.70KB — EXACTLY the
    // budget, which passes and is the least useful state a budget can be in:
    // the next byte fails it, and the failure would be attributed to whatever
    // change happened to be next rather than to the 0.05KB the marker snapshot
    // memo added here. Raised deliberately so the number reflects a measurement
    // with headroom, not a coincidence.
    //
    // Bumped again for ST2027 (the deep-equal-copy no-op write). The diagnostic
    // hooks the LEAF COMPARATOR rather than `recursiveUpdate`, because a direct
    // `tree.$.x.set(v)` never reaches the latter — and that is the write form
    // the corrupted benchmarks used, so hooking the cheaper site would have
    // missed the case that motivated it. That needs a `path` threaded through
    // `createSignalStore` and a ternary at five leaf-creation sites. Both are
    // ngDevMode-guarded INLINE and fold; what cannot fold is the ternary's
    // existence and the extra parameter in the signature. Measured: prod
    // +0.07KB, dev +0.30KB.
    devKB: 8.1,
    prodKB: 5.9,
    code: `
      import { signalTree } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, user: { name: 'a' } });
      t.$.count.set(1); t.$.user.name.set('b');
      globalThis.__sink = [t.$.count(), t.$.user.name()];
    `,
  },
  'signaltree-entities': {
    // Bumped 8.6 → 9.9 for 11.4.1: the 11.4.0 entityMap cache-aware fold
    // (load/staleTime/persist/tags, RFC 0003) raised the measured floor to
    // 9.67KB and shipped that way — the gate was not updated with the
    // feature. Measured breakdown (11.5.0): entity-loader.js is ~3.5KB
    // minified (~1.1KB gzip) of that.
    //
    // Lowered 9.9 → 8.6 for 12.0.0 (RFC 0005 §6): the reclaim landed. v12
    // removed the raw `load: fn` path and entity-map.ts's static `attachLoader`
    // import, so the loader/cache/SWR/persist machinery is reached ONLY through
    // the `loader()` helper. A plain `entityMap()` (measured here) now
    // tree-shakes it out entirely — measured 8.36KB gzip, down from 9.89KB in
    // the 11.6 dual-path interim (~1.53KB reclaimed). Cache-aware collections
    // pay for the machinery via `loader()`; plain collections do not. This
    // budget locks the win in — a regression back toward 9.9 means something
    // re-introduced a static reference to the loader machinery on the plain path.
    //
    // Bumped 8.6 → 8.7 for 13.4.0: the traversal diagnostics (ST2008-ST2011)
    // added in that release live in recursiveUpdate/unwrap/applyState — paths
    // EVERY tree reaches, so they cannot tree-shake for a consumer who never
    // triggers them. Measured 8.66KB; +0.06KB of guarded message strings, not
    // a leaked optional module. Defining `ngDevMode: false` removes them
    // entirely (see docs/performance/dropping-dev-code.md, which measures
    // ~1.15KB reclaimed for this scenario). Deliberate, not a regression.
    //
    // Bumped 8.7 → 9.8 for 13.5.0. Measured 9.71KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.    //
    // Bumped 9.8 → 10.0 for 14.0.0: the ST2020 (duplicate stored() key) and
    // ST2021 (marker inside an array) diagnostic messages. Measured 9.89KB.
    // Entirely dev-only text — production is 5.46 / 8.04 / 7.42KB, unchanged
    // by these two beyond the O(1) non-enumerable defineProperty that closes
    // the stored() storage leak. check-devmode-foldable confirms it folds.    //
    // Bumped 10.0 → 10.2 for the marker snapshot/hydrate registry. Measured 10.05KB;
    // production 8.16KB (dev code still folds fully — check-devmode-foldable
    // confirms ~1.5-1.9KB reclaimed per tree).
    //
    // What it bought: `form()` and `asyncSource()` values reach snapshots at
    // all — before this, `persistence()` wrote `{}` for a form and reported
    // success. The cost is the snapshot/hydrate hooks on status, form and
    // entityMap plus the O(1) processor stamp; it REPLACED two hardcoded
    // duck-type tests, so part of the growth is offset.    //
    // Bumped 10.2 → 10.4 for the async-marker snapshot hooks and ST2022.
    // Measured 10.30KB; production 8.24KB.
    //
    // What it bought: `asyncSource`/`asyncQuery`/`asyncStream` values reach
    // snapshots at all — before this `tree()` dropped them entirely, the same
    // defect `form()` had — plus ST2022, which fires when a marker registers
    // without declaring what of it is state. That diagnostic is the guard
    // against a SEVENTH instance of this defect class, so its bytes are the
    // cheapest on this list.
    // 14.0.0: split into dev/prod. Measured dev 10.50KB, prod 8.25KB.
    //
    // Bumped 8.4 → 8.7 at the 14.0.0 RC. Measured prod 8.57KB, and the overage
    // was ATTRIBUTED before raising rather than after: rebuilding at 1b79fd26
    // (before the two 14.0.0 perf fixes) gives 8.48KB, so 0.08KB of it predates
    // them and the budget had been quietly red for earlier RC work. The
    // remaining 0.09KB is the weak `byId()` node cache (WeakRef +
    // FinalizationRegistry) and the marker snapshot memo.
    //
    // What those 90 bytes bought, both measured: reading `byId()` across a 10k
    // collection went from 4,149 to 844 B/entity, 39.6MB to 8.05MB
    // (docs/architecture/memory-profile.md), and a marker's snapshot wrapper
    // stopped being re-allocated on every UNRELATED write, which is what makes
    // `computed(() => tree().rows)` stable for an OnPush consumer. On the axis
    // that matters for a phone this is 90 bytes of download against 31MB of
    // heap — see docs/architecture/size-structure-review.md for why retained
    // heap is weighted above gzip here.
    //
    // Bumped 8.7 → 9.3 prod / 11.2 → 11.8 dev for the 14.0.0 RC. Measured 9.13
    // and 11.56. Attributed: prepend (which re-orders the storage map rather
    // than rebuilding every per-entity signal), active-entity tracking
    // (activeId/activeEntity/setActiveId/clearActiveId), changeId, and the
    // ST2026 predicate-churn diagnostic. Prod and dev grew by almost the same
    // amount — 0.56 against 0.53 — which confirms the diagnostic is folding:
    // its ~500 characters of message text are absent from the prod figure, and
    // `check-devmode-foldable` passes.
    //
    // What it bought: three capabilities the audit found in elf and Akita and
    // not here, and a diagnostic for a 75x cost (0.27ms hoisted against 20.54ms
    // inline over 1,000 entities) that is otherwise symptomless — the cache is
    // weak, so nothing leaks and nothing breaks; the app is just slow forever.
    // Bumped for ST2027 — see the attribution on `signaltree-bare`. Measured
    // prod +0.07KB, dev +0.30KB from threading the leaf path for the
    // diagnostic's message.
    //
    // ⚠️ RE-BASELINED for 14.0.0, and read the reason before trusting anything
    // above. Until `ensureBuilt()` was added, this gate measured whatever was
    // in `dist/` without checking it matched the source — and `npm run build`
    // was broken, so `dist/` was stale for an entire hardening session. Every
    // number attributed above was computed that way. They are recorded as
    // written, not silently corrected, because a fabricated correction would be
    // no better; treat the pre-14.0.0 attributions as indicative, not measured.
    //
    // First honest baseline, both ends rebuilt from source:
    //
    //     b254edc1 (14.0.0 hardening start)   9.13 prod   11.56 dev
    //     after the hardening work            9.40 prod   12.07 dev
    //
    // +0.27 prod, +0.51 dev. `signaltree-bare` moved +0.09/+0.35 over the same
    // span, so ~0.18KB of the prod growth is entity-specific: the `where`/`find`
    // storage-scan fast path and `entityMap`'s `history` flag (RFC 0012). The
    // shared remainder is ST2027's leaf-path threading and ST2028's structural
    // clone. Dev outgrows prod roughly 2:1, which is the expected shape when
    // most of what landed is diagnostic text that folds — `ngDevMode: false`
    // reclaims it (see check-devmode-foldable).
    devKB: 12.1,
    prodKB: 9.5,
    code: `
      import { signalTree, entityMap } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, users: entityMap() });
      t.$.users.addOne({ id: 1, name: 'a' }); t.$.users.updateOne(1, { name: 'b' });
      globalThis.__sink = t.$.users.all();
    `,
  },
  'signaltree-form': {
    // v13 (RFC 0007): the form() marker WITHOUT history(). The history engine
    // (snapshot buffer + undo/redo) is an injected feature carried only by the
    // history() helper's closure, so a plain form() tree-shakes it out —
    // measured 7.46KB gzip. A regression toward 8.2KB means a static reference
    // to the history engine leaked onto the plain form() path. The
    // forbidden-identifier assertion in scripts/verify-tree-shaking.js is the
    // companion structural check.
    //
    // Bumped 7.8 → 7.9 for 13.4.0: same cause as signaltree-entities — the
    // ST2008-ST2011 traversal diagnostics sit on paths every tree reaches.
    // Measured 7.86KB. Not a history-engine leak; the forbidden-identifier
    // check in scripts/verify-tree-shaking.js still guards that.
    //
    // Bumped 7.9 → 9.0 for 13.5.0. Measured 8.90KB. Attributed, minified bytes in
    // the bare bundle: signal-tree.js +2137 (the ST2018 entity-array
    // diagnostic, the compared() marker interception, and the materializeNode
    // wiring), shared/deep-equal.js +538 (the Error / primitive-wrapper /
    // prototype-gate correctness fixes — a leaf holding an Error used to
    // compare equal to any other Error), utils.js +241 (the per-node
    // materialisation memo), markers/compared.js +113.
    //
    // NOT a tree-shaking regression: compared.js contributes 113 bytes because
    // only its type guard survives, and the rest tree-shakes. Roughly 0.7KB of
    // the gzip growth is dev-only text that folds — the same bundles built with
    // `define: { ngDevMode: false }` grow only +0.37KB, which is the real cost a
    // production app pays for materialisation memoisation.
    //
    // What it bought (measured, docs/architecture/optimisation-options.md):
    // reading the whole state with nothing changed 1400us → 0.044us, time
    // travel flat in state size (340.60ms → 0.04ms at 10k rows), and a
    // diagnostic for an idiom mistake worth ~30x.    //
    // Bumped 9.0 → 9.2 for 14.0.0: the ST2020 (duplicate stored() key) and
    // ST2021 (marker inside an array) diagnostic messages. Measured 9.08KB.
    // Entirely dev-only text — production is 5.46 / 8.04 / 7.42KB, unchanged
    // by these two beyond the O(1) non-enumerable defineProperty that closes
    // the stored() storage leak. check-devmode-foldable confirms it folds.    //
    // Bumped 9.2 → 9.4 for the marker snapshot/hydrate registry. Measured 9.22KB;
    // production 7.57KB (dev code still folds fully — check-devmode-foldable
    // confirms ~1.5-1.9KB reclaimed per tree).
    //
    // What it bought: `form()` and `asyncSource()` values reach snapshots at
    // all — before this, `persistence()` wrote `{}` for a form and reported
    // success. The cost is the snapshot/hydrate hooks on status, form and
    // entityMap plus the O(1) processor stamp; it REPLACED two hardcoded
    // duck-type tests, so part of the growth is offset.    //
    // Bumped 9.4 → 9.7 for the async-marker snapshot hooks and ST2022.
    // Measured 9.53KB; production 7.70KB.
    //
    // What it bought: `asyncSource`/`asyncQuery`/`asyncStream` values reach
    // snapshots at all — before this `tree()` dropped them entirely, the same
    // defect `form()` had — plus ST2022, which fires when a marker registers
    // without declaring what of it is state. That diagnostic is the guard
    // against a SEVENTH instance of this defect class, so its bytes are the
    // cheapest on this list.
    // 14.0.0: split into dev/prod. Measured dev 9.71KB, prod 7.70KB.
    // Bumped for ST2027 — see the attribution on `signaltree-bare`.
    devKB: 10.5,
    prodKB: 8.0,
    code: `
      import { signalTree, form } from ${JSON.stringify(CORE)};
      const t = signalTree({ p: form({ initial: { name: '', email: '' } }) });
      t.$.p.patch({ name: 'a' });
      globalThis.__sink = t.$.p();
    `,
  },
};

const EXTERNAL = ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'];
const dir = mkdtempSync(join(tmpdir(), 'st-budget-'));
let failed = false;

async function measure(entry, define) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    treeShaking: true,
    external: EXTERNAL,
    nodePaths: [REPO_NODE_MODULES],
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
    define,
  });
  return (
    gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length /
    1024
  );
}

console.log('target                   prod (ships)      dev (diagnostics)');
console.log('─'.repeat(66));

for (const [id, { code, devKB, prodKB }] of Object.entries(TARGETS)) {
  const entry = join(dir, `${id}.js`);
  writeFileSync(entry, code, 'utf8');

  const prod = await measure(entry, { ngDevMode: 'false' });
  const dev = await measure(entry, {});

  const prodOk = prod <= prodKB;
  const devOk = dev <= devKB;
  if (!prodOk || !devOk) failed = true;

  console.log(
    `${id.padEnd(22)} ` +
      `${prodOk ? '✅' : '❌'} ${prod.toFixed(2)}/${prodKB}KB   ` +
      `${devOk ? '✅' : '❌'} ${dev.toFixed(2)}/${devKB}KB`
  );
}

if (failed) {
  console.error(
    '\n❌ Bundle budget exceeded.\n\n' +
      '  PROD over  — this is what users ship, so treat it as a real regression.\n' +
      '               Find the statically-reachable optional module and make it\n' +
      '               tree-shakeable (subpath or injected feature).\n\n' +
      '  DEV over   — usually a new diagnostic string. Check it FOLDS first\n' +
      '               (`node tools/check-devmode-foldable.mjs`): the ngDevMode\n' +
      '               guard must be inline at the call site, not inside the\n' +
      '               callee, or the message ships to production. If prod is\n' +
      '               flat, raising the dev budget is the right call.\n'
  );
  process.exit(1);
}
console.log('\n✅ Bundle within budget (prod and dev).');
