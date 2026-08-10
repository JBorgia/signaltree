import { TransferState, makeStateKey } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { status } from './markers/status';
import { asyncSource } from './markers/async-source';
import { signalTree } from './signal-tree';
import { serialization } from '../enhancers/serialization/serialization';

/**
 * C3 — can an Angular app move server-built state to the client TODAY?
 *
 * Not a theory about the gap: an attempt to write the recipe with what ships.
 * SSR is exactly two trees in two processes, so it is simulated honestly here —
 * a SERVER tree that is populated and serialised, and a separate CLIENT tree,
 * freshly constructed, that must come up holding the same state. Nothing is
 * shared between them but a string, which is all `TransferState` carries.
 */
type Row = { id: number; name: string };
const KEY = makeStateKey<string>('signaltree');

const makeTree = () =>
  signalTree({
    user: { name: '', role: '' },
    rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    load: status(),
    counter: 0,
  }).with(serialization());

describe('C3 — server → TransferState → client', () => {
  it('THE RECIPE: round-trips plain state across two tree instances', () => {
    const server = makeTree();
    server.$.user.name.set('Ada');
    server.$.counter.set(7);
    const ts = new TransferState();
    ts.set(KEY, server.serialize());

    const client = makeTree();
    client.deserialize(ts.get(KEY, '{}'));

    expect(client.$.user.name()).toBe('Ada');
    expect(client.$.counter()).toBe(7);
  });

  it('carries an entityMap collection across the boundary', () => {
    const server = makeTree();
    server.$.rows.setAll([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    const json = server.serialize();

    const client = makeTree();
    client.deserialize(json);

    expect(client.$.rows.all().map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('normalises an in-flight status — the rehydrate contract', () => {
    // The server may finish rendering mid-fetch. A LOADING status that crosses
    // a process boundary is a lie: nothing is in flight in the new process, and
    // believing it deadlocks every fetch guard. `rehydrate` must normalise it,
    // where `restore` (undo, same process) would keep it.
    const server = makeTree();
    server.$.load.setLoading();
    const json = server.serialize();

    const client = makeTree();
    client.deserialize(json);

    expect(client.$.load.loading()).toBe(false);
    expect(client.$.load.state()).not.toBe('LOADING');
  });

  it('the payload is a plain JSON string TransferState can hold', () => {
    const server = makeTree();
    server.$.user.name.set('Ada');
    const json = server.serialize();
    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

/**
 * The gap this investigation found — pinned so it cannot change silently.
 *
 * SSR exists to ship SERVER-FETCHED data to the client so the user does not
 * watch a spinner for something the server already had. `asyncSource` is where
 * fetched data lives, and it is the one thing that does NOT cross.
 *
 * Its `snapshot` captures always (correct — undo must replay what was on
 * screen), but its `hydrate` DECLINES `rehydrate`, reasoning that "the loader
 * has already re-run, so the fresh result wins". That is right for a
 * localStorage restore hours later. It is false at SSR hydration: the payload
 * is milliseconds old and the client's loader has not run yet.
 *
 * The cost is paid twice — the bytes ship AND the client refetches. See
 * RFC 0014.
 */
describe('C3 gap — asyncSource ships its payload and then drops it', () => {
  const make = () => ({
    feed: asyncSource<string[]>(() => Promise.resolve([])),
    n: 0,
  });

  it('the server value IS serialised into the payload', () => {
    const server = signalTree(make()).with(serialization());
    (server.$.feed as unknown as { set(v: unknown): void }).set(['SERVER']);
    expect(server.serialize()).toContain('SERVER');
  });

  it('...and the client does NOT receive it', () => {
    // The decline is also reported through the hydrate-decision channel, but
    // this asserts the BEHAVIOUR rather than the message: a console spy here
    // captured nothing while the warning was plainly on stdout, because the
    // report routes through a listener. Asserting on the observable outcome is
    // both stronger and not hostage to how the report is delivered.
    const server = signalTree(make()).with(serialization());
    (server.$.feed as unknown as { set(v: unknown): void }).set(['SERVER']);
    const payload = server.serialize();
    expect(payload).toContain('SERVER'); // the bytes were shipped

    const client = signalTree(make()).with(serialization());
    client.deserialize(payload);

    // ...and dropped on arrival.
    expect(
      (client.$.feed as unknown as { value?(): unknown }).value?.()
    ).toBeUndefined();
  });

  it('entityMap, given the same job, DOES transfer — the contrast', () => {
    const mk = () => ({
      rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    });
    const server = signalTree(mk()).with(serialization());
    server.$.rows.setAll([{ id: 1, name: 'a' }]);

    const client = signalTree(mk()).with(serialization());
    client.deserialize(server.serialize());

    expect(client.$.rows.all()).toHaveLength(1);
  });
});
