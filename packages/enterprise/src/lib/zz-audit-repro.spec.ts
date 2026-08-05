import { signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

import { enterprise } from './enterprise-enhancer';

const probes = ['isAdmin', 'zzzA', 'zzzB', 'zzzC'];
function clean() {
  for (const k of probes)
    delete (Object.prototype as Record<string, unknown>)[k];
}

describe('zz-audit MINIMAL REPRO', () => {
  afterEach(clean);

  it('CONFIRMED: two untrusted payloads pollute Object.prototype on a lazy tree', () => {
    clean();
    const tree = signalTree({ user: { name: 'a' } } as Record<string, unknown>, {
      lazy: lazy(),
      useLazySignals: true,
    }).with(enterprise());

    // Payload 1 — plants a real own '__proto__' data key via defineProperty
    tree.updateOptimized(JSON.parse('{"__proto__":0}') as never);
    // Payload 2 — traversal guard now passes; lazy get-trap returns a proxy
    // over Object.prototype; defineProperty writes straight into it.
    tree.updateOptimized(JSON.parse('{"__proto__":{"isAdmin":true}}') as never);

    const leaked = ({} as Record<string, unknown>)['isAdmin'];
    const own = Object.prototype.hasOwnProperty.call(
      Object.prototype,
      'isAdmin'
    );
    clean();
    expect([leaked, own]).toEqual([undefined, false]);
  });

  it('CONFIRMED: also works at a nested node', () => {
    clean();
    const tree = signalTree(
      { a: { b: 1 } } as Record<string, unknown>,
      { lazy: lazy(), useLazySignals: true }
    ).with(enterprise());
    tree.updateOptimized(JSON.parse('{"a":{"__proto__":0}}') as never);
    tree.updateOptimized(
      JSON.parse('{"a":{"__proto__":{"zzzA":"pwn"}}}') as never
    );
    const leaked = ({} as Record<string, unknown>)['zzzA'];
    clean();
    expect(leaked).toBeUndefined();
  });

  it('CONFIRMED: reachable via restore() too', () => {
    clean();
    const tree = signalTree({ a: 1 } as Record<string, unknown>, {
      lazy: lazy(),
      useLazySignals: true,
    }).with(enterprise());
    tree.restore(JSON.parse('{"__proto__":0}'));
    tree.restore(JSON.parse('{"__proto__":{"zzzB":"pwn"}}'));
    const leaked = ({} as Record<string, unknown>)['zzzB'];
    clean();
    expect(leaked).toBeUndefined();
  });

  it('control: non-lazy tree is NOT pollutable by the same sequence', () => {
    clean();
    const tree = signalTree({ a: 1 } as Record<string, unknown>).with(
      enterprise()
    );
    tree.updateOptimized(JSON.parse('{"__proto__":0}') as never);
    tree.updateOptimized(JSON.parse('{"__proto__":{"zzzC":"pwn"}}') as never);
    const leaked = ({} as Record<string, unknown>)['zzzC'];
    clean();
    expect(leaked).toBeUndefined();
  });
});
