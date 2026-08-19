import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { entityMap } from './entity-map';
import { invalidateTag } from './entity-loader';
import { loader } from './loader';

/**
 * A2 FALSIFIERS — entity-bound cache / freshness ownership.
 *
 * RFC 0016 Derivation A2. These are MEASUREMENTS, not desired behaviour: each
 * asserts what `entity-loader.ts` does today so the derivation can reason about
 * ownership from facts rather than from the option names (`staleTime`, `swr`,
 * `tags`, `invalidate`), which is exactly the inference that Derivation S1
 * showed produces false ontology.
 *
 * Several of these lock in defects. They are labelled DEFECT and must not be
 * read as contracts to preserve — Rule 0l.
 */

interface Cust {
  id: string;
  name: string;
}
const custId = (c: Cust) => c.id;

/** A fetch whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let queued microtasks (deferred kickoff, .then chains) drain. */
const drain = async (turns = 4) => {
  for (let i = 0; i < turns; i++) await Promise.resolve();
};

/**
 * Markers finalize lazily on first `.$` access, and the auto-load kickoff is
 * queued at THAT moment (NG0600 safety). So a spec must touch the collection
 * before draining, or it drains an empty queue and measures a loader that never
 * ran.
 */
const materialize = async <T>(collection: T): Promise<T> => {
  await drain();
  return collection;
};

