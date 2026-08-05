import { signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

import { enterprise } from './enterprise-enhancer';

const probes = ['zzz3', 'zzz4', 'polluted'];
function clean() {
  for (const k of probes)
    delete (Object.prototype as Record<string, unknown>)[k];
}
function hits() {
  return probes.filter((k) =>
    Object.prototype.hasOwnProperty.call(Object.prototype, k)
  );
}

describe('zz lazy isolate', () => {
  afterEach(clean);

  it('step by step', () => {
    clean();
    const lines: string[] = [];
    const state = { a: 1 } as Record<string, unknown>;
    const tree = signalTree(state, {
      lazy: lazy(),
      useLazySignals: true,
    }).with(enterprise());
    const $ = tree.$ as unknown as Record<string, unknown>;
    lines.push(`$ typeof=${typeof $} ownKeys=${JSON.stringify(Object.getOwnPropertyNames($))}`);
    lines.push(`rawState ownKeys=${JSON.stringify(Object.getOwnPropertyNames(state))}`);

    const r1 = tree.updateOptimized(JSON.parse('{"__proto__":"x"}') as never);
    lines.push(`step1 paths=${JSON.stringify(r1.changedPaths)} hits=${JSON.stringify(hits())}`);
    lines.push(`  rawState ownKeys=${JSON.stringify(Object.getOwnPropertyNames(state))}`);
    lines.push(`  rawState.__proto__ desc=${JSON.stringify(Object.getOwnPropertyDescriptor(state, '__proto__'))}`);
    lines.push(`  hasOwn($,'__proto__')=${Object.prototype.hasOwnProperty.call($, '__proto__')}`);
    const viaGet = $['__proto__'];
    lines.push(`  $['__proto__'] typeof=${typeof viaGet} isObjectProto=${viaGet === Object.prototype}`);

    const r2 = tree.updateOptimized(JSON.parse('{"__proto__":{"zzz3":1}}') as never);
    lines.push(`step2 paths=${JSON.stringify(r2.changedPaths)} hits=${JSON.stringify(hits())}`);
    lines.push(`  Object.prototype own zzz3 desc=${JSON.stringify(Object.getOwnPropertyDescriptor(Object.prototype, 'zzz3'))}`);
    clean();
    throw new Error('ISO::\n' + lines.join('\n'));
  });

  it('single-shot lazy object payload', () => {
    clean();
    const lines: string[] = [];
    const tree = signalTree({ a: 1 } as Record<string, unknown>, {
      lazy: lazy(),
      useLazySignals: true,
    }).with(enterprise());
    const r = tree.updateOptimized(
      JSON.parse('{"__proto__":{"zzz3":1}}') as never
    );
    lines.push(`single paths=${JSON.stringify(r.changedPaths)} hits=${JSON.stringify(hits())}`);
    clean();
    // now try: does one call with BOTH shapes work? string then object requires 2 calls.
    const tree2 = signalTree({ a: 1 } as Record<string, unknown>, {
      lazy: lazy(),
      useLazySignals: true,
    }).with(enterprise());
    tree2.updateOptimized(JSON.parse('{"__proto__":1}') as never);
    const r2 = tree2.updateOptimized(
      JSON.parse('{"__proto__":{"polluted":"yes"}}') as never
    );
    lines.push(`twoshot paths=${JSON.stringify(r2.changedPaths)} hits=${JSON.stringify(hits())} probe=${({} as Record<string,unknown>)['polluted']}`);
    clean();
    throw new Error('SINGLE::\n' + lines.join('\n'));
  });
});
