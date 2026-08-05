import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

/**
 * updateOptimized() applies patches by walking the tree and, where a position
 * is not backed by a signal, assigning into it directly. Both the walk and the
 * assignment used ordinary bracket access, which treats `__proto__` as the
 * prototype accessor rather than as data.
 *
 * That is reachable from untrusted input: `JSON.parse` creates a real OWN
 * `__proto__` key, so any server or user payload fed to `updateOptimized()`
 * could reach it. These tests fail against pre-13.5.0 @signaltree/enterprise.
 */
describe('updateOptimized — prototype pollution', () => {
  const probeKeys = ['polluted', 'isAdmin', 'toStringTag'];

  afterEach(() => {
    // Never let a leaked property survive into another test file.
    for (const key of probeKeys) {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  });

  const assertClean = () => {
    for (const key of probeKeys) {
      expect(({} as Record<string, unknown>)[key]).toBeUndefined();
      expect(
        Object.prototype.hasOwnProperty.call(Object.prototype, key)
      ).toBe(false);
    }
  };

  it('does not pollute via a __proto__ key in a JSON payload', () => {
    const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

    // Exactly what a compromised or malicious API response looks like.
    const payload = JSON.parse(
      '{"config":{"__proto__":{"polluted":"yes","isAdmin":true}}}'
    );
    tree.updateOptimized(payload);

    assertClean();
  });

  it('does not pollute via a top-level __proto__ key', () => {
    const tree = signalTree({ a: 1 }).with(enterprise());

    const payload = JSON.parse('{"__proto__":{"polluted":"yes"}}');
    tree.updateOptimized(payload);

    assertClean();
  });

  it('does not pollute via constructor.prototype', () => {
    const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

    const payload = JSON.parse(
      '{"config":{"constructor":{"prototype":{"polluted":"yes"}}}}'
    );
    tree.updateOptimized(payload);

    assertClean();
  });

  it('does not pollute when the payload is built without JSON.parse', () => {
    const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

    const inner: Record<string, unknown> = {};
    Object.defineProperty(inner, '__proto__', {
      value: { toStringTag: 'owned' },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    tree.updateOptimized({ config: inner } as never);

    assertClean();
  });

  it('still applies the legitimate keys alongside a hostile one', () => {
    const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

    const payload = JSON.parse(
      '{"config":{"theme":"light","__proto__":{"polluted":"yes"}}}'
    );
    tree.updateOptimized(payload);

    // Rejecting the hostile segment must not become a reason to drop the
    // caller's real data.
    expect(tree.$.config.theme()).toBe('light');
    assertClean();
  });
});
