/**
 * Dev-code foldability gate.
 *
 * Every dev-only diagnostic in core sits behind `ngDevMode`:
 *
 *     if (typeof ngDevMode === 'undefined' || ngDevMode) { console.warn('[ST20xx] …') }
 *
 * `ngDevMode` is a runtime global Angular assigns — NOT a compile-time constant a
 * bundler substitutes on its own — so by default that condition is unresolvable,
 * the branch survives minification, and every guardrail message string ships to
 * production. Measured: the `[ST20xx]` prose plus the DEV_MESSAGES table cost
 * ~0.5KB gzip in a bare tree.
 *
 * Consumers CAN reclaim it, because the guard shape folds the moment `ngDevMode`
 * is a known constant:
 *
 *     Angular (@angular/build application builder):  "define": { "ngDevMode": "false" }
 *     Vite / esbuild:                                define: { ngDevMode: 'false' }
 *     webpack:                                       new DefinePlugin({ ngDevMode: false })
 *
 * This gate exists so that stays TRUE. It builds each budget target twice — once
 * plain, once with `ngDevMode` defined false — and asserts:
 *
 *   1. the defined build is smaller (folding actually happens), and
 *   2. no DEV-WARNING diagnostic survives in the defined build.
 *
 * (2) is deliberately narrow, and the distinction matters. Two different things
 * carry `[ST####]` codes:
 *
 *   - **Thrown errors** (`ST1xxx`, plus `ST2004`/`ST2005`/`ST2006`) SHOULD ship to
 *     production. An exception with no message is useless in a stack trace, which
 *     is why `constants.ts` sets `PROD_MESSAGES = DEV_MESSAGES` and keeps each
 *     string under ~25 chars. These surviving is correct, not a leak.
 *   - **Dev-mode warnings** (`ST2001`/`ST2002`/`ST2003`/`ST2007`) are advisory only
 *     and must disappear. They exist to catch mistakes at author time.
 *
 * So this gate asserts only that the WARN set folds away. A future contributor
 * writing a gate the bundler cannot fold — `if (isDev())`, a helper call, anything
 * that isn't a bare `ngDevMode` comparison — leaves advisory prose in production
 * and fails here.
 *
 * Keep WARN_ONLY_CODES in sync when adding an ST2xxx: warning → add it; throw →
 * don't.
 *
 * NOT a size budget: tools/check-bundle-budget.mjs owns absolute ceilings. This
 * one owns the *shape* of the dev gates.
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const CORE = new URL('../dist/packages/core/dist/index.js', import.meta.url)
  .pathname;
const REPO_NODE_MODULES = new URL('../node_modules', import.meta.url).pathname;
const EXTERNAL = ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'];

/** Same entry shapes as the budget gate — bare / entities / form. */
const TARGETS = {
  'signaltree-bare': `
    import { signalTree } from ${JSON.stringify(CORE)};
    const t = signalTree({ count: 0, user: { name: 'a' } });
    t.$.count.set(1); t.$.user.name.set('b');
    globalThis.__sink = [t.$.count(), t.$.user.name()];
  `,
  'signaltree-entities': `
    import { signalTree, entityMap } from ${JSON.stringify(CORE)};
    const t = signalTree({ count: 0, users: entityMap() });
    t.$.users.addOne({ id: 1, name: 'a' });
    globalThis.__sink = t.$.users.all();
  `,
  'signaltree-form': `
    import { signalTree, form } from ${JSON.stringify(CORE)};
    const t = signalTree({ p: form({ initial: { name: '', email: '' } }) });
    t.$.p.patch({ name: 'a' });
    globalThis.__sink = t.$.p();
  `,
};

const dir = mkdtempSync(join(tmpdir(), 'st-foldable-'));

async function measure(id, code, define) {
  const entry = join(dir, `${id}${define ? '-prod' : ''}.js`);
  writeFileSync(entry, code, 'utf8');
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
    ...(define ? { define: { ngDevMode: 'false' } } : {}),
  });
  const text = Buffer.from(out.outputFiles[0].contents).toString('utf8');
  return { gzipKB: gzipSync(Buffer.from(text), { level: 9 }).length / 1024, text };
}

/**
 * Advisory-only codes: emitted via console.warn behind an ngDevMode gate, so they
 * must fold away. Thrown-error codes (ST1xxx, ST2004-ST2006) are intentionally
 * retained in production and are NOT listed here.
 */
