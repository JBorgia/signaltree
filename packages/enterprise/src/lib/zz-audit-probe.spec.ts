import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

/** Throwaway audit probe — introspection only. */
describe('zz-audit probe', () => {
  it('reports tree shape', () => {
    const tree = signalTree({ config: { theme: 'dark' }, n: 1 }).with(
      enterprise()
    );
    const $ = tree.$ as unknown as Record<string, unknown>;
    const cfg = $['config'] as unknown as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`typeof $=${typeof $}`);
    lines.push(`ownKeys($)=${JSON.stringify(Object.getOwnPropertyNames($))}`);
    lines.push(`hasOwn($, 'config')=${Object.prototype.hasOwnProperty.call($, 'config')}`);
    lines.push(`typeof cfg=${typeof cfg}`);
    lines.push(`ownKeys(cfg)=${JSON.stringify(Object.getOwnPropertyNames(cfg))}`);
    lines.push(`hasOwn(cfg,'theme')=${Object.prototype.hasOwnProperty.call(cfg, 'theme')}`);
    lines.push(`hasOwn($, 'prototype')=${Object.prototype.hasOwnProperty.call($, 'prototype')}`);
    lines.push(`hasOwn(cfg,'prototype')=${Object.prototype.hasOwnProperty.call(cfg, 'prototype')}`);
    lines.push(`protoOf($)===Function.prototype: ${Object.getPrototypeOf($) === Function.prototype}`);
    throw new Error('PROBE::' + lines.join(' | '));
  });
});
