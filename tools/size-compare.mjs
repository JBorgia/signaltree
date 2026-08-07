#!/usr/bin/env node
/**
 * Cross-library gzip cost for the SAME capability, measured the same way.
 *
 * ## The question this answers
 *
 * "elf is tiny" is the received wisdom, and elf's own source genuinely is. But a
 * bundle-size claim is only meaningful with the dependency boundary stated, and
 * the two libraries sit on opposite sides of the biggest one in Angular:
 *
 *   - **SignalTree** is built on Angular signals. `@angular/*` is external
 *     because every Angular app already ships it. It does not use RxJS at all.
 *   - **elf** is built on RxJS. Its store is `BehaviorSubject` + operators, and
 *     its per-entity granularity comes from `selectEntity`, an RxJS pipe.
 *
 * So "external: rxjs" is a charitable assumption that only holds for an app
 * already carrying RxJS for other reasons. A modern signals-first Angular app
 * increasingly does not, and for that app elf's RxJS dependency is a real
 * download that SignalTree does not ask for. Both numbers are reported, because
 * either alone is an argument rather than a measurement.
 *
 * ## What is NOT measured
 *
 * The capability rows are matched by intent, not certified equivalent — elf's
 * `selectEntity` returns an Observable and ours returns a signal, so a consumer
 * pays differently downstream (an `async` pipe and a subscription vs a signal
 * read). That downstream cost is real and is not in these numbers.
 *
 * Usage: node tools/size-compare.mjs [--json]
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_NODE_MODULES = join(process.cwd(), 'node_modules');
const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
const dir = mkdtempSync(join(tmpdir(), 'st-size-compare-'));

/** Capability, then one entry per library implementing it. */
const SCENARIOS = [
  {
    capability: 'Store + a few fields, read and write',
    signaltree: `
      import { signalTree } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, user: { name: 'a' } });
      t.$.count.set(1);
      globalThis.__sink = [t.$.count(), t.$.user.name()];
    `,
    elf: `
      import { createStore, withProps, select } from '@ngneat/elf';
      const store = createStore({ name: 's' }, withProps({ count: 0, name: 'a' }));
      store.update((s) => ({ ...s, count: 1 }));
      globalThis.__sink = store.pipe(select((s) => s.count));
    `,
  },
  {
    capability: 'Entity collection: CRUD + read all + read one',
    signaltree: `
      import { signalTree, entityMap } from ${JSON.stringify(CORE)};
      const t = signalTree({ count: 0, users: entityMap() });
      t.$.users.addOne({ id: 1, name: 'a' });
      t.$.users.updateOne(1, { name: 'b' });
      globalThis.__sink = [t.$.users.all(), t.$.users.byId(1)];
    `,
    elf: `
      import { createStore, withProps } from '@ngneat/elf';
      import { withEntities, addEntities, updateEntities, selectAllEntities, selectEntity } from '@ngneat/elf-entities';
      const store = createStore({ name: 's' }, withProps({ count: 0 }), withEntities());
      store.update(addEntities({ id: 1, name: 'a' }));
      store.update(updateEntities(1, { name: 'b' }));
      globalThis.__sink = [store.pipe(selectAllEntities()), store.pipe(selectEntity(1))];
    `,
  },
  {
    capability: 'Entity collection + undo/redo history',
    signaltree: `
      import { signalTree, entityMap, timeTravel } from ${JSON.stringify(CORE)};
      const t = signalTree({ users: entityMap() }).with(timeTravel({ maxHistorySize: 50 }));
      t.$.users.addOne({ id: 1, name: 'a' });
      t.undo(); t.redo();
      globalThis.__sink = [t.$.users.all(), t.canUndo(), t.canRedo()];
    `,
    elf: `
      import { createStore } from '@ngneat/elf';
      import { withEntities, addEntities, selectAllEntities } from '@ngneat/elf-entities';
      import { stateHistory } from '@ngneat/elf-state-history';
      const store = createStore({ name: 's' }, withEntities());
      const history = stateHistory(store, { maxAge: 50 });
      store.update(addEntities({ id: 1, name: 'a' }));
      history.undo(); history.redo();
      globalThis.__sink = [store.pipe(selectAllEntities()), history.hasPast, history.hasFuture];
    `,
  },
];

/**
 * `rxjsExternal: true` assumes the app already ships RxJS. That is the
 * charitable reading for elf and makes no difference to SignalTree, which does
 * not import it — which is itself the point of measuring both.
 */
async function measure(code, { rxjsExternal }) {
  const entry = join(dir, `e-${Math.abs(hash(code + rxjsExternal))}.js`);
  writeFileSync(entry, code);
  const external = ['@angular/*', 'tslib'];
  if (rxjsExternal) external.push('rxjs', 'rxjs/*');
  try {
    const out = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      treeShaking: true,
      external,
      nodePaths: [REPO_NODE_MODULES],
      write: false,
      legalComments: 'none',
      logLevel: 'silent',
      define: { ngDevMode: 'false' },
    });
    return gzipSync(Buffer.from(out.outputFiles[0].contents), { level: 9 }).length / 1024;
  } catch (err) {
    return { error: String(err.message).split('\n')[0].slice(0, 90) };
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const rows = [];
for (const s of SCENARIOS) {
  const row = { capability: s.capability };
  for (const lib of ['signaltree', 'elf']) {
    row[`${lib}_rxjsExternal`] = await measure(s[lib], { rxjsExternal: true });
    row[`${lib}_rxjsBundled`] = await measure(s[lib], { rxjsExternal: false });
  }
  rows.push(row);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const fmt = (v) => (typeof v === 'number' ? `${v.toFixed(2)} KB` : 'ERROR');

console.log('\ngzip, minified, tree-shaken, own code only (@angular + tslib external)\n');
console.log(
  '  capability'.padEnd(44) +
    'SignalTree'.padStart(12) +
    'elf'.padStart(12) +
    '  ratio'
);
console.log('  ' + '─'.repeat(76));

for (const mode of ['rxjsExternal', 'rxjsBundled']) {
  console.log(
    `\n  ${mode === 'rxjsExternal' ? 'RxJS EXTERNAL — the app already ships it (charitable to elf)' : 'RxJS BUNDLED — a signals-first app that carries it only for elf'}`
  );
  for (const r of rows) {
    const a = r[`signaltree_${mode}`];
    const b = r[`elf_${mode}`];
    const ratio =
      typeof a === 'number' && typeof b === 'number'
        ? b > a
          ? `${(b / a).toFixed(2)}x us`
          : `${(a / b).toFixed(2)}x elf`
        : '—';
    console.log(
      '  ' + r.capability.slice(0, 40).padEnd(42) + fmt(a).padStart(12) + fmt(b).padStart(12) + '  ' + ratio
    );
  }
}

console.log(
  '\n  "ratio" names whichever is LARGER, so "2.0x us" means elf is twice our size.\n' +
    '  Capability rows are matched by intent, not certified equivalent: elf\'s\n' +
    '  selectEntity returns an Observable and ours returns a signal, so the\n' +
    '  consumer pays differently downstream. That cost is not in these numbers.'
);