const WARN_ONLY_CODES = ['ST2001', 'ST2002', 'ST2003', 'ST2007'];

/** Advisory literals that must NOT survive an ngDevMode=false build. */
function findDiagnostics(text) {
  return WARN_ONLY_CODES.filter((code) => text.includes(`[${code}]`));
}

/**
 * `--self-test` proves this checker can fail, by pushing two DELIBERATELY broken
 * fixtures through the very same build pipeline.
 *
 * This gate had no self-test for a while, and the reason given was that it
 * "asserts on a bundle it builds itself, so there is no input file to mutate".
 * That was true and it was also the wrong conclusion: if the tool builds its own
 * inputs, the self-test builds a BAD one. Both failure modes it claims to catch
 * are checked here —
 *
 *   1. a diagnostic literal that survives `ngDevMode: false`, and
 *   2. a bundle that does not shrink at all, which is what happens when the
 *      guards stop being statically foldable.
 *
 * A checker that cannot detect either is reported as broken.
 */
if (process.argv.includes('--self-test')) {
  console.log('Self-test — the checker must FAIL against deliberately broken fixtures\n');
  let bad = 0;

  // 1. An advisory code that cannot fold: a bare string literal survives every
  //    build, so findDiagnostics must see it.
  const survives = await measure(
    'selftest-literal',
    'globalThis.__sink = "[ST2001] planted, cannot fold";',
    true
  );
  const caughtLiteral = findDiagnostics(survives.text).includes('ST2001');
  console.log(
    `  ${caughtLiteral ? '✓' : '✗'} detects an advisory literal surviving ngDevMode=false`
  );
  if (!caughtLiteral) bad++;

  // 2. A bundle with no dev code at all does not shrink, which is the signal
  //    that the guards stopped folding.
  const inert = 'globalThis.__sink = 1;';
  const devInert = await measure('selftest-inert', inert, false);
  const prodInert = await measure('selftest-inert', inert, true);
  const caughtNoShrink = !(devInert.gzipKB - prodInert.gzipKB > 0.01);
  console.log(
    `  ${caughtNoShrink ? '✓' : '✗'} detects a bundle that does not shrink at all`
  );
  if (!caughtNoShrink) bad++;

  console.log(
    bad
      ? `\n✗ ${bad} self-test failure(s) — this checker cannot be trusted.`
      : '\n✓ Self-test passed: both failure modes are detectable.'
  );
  process.exit(bad ? 1 : 0);
}

console.log('🔍 Verifying dev-only code folds when ngDevMode is defined false\n');

let failed = false;
let totalSaved = 0;

for (const [id, code] of Object.entries(TARGETS)) {
  const dev = await measure(id, code, false);
  const prod = await measure(id, code, true);
  const saved = dev.gzipKB - prod.gzipKB;
  totalSaved += saved;

  const leftovers = findDiagnostics(prod.text);
  const shrank = saved > 0.01;
  const ok = shrank && leftovers.length === 0;
  if (!ok) failed = true;

  console.log(
    `${ok ? '✅' : '❌'} ${id.padEnd(22)} ${dev.gzipKB.toFixed(2)}KB → ` +
      `${prod.gzipKB.toFixed(2)}KB gzip (−${saved.toFixed(2)}KB)`
  );
  if (!shrank) {
    console.log(
      `   ↳ defining ngDevMode=false changed nothing — the dev gates are no ` +
        `longer statically foldable.`
    );
  }
  if (leftovers.length > 0) {
    console.log(
      `   ↳ diagnostic literals survived: ${leftovers.join(', ')} — these ship ` +
        `to production even with ngDevMode=false. Check that every guard is a ` +
        `bare \`ngDevMode\` comparison, not a function call.`
    );
  }
}

console.log(
  `\n${failed ? '❌' : '✅'} Dev code is ${failed ? 'NOT ' : ''}fully foldable` +
    ` — consumers defining ngDevMode=false reclaim ~${(totalSaved / Object.keys(TARGETS).length).toFixed(2)}KB gzip per tree.`
);

if (failed) {
  console.log(
    '\nSee docs/performance/dropping-dev-code.md for the guard shape and the ' +
      'per-bundler recipes this gate protects.'
  );
  process.exit(1);
}