describe('A2 — does cache freshness depend on entity identity or lifetime?', () => {
  // ---------------------------------------------------------------------------
  // F1 — THE DECISIVE IDENTITY FALSIFIER
  // ---------------------------------------------------------------------------
  it('F1: same key, new semantic subject — the cache cannot tell them apart', async () => {
    let calls = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(
          () => {
            calls++;
            return Promise.resolve([{ id: 'w1', name: 'West Co' }]);
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await materialize(tree.$.customers);
    expect(calls).toBe(1);
    const firstLoadedAt = tree.$.customers.lastLoadedAt();

    // The key survives; the thing it denotes does not. Remove the entity and
    // put a DIFFERENT customer in the same slot.
    tree.$.customers.removeOne('w1');
    tree.$.customers.addOne({ id: 'w1', name: 'A DIFFERENT COMPANY' });

    // Nothing about the cache moved: no re-read, no staleness, same timestamp.
    expect(tree.$.customers.loaded()).toBe(true);
    expect(tree.$.customers.lastLoadedAt()).toBe(firstLoadedAt);
    await tree.$.customers.load();
    expect(calls).toBe(1); // still fresh — the substitution was invisible
  });

  it('F2: emptying the collection leaves it "loaded and fresh"', async () => {
    let calls = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(
          () => {
            calls++;
            return Promise.resolve([{ id: 'w1', name: 'West Co' }]);
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await materialize(tree.$.customers);

    tree.$.customers.clear();

    expect(tree.$.customers.all()).toEqual([]);
    expect(tree.$.customers.loaded()).toBe(true);
    await tree.$.customers.load();
    expect(calls).toBe(1); // entity lifetime does not participate in freshness
  });

  it('F1b: locally added entities do not make the acquisition stale', async () => {
    let calls = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(
          () => {
            calls++;
            return Promise.resolve([{ id: 'w1', name: 'West Co' }]);
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await materialize(tree.$.customers);

    tree.$.customers.addOne({ id: 'local', name: 'Never fetched' });

    // Freshness is a fact about the last FETCH, not about the collection's contents.
    expect(tree.$.customers.loaded()).toBe(true);
    await tree.$.customers.load();
    expect(calls).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // F3 — THE INVERSE: one resource, two collections
  // ---------------------------------------------------------------------------
  it('F3: one external resource behind two collections is TWO freshness facts', async () => {
    let calls = 0;
    const fetchCustomers = () => {
      calls++;
      return Promise.resolve([{ id: 'w1', name: 'West Co' }]);
    };
    const tree = signalTree({
      left: entityMap<Cust, string>({
        selectId: custId,
        load: loader(fetchCustomers, { staleTime: '30m' }),
      }),
      right: entityMap<Cust, string>({
        selectId: custId,
        load: loader(fetchCustomers, { staleTime: '30m' }),
      }),
    });
    void tree.$.left.all();
    void tree.$.right.all();
    await drain();

    // The same resource was acquired twice — no shared cache entry.
    expect(calls).toBe(2);

    tree.$.left.invalidate();

    // …and staleness is per loader instance, not per resource.
    expect(tree.$.left.loaded()).toBe(false);
    expect(tree.$.right.loaded()).toBe(true);
  });

  it('F3b: tags address collections, not entities — and only within one tree', async () => {
    const rows = () => Promise.resolve([{ id: 'w1', name: 'West Co' }]);
    const treeA = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(rows, { staleTime: '30m', tags: ['customers'] }),
      }),
    });
    const treeB = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(rows, { staleTime: '30m', tags: ['customers'] }),
      }),
    });
    void treeA.$.customers.all();
    void treeB.$.customers.all();
    await drain();

    expect(invalidateTag(treeA, 'customers')).toBe(1);
    expect(treeA.$.customers.loaded()).toBe(false);
    expect(treeB.$.customers.loaded()).toBe(true); // tree-scoped authority
  });

  // ---------------------------------------------------------------------------
  // F4 — GENERATION GUARD: present, contra Amendment 3
  // ---------------------------------------------------------------------------
  it('F4: an earlier-started, later-completing load cannot land (run-id guard)', async () => {
    const first = deferred<Cust[]>();
    const second = deferred<Cust[]>();
    let call = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader((scope: string) => {
          call++;
          return call === 1 ? first.promise : second.promise;
        }),
      }),
    });

    void tree.$.customers.load('west');
    void tree.$.customers.load('east'); // different scope -> new run

    second.resolve([{ id: 'e1', name: 'East Co' }]);
    await drain();
    first.resolve([{ id: 'w1', name: 'West Co' }]); // obsolete completion
    await drain();

    expect(tree.$.customers.all()).toEqual([{ id: 'e1', name: 'East Co' }]);
    expect(tree.$.customers.params()).toBe('east');
  });

  // ---------------------------------------------------------------------------
  // F5 / F6 — DEFECTS: invalidation issued mid-flight is destroyed by the
  // in-flight completion it should have outlived.
  // ---------------------------------------------------------------------------
  it('F5 DEFECT: invalidate() during flight is erased by the completing load', async () => {
    const fetch = deferred<Cust[]>();
    let calls = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(
          () => {
            calls++;
            return fetch.promise;
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await materialize(tree.$.customers);
    expect(calls).toBe(1);

    // The world changes while the pre-change request is still open.
    tree.$.customers.invalidate();
    fetch.resolve([{ id: 'w1', name: 'PRE-CHANGE VALUE' }]);
    await drain();

    // settleSuccess() does `invalidated.set(false)`, so the invalidation is gone.
    expect(tree.$.customers.loaded()).toBe(true);
    await tree.$.customers.load();
    expect(calls).toBe(1); // no refetch for the next 30 minutes
    expect(tree.$.customers.all()).toEqual([
      { id: 'w1', name: 'PRE-CHANGE VALUE' },
    ]);
  });

  it('F6 DEFECT: refresh() during flight returns the pre-change request', async () => {
    const fetch = deferred<Cust[]>();
    let calls = 0;
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(
          () => {
            calls++;
            return fetch.promise;
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await materialize(tree.$.customers);

    // "Force a reload, ignoring staleTime/scope-match" — but not in-flight dedup.
    void tree.$.customers.refresh();
    fetch.resolve([{ id: 'w1', name: 'PRE-CHANGE VALUE' }]);
    await drain();

    expect(calls).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // F7 — WHAT SWR ACTUALLY IS
  // ---------------------------------------------------------------------------
  it('F7: swr collapses loaded() into has-ever-loaded', async () => {
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(() => Promise.resolve([{ id: 'w1', name: 'West Co' }]), {
          staleTime: '30m',
          swr: true,
        }),
      }),
    });
    await materialize(tree.$.customers);

    tree.$.customers.invalidate();

    // Not "serve stale while revalidating" — the flag is simply not readable.
    expect(tree.$.customers.loaded()).toBe(true);
    expect(tree.$.customers.loading()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // F8 — WHAT LANDING IS
  // ---------------------------------------------------------------------------
  it('F8: landing REPLACES the collection — no entity-level reconciliation', async () => {
    const tree = signalTree({
      customers: entityMap<Cust, string>({
        selectId: custId,
        load: loader(() => Promise.resolve([{ id: 'w1', name: 'West Co' }])),
      }),
    });
    await materialize(tree.$.customers);

    // A locally-known entity the server does not return.
    tree.$.customers.addOne({ id: 'optimistic', name: 'Created locally' });
    expect(tree.$.customers.count()).toBe(2);

    await tree.$.customers.refresh();

    // setAll(rows): the local row is gone. Landing has no merge policy, so it
    // cannot be said to respect entity identity or lifetime — it discards both.
    expect(tree.$.customers.ids()).toEqual(['w1']);
  });
});
