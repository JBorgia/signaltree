import { entityMap, signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

import { enterprise } from './enterprise-enhancer';

const probes = ['polluted', 'zzz1', 'zzz2', 'zzz3', 'zzz4'];
function clean() {
  for (const k of probes) {
    delete (Object.prototype as Record<string, unknown>)[k];
    delete (Array.prototype as unknown as Record<string, unknown>)[k];
    delete (Function.prototype as unknown as Record<string, unknown>)[k];
  }
}
function hits(): string[] {
  const h: string[] = [];
  for (const k of probes) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, k))
      h.push(`Object.prototype.${k}`);
    if (Object.prototype.hasOwnProperty.call(Array.prototype, k))
      h.push(`Array.prototype.${k}`);
    if (Object.prototype.hasOwnProperty.call(Function.prototype, k))
      h.push(`Function.prototype.${k}`);
  }
  return h;
}

describe('zz-audit round2', () => {
  afterEach(clean);

  it('lazy tree vectors', () => {
    const report: string[] = [];
    const run = (label: string, mk: () => unknown, json: string) => {
      clean();
      try {
        const tree = mk() as {
          updateOptimized: (u: unknown) => { changedPaths: string[] };
        };
        const r = tree.updateOptimized(JSON.parse(json));
        report.push(
          `${label}: paths=${JSON.stringify(r.changedPaths)} HITS=${JSON.stringify(
            hits()
          )}`
        );
      } catch (e) {
        report.push(`${label}: THREW ${String(e)} HITS=${JSON.stringify(hits())}`);
      }
      clean();
    };
    const mkLazy = (s: Record<string, unknown>) => () =>
      signalTree(s, { lazy: lazy(), useLazySignals: true }).with(enterprise());

    run('L0 lazy legit nested', mkLazy({ a: { b: 1 } }), '{"a":{"b":2}}');
    run('L1 lazy top __proto__', mkLazy({ a: 1 }), '{"__proto__":{"zzz1":1}}');
    run(
      'L2 lazy nested __proto__',
      mkLazy({ a: { b: 1 } }),
      '{"a":{"__proto__":{"zzz1":1}}}'
    );
    run(
      'L3 lazy constructor.prototype',
      mkLazy({ a: { b: 1 } }),
      '{"a":{"constructor":{"prototype":{"zzz2":1}}}}'
    );
    throw new Error('LAZY::\n' + report.join('\n'));
  });

  it('lazy two-step __proto__ own-key seeding', () => {
    clean();
    const lines: string[] = [];
    try {
      const tree = signalTree(
        { a: 1 } as Record<string, unknown>,
        { lazy: lazy(), useLazySignals: true }
      ).with(enterprise());
      const r1 = tree.updateOptimized(JSON.parse('{"__proto__":"x"}') as never);
      lines.push(`step1 paths=${JSON.stringify(r1.changedPaths)}`);
      const r2 = tree.updateOptimized(
        JSON.parse('{"__proto__":{"zzz3":1}}') as never
      );
      lines.push(`step2 paths=${JSON.stringify(r2.changedPaths)}`);
      const r3 = tree.updateOptimized(
        JSON.parse('{"__proto__":{"zzz3":{"zzz4":2}}}') as never
      );
      lines.push(`step3 paths=${JSON.stringify(r3.changedPaths)}`);
      lines.push(`HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('THREW ' + String(e) + ' HITS=' + JSON.stringify(hits()));
    }
    clean();
    throw new Error('LAZY2STEP::\n' + lines.join('\n'));
  });

  it('marker node shapes + entityMap own-ness', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; n: number }>([{ id: '1', n: 1 }]),
    }).with(enterprise());
    const node = (tree.$ as unknown as Record<string, unknown>)['users'];
    const lines = [
      `typeof=${typeof node}`,
      `ownKeys=${JSON.stringify(Object.getOwnPropertyNames(node as object))}`,
      `enumKeys=${JSON.stringify(Object.keys(node as object))}`,
      `protoIsObjectProto=${
        Object.getPrototypeOf(node as object) === Object.prototype
      }`,
      `protoOwnKeys=${JSON.stringify(
        Object.getOwnPropertyNames(Object.getPrototypeOf(node as object) ?? {})
      ).slice(0, 300)}`,
    ];
    throw new Error('MARKER::\n' + lines.join('\n'));
  });

  it('core update path (updateAuto fallthrough) pollution', () => {
    clean();
    const lines: string[] = [];
    try {
      const tree = signalTree({ a: 1 } as Record<string, unknown>).with(
        enterprise()
      );
      tree.updateAuto(JSON.parse('{"__proto__":{"zzz1":1}}'));
      lines.push(`updateAuto HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('updateAuto THREW ' + String(e));
    }
    clean();
    try {
      const t2 = signalTree({ a: { b: 1 } } as Record<string, unknown>);
      (t2 as unknown as (u: unknown) => void)(
        JSON.parse('{"a":{"__proto__":{"zzz2":1}}}')
      );
      lines.push(`core call HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('core call THREW ' + String(e));
    }
    clean();
    try {
      const t3 = signalTree({ a: { b: 1 } } as Record<string, unknown>);
      (t3 as unknown as { updateAndReport: (u: unknown) => string[] }).updateAndReport(
        JSON.parse('{"a":{"__proto__":{"zzz3":1}}}')
      );
      lines.push(`updateAndReport HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('updateAndReport THREW ' + String(e));
    }
    clean();
    throw new Error('CORE::\n' + lines.join('\n'));
  });

  it('batch + threshold + restore variants', () => {
    clean();
    const lines: string[] = [];
    try {
      const t = signalTree({ a: { b: 1 } } as Record<string, unknown>).with(
        enterprise({ autoOptimizeThreshold: 1 })
      );
      t.updateAuto(JSON.parse('{"a":{"__proto__":{"zzz1":1}}}'));
      lines.push(`threshold HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('threshold THREW ' + String(e));
    }
    clean();
    try {
      const t = signalTree({ a: { b: 1 } } as Record<string, unknown>).with(
        enterprise()
      );
      t.updateOptimized(JSON.parse('{"a":{"__proto__":{"zzz2":1}}}') as never, {
        batch: true,
        batchSize: 1,
      } as never);
      lines.push(`batch HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('batch THREW ' + String(e));
    }
    clean();
    try {
      const t = signalTree({ a: { b: 1 } } as Record<string, unknown>).with(
        enterprise()
      );
      const snap = JSON.parse('{"a":{"__proto__":{"zzz3":1}},"b":2}');
      t.restore(snap);
      lines.push(`restore HITS=${JSON.stringify(hits())}`);
    } catch (e) {
      lines.push('restore THREW ' + String(e));
    }
    clean();
    throw new Error('VARIANTS::\n' + lines.join('\n'));
  });
});
