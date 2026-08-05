import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

describe('zz-audit migration-table equivalence', () => {
  it('snapshot() vs tree()', () => {
    const lines: string[] = [];
    const t = signalTree({ a: 1, b: { c: 2 } }).with(enterprise());
    lines.push(`snapshot=${JSON.stringify(t.snapshot())}`);
    lines.push(`tree()=${JSON.stringify(t())}`);
    // structuredClone limitation
    const t2 = signalTree({ fn: (() => 1) as unknown as number }).with(
      enterprise()
    );
    try {
      t2.snapshot();
      lines.push('snapshot(fn)=OK');
    } catch (e) {
      lines.push('snapshot(fn) THREW ' + String(e).slice(0, 80));
    }
    try {
      lines.push('tree()(fn)=' + typeof (t2() as { fn: unknown }).fn);
    } catch (e) {
      lines.push('tree()(fn) THREW ' + String(e).slice(0, 80));
    }
    throw new Error('SNAP::\n' + lines.join('\n'));
  });

  it('restore(s) vs tree(s) — deletion / divergence semantics', () => {
    const lines: string[] = [];
    // ent tree
    const ent = signalTree({
      a: 1,
      b: { c: 2, d: 3 },
      arr: [1, 2, 3],
    }).with(enterprise());
    const snap = ent.snapshot();
    ent.updateOptimized({ a: 9, b: { c: 9, d: 9 } } as never);
    ent.$.arr.set([7, 7]);
    lines.push(`ent mutated=${JSON.stringify(ent())}`);
    const rr = ent.restore(snap);
    lines.push(
      `ent restored=${JSON.stringify(ent())} paths=${JSON.stringify(
        rr.changedPaths
      )}`
    );

    // core tree
    const core = signalTree({ a: 1, b: { c: 2, d: 3 }, arr: [1, 2, 3] });
    const s = core();
    (core as unknown as (u: unknown) => void)({ a: 9, b: { c: 9, d: 9 } });
    core.$.arr.set([7, 7]);
    lines.push(`core mutated=${JSON.stringify(core())}`);
    (core as unknown as (u: unknown) => void)(s);
    lines.push(`core restored=${JSON.stringify(core())}`);
    throw new Error('RESTORE::\n' + lines.join('\n'));
  });

  it('updateAuto(p) vs tree(p)', () => {
    const lines: string[] = [];
    const noThreshold = signalTree({ a: 1, b: 2 }).with(enterprise());
    noThreshold.updateAuto({ a: 5 });
    lines.push(`noThreshold=${JSON.stringify(noThreshold())}`);

    const withThreshold = signalTree({ a: 1, b: 2, arr: [1, 2] }).with(
      enterprise({ autoOptimizeThreshold: 1 })
    );
    const ret = withThreshold.updateAuto({ a: 5, arr: [9, 9] });
    lines.push(
      `withThreshold=${JSON.stringify(withThreshold())} returned=${String(ret)}`
    );

    const core = signalTree({ a: 1, b: 2, arr: [1, 2] });
    (core as unknown as (u: unknown) => void)({ a: 5, arr: [9, 9] });
    lines.push(`core=${JSON.stringify(core())}`);
    throw new Error('AUTO::\n' + lines.join('\n'));
  });

  it('array-drop defect still present post-fix', () => {
    const t = signalTree({ users: [{ id: 1 }, { id: 2 }] }).with(enterprise());
    const r = t.updateOptimized({ users: [{ id: 9 }, { id: 2 }] } as never);
    const t2 = signalTree({ nums: [1, 2, 3] }).with(enterprise());
    const r2 = t2.updateOptimized({ nums: [1, 2, 9] } as never);
    throw new Error(
      `ARRAY::\nobjArr changed=${r.changed} paths=${JSON.stringify(
        r.changedPaths
      )} state=${JSON.stringify(t())}\n` +
        `numArr changed=${r2.changed} paths=${JSON.stringify(
          r2.changedPaths
        )} state=${JSON.stringify(t2())}`
    );
  });
});
