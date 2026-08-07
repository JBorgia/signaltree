import { describe, expect, it } from 'vitest';

import { createEditSession } from './edit-session';

/**
 * ST2028 — an edit session holding a value `structuredClone` rejects.
 *
 * `structuredClone` throws on a function, so ONE callback anywhere in the
 * edited value used to drop the WHOLE object onto a `JSON.parse(JSON.stringify)`
 * path. That is silent corruption of an undo stack: the user hits undo and gets
 * back dates as strings, Maps and Sets as `{}`, `undefined` keys gone, and the
 * callback itself gone.
 *
 * JSON was never the only fallback. Everything above survives a walk that knows
 * about the types. Functions are shared by reference, which is the right answer
 * rather than a compromise — a function has no state to restore.
 */
describe('edit session: undo returns what was put in', () => {
  class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = 'ApiError';
    }
  }

  function session() {
    return createEditSession({
      when: new Date(1000),
      tags: new Set(['a', 'b']),
      lookup: new Map<string, number>([['k', 1]]),
      pattern: /ab+c/gi,
      note: undefined as string | undefined,
      err: new ApiError('nope', 404),
      onSave: () => 'saved',
      name: 'a',
    });
  }

  it('preserves every type across applyChanges + undo', () => {
    const s = session();
    s.applyChanges((v) => ({ ...v, name: 'b' }));
    s.undo();
    const back = s.modified();

    expect(back.name).toBe('a');
    expect(back.when).toBeInstanceOf(Date);
    expect(back.when.getTime()).toBe(1000);
    expect(back.tags).toBeInstanceOf(Set);
    expect([...back.tags]).toEqual(['a', 'b']);
    expect(back.lookup).toBeInstanceOf(Map);
    expect(back.lookup.get('k')).toBe(1);
    expect(back.pattern).toBeInstanceOf(RegExp);
    expect(back.pattern.source).toBe('ab+c');
    expect(back.pattern.flags).toBe('gi');
    expect('note' in back).toBe(true);
  });

  it('a class instance comes back as that class, not a plain object', () => {
    const s = session();
    s.applyChanges((v) => ({ ...v, name: 'b' }));
    s.undo();
    const back = s.modified();

    expect(back.err).toBeInstanceOf(ApiError);
    expect(back.err.status).toBe(404);
    expect(back.err.message).toBe('nope');
  });

  it('the function survives, shared by reference', () => {
    const s = session();
    s.applyChanges((v) => ({ ...v, name: 'b' }));
    s.undo();

    expect(typeof s.modified().onSave).toBe('function');
    expect(s.modified().onSave()).toBe('saved');
  });

  it('values ARE copied, not aliased — editing the draft cannot reach back', () => {
    // The reason a clone is needed at all. If undo handed back the same object
    // graph, mutating the restored value would corrupt the history behind it.
    const s = session();
    const first = s.modified();
    s.applyChanges((v) => ({ ...v, name: 'b' }));
    (s.modified().tags as Set<string>).add('mutated');

    s.undo();
    expect([...s.modified().tags]).toEqual(['a', 'b']);
    expect(first.tags.has('mutated')).toBe(false);
  });

  it('a cyclic value does not hang the clone', () => {
    type Node = { id: number; parent?: Node; onTick: () => void };
    const root: Node = { id: 1, onTick: () => undefined };
    root.parent = root;

    const s = createEditSession({ root, n: 0 });
    s.applyChanges((v) => ({ ...v, n: 1 }));
    s.undo();

    const back = s.modified();
    expect(back.n).toBe(0);
    expect(back.root.parent).toBe(back.root);
  });
});
