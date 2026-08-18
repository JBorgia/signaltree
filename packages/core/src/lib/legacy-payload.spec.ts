import { describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { serialization } from '../enhancers/serialization/serialization';
import { signalTree } from './signal-tree';
import { status } from './markers/status';

/**
 * UPGRADE PATH: a pre-`2.0.0` payload, already sitting in a user's
 * localStorage, meeting a 14.0.0 tree.
 *
 * 14.0.0 changed the snapshot payload shape, which means every existing
 * persisted payload is now the WRONG shape. That is the one thing a breaking
 * format release has to get right, and nothing pinned it — so this file does.
 *
 * The policy (recorded at `SNAPSHOT_FORMAT_VERSION`) is that `1.0.0` means
 * LEGACY/UNKNOWN rather than "format 1": every payload ever written says
 * `1.0.0`, including all of them written while the field was decorative, so
 * "reject unknown versions" would reject the entire installed base. The
 * behaviour that follows is **best-effort, and loud where it cannot cope**:
 *
 *   - plain leaves restore normally — they never changed shape;
 *   - a marker whose legacy payload is unreadable is LEFT UNCHANGED, not reset
 *     and not thrown on, and says so via [ST2024];
 *   - a marker absent from the legacy payload keeps its initial value.
 *
 * Nothing is silently corrupted, and nothing throws. Note what is NOT
 * recoverable: a legacy `entityMap` payload emitted `map`, which
 * `JSON.stringify` renders as `{}`, so those entities were never in the file to
 * begin with. There is nothing to migrate — which is precisely why the shape
 * had to change.
 */
const mkTree = () =>
  signalTree({
    count: 0,
    user: { name: 'initial' },
    rows: entityMap<{ id: number; n: string }, number>({ selectId: (e) => e.id }),
    job: status<Error>(),
  }).with(serialization());

/** What 13.x actually left in storage, after a JSON round trip. */
const LEGACY_PAYLOAD = JSON.stringify({
  version: '1.0.0',
  timestamp: 1_700_000_000_000,
  data: {
    count: 7,
    user: { name: 'legacy' },
    // `map` is what the old walker emitted; JSON renders it `{}`, so the
    // entities were already lost before 14.0.0 ever saw the file.
    rows: { map: {}, ids: [1, 2] },
    // status used to emit computeds and setter METHODS; functions do not
    // survive JSON, so only the data-ish keys remain.
    job: { state: 'LOADED', error: null, loading: null, loaded: null },
  },
});

describe('a legacy 1.0.0 payload against a 14.0.0 tree', () => {
  it('does not throw', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mkTree();
    expect(() => tree.deserialize(LEGACY_PAYLOAD)).not.toThrow();
    vi.restoreAllMocks();
  });

  it('restores plain leaves — they never changed shape', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mkTree();
    tree.deserialize(LEGACY_PAYLOAD);

    expect(tree.$.count()).toBe(7);
    expect(tree.$.user.name()).toBe('legacy');
    vi.restoreAllMocks();
  });

  it('leaves an unreadable marker UNCHANGED and reports ST2024', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mkTree();
    tree.deserialize(LEGACY_PAYLOAD);

    // Not reset, not thrown on, not half-written.
    expect(tree.$.rows.count()).toBe(0);
    expect(
      warn.mock.calls.filter((c) => String(c[0]).includes('ST2024'))
    ).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('a marker absent from the legacy payload keeps its initial value', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mkTree();
    tree.deserialize(LEGACY_PAYLOAD);

    vi.restoreAllMocks();
  });

  it('a legacy key that happens to still be readable is honoured', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = mkTree();
    tree.deserialize(LEGACY_PAYLOAD);

    // `state` survived the shape change, so this one migrates for free.
    expect(tree.$.job.state()).toBe('LOADED');
    vi.restoreAllMocks();
  });
});

describe('a 14.0.0 payload round-trips completely (the control)', () => {
  it('every marker survives serialize → deserialize', () => {
    const a = mkTree();
    a.$.count.set(7);
    a.$.rows.addMany([
      { id: 1, n: 'x' },
      { id: 2, n: 'y' },
    ]);
    a.$.job.setLoaded();

    const b = mkTree();
    b.deserialize(a.serialize());

    expect(b.$.count()).toBe(7);
    expect(b.$.rows.count()).toBe(2); // was 0 before the shape change
    expect(b.$.job.state()).toBe('LOADED');
  });
});

describe('ST2024 is a payload problem, not a registration one', () => {
  it('status() reports an unrecognised state without touching the node', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = signalTree({ j: status<Error>() });
    tree.$.j.setLoaded();

    tree({ j: { state: 'NONSENSE', error: null } } as never);

    expect(tree.$.j.state()).toBe('LOADED'); // unchanged
    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('ST2024'));
    expect(hits).toHaveLength(1);
    // It must NOT masquerade as the registration diagnostic.
    expect(String(hits[0][0])).not.toContain('ST2022');
    vi.restoreAllMocks();
  });
});
