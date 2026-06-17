#!/usr/bin/env node
/**
 * Measure the marginal bundle cost of each state library by bundling a minimal
 * but idiomatic usage with esbuild (production minify), then gzipping.
 *
 * Fairness contract:
 *  - `@angular/*`, `rxjs`, and `tslib` are EXTERNAL — they are ambient peers in
 *    any Angular app using these libraries, so they are not "added" by the
 *    library. This isolates each library's OWN contributed code.
 *  - Every entry exercises a representative surface (store/tree + CRUD + a
 *    derived value) so tree-shaking keeps a realistic slice, not just the
 *    cheapest import.
 *
 * Output: artifacts/bundle-sizes.json  → { id: { gzipKB, minKB } }
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdtempSync, writeFileSync as wf } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CORE = new URL('../dist/packages/core/dist/index.js', import.meta.url)
  .pathname;
const ENT = new URL('../dist/packages/enterprise/dist/index.js', import.meta.url)
  .pathname;

const ENTRIES = {
  'raw-signals': `
    import { signal, computed } from '@angular/core';
    const count = signal(0); const items = signal([]);
    const doubled = computed(() => count() * 2);
    const active = computed(() => items().filter((x) => x.active).length);
    count.set(1); items.update((a) => [...a, { id: 1, active: true }]);
    globalThis.__sink = [doubled(), active()];
  `,
  signaltree: `
    import { signalTree, entityMap } from ${JSON.stringify(CORE)};
    import { computed } from '@angular/core';
    const tree = signalTree({ count: 0, users: entityMap() });
    tree.$.users.addOne({ id: 1, name: 'a' });
    tree.$.users.updateOne(1, { name: 'b' });
    const c = computed(() => tree.$.count() * 2);
    tree.$.count.set(1);
    globalThis.__sink = [c(), tree.$.users.all()];
  `,
  'signaltree-enterprise': `
    import { signalTree, entityMap } from ${JSON.stringify(CORE)};
    import { enterprise } from ${JSON.stringify(ENT)};
    const tree = signalTree({ count: 0, users: entityMap() }).with(enterprise());
    tree.$.users.addOne({ id: 1, name: 'a' });
    globalThis.__sink = tree.$.users.all();
  `,
  'ngrx-store': `
    import { createAction, createReducer, on, props, createSelector, createFeatureSelector, provideStore, Store } from '@ngrx/store';
    const inc = createAction('[c] inc');
    const setU = createAction('[u] set', props());
    const r = createReducer({ count: 0, users: [] }, on(inc, (s) => ({ ...s, count: s.count + 1 })), on(setU, (s, { users }) => ({ ...s, users })));
    const f = createFeatureSelector('app');
    const sel = createSelector(f, (s) => s.users.filter((u) => u.active).length);
    // provideStore + Store pull the runtime an app actually ships.
    globalThis.__sink = [r({ count: 0, users: [] }, inc()), sel, provideStore({ app: r }), Store];
  `,
  'ngrx-signals': `
    import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
    import { withEntities, setEntity, updateEntity, removeEntity } from '@ngrx/signals/entities';
    import { computed } from '@angular/core';
    const Store = signalStore({ protectedState: false }, withState({ count: 0 }),
      withEntities(),
      withComputed((s) => ({ doubled: computed(() => s.count() * 2) })),
      withMethods((store) => ({ inc: () => patchState(store, (s) => ({ count: s.count + 1 })) })));
    globalThis.__sink = [Store, setEntity, updateEntity, removeEntity];
  `,
  ngxs: `
    import { State, Action, Selector, Store, Select, provideStore } from '@ngxs/store';
    class Inc { static type = '[c] inc'; }
    class S { static ctx(ctx) { ctx.patchState({ count: 1 }); } }
    // provideStore pulls the NGXS runtime an app actually ships.
    globalThis.__sink = [State, Action, Selector, Store, Select, provideStore([S]), Inc];
  `,
  akita: `
    import { Store, Query, EntityStore, QueryEntity, StoreConfig } from '@datorama/akita';
    class AppStore extends EntityStore { constructor() { super({}); } }
    class AppQuery extends QueryEntity { }
    const s = new AppStore(); const q = new AppQuery(s);
    s.add({ id: 1, name: 'a' }); s.update(1, { name: 'b' });
    globalThis.__sink = [q.selectAll(), Store, Query, StoreConfig];
  `,
  elf: `
    import { createStore, withProps, select, setProp } from '@ngneat/elf';
    import { withEntities, setEntities, updateEntities, selectAllEntities } from '@ngneat/elf-entities';
    const store = createStore({ name: 'app' }, withProps({ count: 0 }), withEntities());
    globalThis.__sink = [store, select, setProp, setEntities, updateEntities, selectAllEntities];
  `,
};

const EXTERNAL = ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'];
const REPO_NODE_MODULES = new URL('../node_modules', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'st-bundle-'));
const results = {};

for (const [id, code] of Object.entries(ENTRIES)) {
  const entry = join(dir, `${id}.js`);
  wf(entry, code, 'utf8');
  try {
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
    });
    const js = out.outputFiles[0].contents;
    const gz = gzipSync(Buffer.from(js), { level: 9 });
    results[id] = {
      gzipKB: +(gz.length / 1024).toFixed(2),
      minKB: +(js.length / 1024).toFixed(2),
    };
    console.log(
      `${id.padEnd(22)} min=${results[id].minKB
        .toString()
        .padStart(7)}KB  gzip=${results[id].gzipKB.toString().padStart(6)}KB`
    );
  } catch (e) {
    results[id] = { gzipKB: null, minKB: null, error: String(e.message || e) };
    console.warn(`${id.padEnd(22)} FAILED: ${e.message || e}`);
  }
}

const outPath = new URL('../artifacts/bundle-sizes.json', import.meta.url)
  .pathname;
writeFileSync(
  outPath,
  JSON.stringify(
    { measuredAt: process.env.MEASURED_AT || null, external: EXTERNAL, results },
    null,
    2
  )
);
console.log(`\nWritten ${outPath}`);
