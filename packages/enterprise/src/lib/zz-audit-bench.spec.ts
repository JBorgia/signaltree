import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

type Obj = Record<string, unknown>;

// Build a tree with exactly `leaves` scalar leaves, 10 leaves per branch.
function makeState(leaves: number): Obj {
  const s: Obj = {};
  const branches = Math.ceil(leaves / 10);
  let made = 0;
  for (let b = 0; b < branches; b++) {
    const branch: Obj = {};
    for (let i = 0; i < 10 && made < leaves; i++, made++) {
      branch['leaf' + i] = made;
    }
    s['b' + b] = branch;
  }
  return s;
}

function mutate(state: Obj, fraction: number, salt: number): Obj {
  const out: Obj = {};
  let n = 0;
  for (const [bk, bv] of Object.entries(state)) {
    const src = bv as Obj;
    const dst: Obj = {};
    for (const [lk, lv] of Object.entries(src)) {
      dst[lk] = n % Math.round(1 / fraction) === 0 ? (lv as number) + salt : lv;
      n++;
    }
    out[bk] = dst;
  }
  return out;
}

function bench(fn: () => void, iters: number): number {
  // warm-up
  for (let i = 0; i < Math.min(20, iters); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters;
}

describe('zz-audit benchmark', () => {
  it('updateOptimized vs updateAndReport', () => {
    const rows: string[] = [];
    for (const leaves of [500, 2000]) {
      const base = makeState(leaves);

      // ---- enterprise ----
      const et = signalTree(structuredClone(base)).with(enterprise());
      let salt = 1;
      const payloadsE: Obj[] = [];
      for (let i = 0; i < 60; i++) payloadsE.push(mutate(base, 0.1, salt++));
      let idx = 0;
      const entMs = bench(() => {
        et.updateOptimized(payloadsE[idx++ % payloadsE.length] as never);
      }, 50);

      // ---- core ----
      const ct = signalTree(structuredClone(base)) as unknown as {
        updateAndReport: (u: unknown) => string[];
      };
      let j = 0;
      const coreMs = bench(() => {
        ct.updateAndReport(payloadsE[j++ % payloadsE.length]);
      }, 50);

      rows.push(
        `${leaves} leaves (10% changed): updateOptimized=${entMs.toFixed(
          4
        )}ms  updateAndReport=${coreMs.toFixed(4)}ms  ratio=${(
          entMs / coreMs
        ).toFixed(1)}x`
      );

      // ---- no-op payload (identical re-fetch, distinct object identities) ----
      const noops: Obj[] = [];
      for (let i = 0; i < 60; i++) noops.push(structuredClone(base));
      const et2 = signalTree(structuredClone(base)).with(enterprise());
      let k = 0;
      const entNo = bench(() => {
        et2.updateOptimized(noops[k++ % noops.length] as never);
      }, 50);
      const ct2 = signalTree(structuredClone(base)) as unknown as {
        updateAndReport: (u: unknown) => string[];
      };
      let m = 0;
      const coreNo = bench(() => {
        ct2.updateAndReport(noops[m++ % noops.length]);
      }, 50);
      rows.push(
        `${leaves} leaves (no-op re-fetch): updateOptimized=${entNo.toFixed(
          4
        )}ms  updateAndReport=${coreNo.toFixed(4)}ms  ratio=${(
          entNo / coreNo
        ).toFixed(1)}x`
      );

      // ---- full replacement (100% of leaves changed) ----
      const fulls: Obj[] = [];
      for (let i = 0; i < 60; i++) fulls.push(mutate(base, 1, 1000 + i));
      const et3 = signalTree(structuredClone(base)).with(enterprise());
      let p = 0;
      const entFull = bench(() => {
        et3.updateOptimized(fulls[p++ % fulls.length] as never);
      }, 50);
      const ct3 = signalTree(structuredClone(base)) as unknown as {
        updateAndReport: (u: unknown) => string[];
      };
      let q = 0;
      const coreFull = bench(() => {
        ct3.updateAndReport(fulls[q++ % fulls.length]);
      }, 50);
      rows.push(
        `${leaves} leaves (100% changed): updateOptimized=${entFull.toFixed(
          4
        )}ms  updateAndReport=${coreFull.toFixed(4)}ms  ratio=${(
          entFull / coreFull
        ).toFixed(1)}x`
      );
    }
    throw new Error('BENCH::\n' + rows.join('\n'));
  }, 120000);
});
