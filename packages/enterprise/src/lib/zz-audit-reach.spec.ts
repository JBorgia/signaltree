import { signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

import { enterprise } from './enterprise-enhancer';

const probes = ['zzzD', 'zzzE', 'zzzF'];
function clean() {
  for (const k of probes)
    delete (Object.prototype as Record<string, unknown>)[k];
}

describe('zz-audit reachability', () => {
  afterEach(clean);

  it('auto-lazy (>50 nodes, no useLazySignals flag) is pollutable', () => {
    clean();
    const state: Record<string, unknown> = {};
    for (let i = 0; i < 80; i++) state['k' + i] = i;
    const tree = signalTree(state, { lazy: lazy() }).with(enterprise());
    tree.updateOptimized(JSON.parse('{"__proto__":0}') as never);
    tree.updateOptimized(JSON.parse('{"__proto__":{"zzzD":"pwn"}}') as never);
    const leaked = ({} as Record<string, unknown>)['zzzD'];
    clean();
    expect(leaked).toBeUndefined();
  });

  it('CORE ONLY (no enterprise): lazy node exposes a live proxy over Object.prototype', () => {
    clean();
    const tree = signalTree({ a: 1 } as Record<string, unknown>, {
      lazy: lazy(),
      useLazySignals: true,
    });
    const $ = tree.$ as unknown as Record<string, unknown>;
    const p = $['__proto__'] as Record<string, unknown>;
    const info: string[] = [`typeof=${typeof p}`];
    // write through the proxy's set trap
    try {
      p['zzzE'] = 'pwn';
    } catch (e) {
      info.push('setThrew ' + String(e));
    }
    info.push(`afterSet ({}).zzzE=${({} as Record<string, unknown>)['zzzE']}`);
    try {
      Object.defineProperty(p, 'zzzF', {
        value: 'pwn2',
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      info.push('dpThrew ' + String(e));
    }
    info.push(`afterDp ({}).zzzF=${({} as Record<string, unknown>)['zzzF']}`);
    clean();
    throw new Error('CORELAZY::\n' + info.join('\n'));
  });
});
