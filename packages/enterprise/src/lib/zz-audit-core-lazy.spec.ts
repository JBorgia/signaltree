import { signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

const probes = ['zzzG', 'zzzH', 'zzzI', 'zzzJ', 'zzzK'];
function clean() {
  for (const k of probes)
    delete (Object.prototype as Record<string, unknown>)[k];
}
function hits() {
  return probes.filter((k) =>
    Object.prototype.hasOwnProperty.call(Object.prototype, k)
  );
}

describe('zz-audit core-only lazy sinks (no enterprise)', () => {
  afterEach(clean);

  it('sweep core write APIs on a lazy tree', () => {
    const report: string[] = [];
    const mk = () =>
      signalTree({ a: { b: 1 }, c: 2 } as Record<string, unknown>, {
        lazy: lazy(),
        useLazySignals: true,
      });

    const run = (label: string, fn: (t: ReturnType<typeof mk>) => void) => {
      clean();
      try {
        fn(mk());
        report.push(`${label}: HITS=${JSON.stringify(hits())}`);
      } catch (e) {
        report.push(
          `${label}: THREW ${String(e).slice(0, 160)} HITS=${JSON.stringify(hits())}`
        );
      }
      clean();
    };

    run('call-form top', (t) =>
      (t as unknown as (u: unknown) => void)(
        JSON.parse('{"__proto__":{"zzzG":1}}')
      )
    );
    run('call-form nested', (t) =>
      (t as unknown as (u: unknown) => void)(
        JSON.parse('{"a":{"__proto__":{"zzzH":1}}}')
      )
    );
    run('updateAndReport', (t) =>
      (
        t as unknown as { updateAndReport: (u: unknown) => unknown }
      ).updateAndReport(JSON.parse('{"a":{"__proto__":{"zzzI":1}}}'))
    );
    run('two-step call-form', (t) => {
      const f = t as unknown as (u: unknown) => void;
      f(JSON.parse('{"__proto__":0}'));
      f(JSON.parse('{"__proto__":{"zzzJ":1}}'));
    });
    run('constructor.prototype', (t) =>
      (t as unknown as (u: unknown) => void)(
        JSON.parse('{"a":{"constructor":{"prototype":{"zzzK":1}}}}')
      )
    );

    throw new Error('CORELAZYSWEEP::\n' + report.join('\n'));
  });
});
