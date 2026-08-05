import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

describe('zz-audit impact', () => {
  it('A2 top-level __proto__ own prop impact', () => {
    const tree = signalTree({ a: 1 }).with(enterprise());
    const $ = tree.$ as unknown as Record<string, unknown>;
    const before = JSON.stringify(tree());
    tree.updateOptimized(JSON.parse('{"__proto__":"x"}') as never);
    const lines = [
      `hasOwn($,'__proto__')=${Object.prototype.hasOwnProperty.call(
        $,
        '__proto__'
      )}`,
      `desc=${JSON.stringify(Object.getOwnPropertyDescriptor($, '__proto__'))}`,
      `protoOf($)===Object.prototype: ${
        Object.getPrototypeOf($) === Object.prototype
      }`,
      `before=${before}`,
      `after=${JSON.stringify(tree())}`,
      `keys($)=${JSON.stringify(Object.keys($))}`,
    ];
    // second pass now that __proto__ is an own key
    let second = '';
    try {
      const r = tree.updateOptimized(
        JSON.parse('{"__proto__":{"zzzImpact":1}}') as never
      );
      second = `paths=${JSON.stringify(r.changedPaths)} pollution=${
        ({} as Record<string, unknown>)['zzzImpact']
      }`;
    } catch (e) {
      second = 'THREW ' + String(e);
    }
    lines.push('secondPass: ' + second);
    delete (Object.prototype as Record<string, unknown>)['zzzImpact'];
    throw new Error('IMPACT::\n' + lines.join('\n'));
  });

  it('A11 accessor name/length corruption impact', () => {
    const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());
    const cfg = (tree.$ as unknown as Record<string, unknown>)[
      'config'
    ] as unknown as Record<string, unknown>;
    const lines = [
      `nameBefore=${JSON.stringify((cfg as unknown as () => void).name)}`,
      `lengthBefore=${(cfg as unknown as { length: number }).length}`,
      `unwrapBefore=${JSON.stringify(tree())}`,
    ];
    tree.updateOptimized(JSON.parse('{"config":{"name":"HACKED"}}') as never);
    lines.push(`nameAfter=${JSON.stringify((cfg as unknown as () => void).name)}`);
    lines.push(
      `nameDesc=${JSON.stringify(Object.getOwnPropertyDescriptor(cfg, 'name'))}`
    );
    lines.push(`unwrapAfter=${JSON.stringify(tree())}`);
    lines.push(`entriesAfter=${JSON.stringify(Object.keys(cfg))}`);
    let callable = '';
    try {
      callable = JSON.stringify((cfg as unknown as () => unknown)());
    } catch (e) {
      callable = 'THREW ' + String(e);
    }
    lines.push(`cfg() = ${callable}`);
    lines.push(`themeStillWorks=${String(tree.$.config.theme())}`);
    throw new Error('IMPACT2::\n' + lines.join('\n'));
  });

  it('frozen object in tree + defineProperty', () => {
    const frozenLeaf = Object.freeze({ k: 1 });
    const tree = signalTree({ box: frozenLeaf as { k: number } }).with(
      enterprise()
    );
    const lines: string[] = [];
    try {
      const r = tree.updateOptimized({ box: { k: 2 } } as never);
      lines.push(
        `changed=${r.changed} paths=${JSON.stringify(r.changedPaths)}`
      );
      lines.push(`value=${JSON.stringify(tree())}`);
    } catch (e) {
      lines.push('THREW ' + String(e));
    }
    throw new Error('FROZEN::\n' + lines.join('\n'));
  });

  it('legit keys named constructor/toString/valueOf/hasOwnProperty', () => {
    const tree = signalTree({
      config: {
        constructor: 'a',
        prototype: 'b',
        toString: 'c',
        valueOf: 'd',
        hasOwnProperty: 'e',
      },
    }).with(enterprise());
    const lines: string[] = [];
    try {
      const r = tree.updateOptimized({
        config: {
          constructor: 'A',
          prototype: 'B',
          toString: 'C',
          valueOf: 'D',
          hasOwnProperty: 'E',
        },
      } as never);
      lines.push(`paths=${JSON.stringify(r.changedPaths)}`);
      lines.push(`state=${JSON.stringify(tree())}`);
    } catch (e) {
      lines.push('THREW ' + String(e));
    }
    throw new Error('LEGIT::\n' + lines.join('\n'));
  });

  it('ordinary nested update still works (regression baseline)', () => {
    const tree = signalTree({
      user: { profile: { name: 'a', age: 1 }, tags: ['x'] },
      count: 0,
    }).with(enterprise());
    const r = tree.updateOptimized({
      user: { profile: { name: 'b', age: 2 } },
      count: 5,
    } as never);
    throw new Error(
      `NESTED::paths=${JSON.stringify(r.changedPaths)} state=${JSON.stringify(
        tree()
      )}`
    );
  });
});
