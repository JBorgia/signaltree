import { TransferState, makeStateKey } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { status } from './markers/status';
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
