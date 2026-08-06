import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { stored } from './stored';

/**
 * A `stored()` marker must never carry its storage into a snapshot.
 *
 * `options` holds the caller's `storage` object. `unwrap` deep-copies a raw
 * marker by enumerating own keys, so an enumerable `options` carried the
 * CONTENTS of that storage into `tree()` — and from there into
 * `serialization()`, `persistence()`, devtools payloads and audit logs:
 *
 *   {"list":[{"key":"k","options":{"storage":{"auth-token":"SECRET-JWT"}}}]}
 *
 * 13.4.0 closed the top-level and nested-object escape routes; a marker inside
 * an ARRAY still escaped, because array elements are never traversed. Rather
 * than chase every traversal, `options` is now non-enumerable, so the payload is
 * invisible to enumeration on ALL paths — including any not yet discovered.
 */
describe('stored() never leaks its storage into a snapshot', () => {
  const secretStorage = () =>
    ({
      'auth-token': 'SECRET-JWT-abc123',
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage);

  const leaks = (snapshot: unknown) =>
    JSON.stringify(snapshot)?.includes('SECRET-JWT') ?? false;

  it('stays out of a top-level snapshot', () => {
    const tree = signalTree({
      theme: stored('lk1', 'dark', { storage: secretStorage() }),
    });
    void tree.$;
    expect(leaks(tree())).toBe(false);
  });

  it('stays out when nested under an object', () => {
    const tree = signalTree({
      settings: { theme: stored('lk2', 'dark', { storage: secretStorage() }) },
    });
    void tree.$;
    expect(leaks(tree())).toBe(false);
  });

  it('stays out when the marker sits inside an ARRAY', () => {
    // The path 13.4.0 missed: array elements are never traversed, so the raw
    // marker survives into the snapshot. Non-enumerable options make that safe.
    const tree = signalTree({
      list: [stored('lk3', 'dark', { storage: secretStorage() })],
    });
    void tree.$;
    expect(leaks(tree())).toBe(false);
  });

  it('stays out when the marker sits inside a Map', () => {
    const tree = signalTree({
      m: new Map([['a', stored('lk4', 'dark', { storage: secretStorage() })]]),
    });
    void tree.$;
    expect(leaks(tree())).toBe(false);
  });

  it('survives an explicit deep copy', () => {
    // persistence() and audit logs clone snapshots; the guarantee has to hold
    // through a copy, not only through the direct JSON path.
    const marker = stored('lk5', 'dark', { storage: secretStorage() });
    expect(leaks({ ...(marker as object) })).toBe(false);
    expect(Object.keys(marker as object)).not.toContain('options');
  });

  it('still gives createStoredSignal its options', () => {
    // Non-enumerable must not mean unreadable — direct access still works.
    const store = secretStorage();
    const marker = stored('lk6', 'dark', { storage: store });
    expect(
      (marker as unknown as { options: { storage: Storage } }).options.storage
    ).toBe(store);
  });
});

describe('ST2020 — duplicate stored() keys', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const msgs = () => warn.mock.calls.map((c) => String(c[0]));

  it('warns when the same key is used twice', () => {
    stored('dup-key-a', 1);
    stored('dup-key-a', 2);
    expect(msgs().filter((m) => m.includes('ST2020'))).toHaveLength(1);
  });

  it('warns only once per key however many duplicates', () => {
    stored('dup-key-b', 1);
    for (let i = 0; i < 10; i++) stored('dup-key-b', i);
    expect(msgs().filter((m) => m.includes('ST2020'))).toHaveLength(1);
  });

  it('stays silent for distinct keys', () => {
    stored('uniq-1', 1);
    stored('uniq-2', 2);
    expect(msgs().some((m) => m.includes('ST2020'))).toBe(false);
  });
});
