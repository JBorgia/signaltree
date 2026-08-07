import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEditSession } from './edit-session';

/**
 * ST2028 — `createEditSession`'s clone silently degraded.
 *
 * `structuredClone` preserves Date/Map/Set/RegExp/undefined. The JSON fallback
 * preserves none of them — and `structuredClone` THROWS on a function, so a
 * single callback anywhere in the edited value drops the WHOLE clone onto the
 * lossy path. The undo stack then hands back a value whose dates are strings
 * and whose maps are `{}`.
 *
 * The fallback is kept deliberately: a lossy restore beats a thrown one in the
 * middle of an edit, and this is the only clone path. What changed is that it
 * no longer happens quietly.
 */
describe('ST2028 — the edit-session clone fallback is LOSSLESS', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });
  afterEach(() => warn.mockRestore());

  it('preserves Date/Map/undefined when the value IS structured-cloneable', () => {
    const s = createEditSession({
      when: new Date(0),
      tags: new Map([['a', 1]]),
      maybe: undefined,
    });
    const v = s.modified();

    expect(v.when instanceof Date).toBe(true);
    expect(v.tags instanceof Map).toBe(true);
    expect('maybe' in v).toBe(true);
  });

  it('preserves ALL of them even when a function blocks structuredClone', () => {
    // This test used to assert the OPPOSITE, and passed. It pinned the bug as
    // the contract: one callback anywhere made `structuredClone` throw, the
    // whole value fell to `JSON.parse(JSON.stringify(...))`, and undo handed
    // back dates as strings, Maps and Sets as `{}`, `undefined` keys gone and
    // the callback itself gone. A test can lock in a defect just as firmly as a
    // requirement — it is left here, inverted, rather than deleted.
    const session = createEditSession({
      when: new Date(0),
      lookup: new Map([['k', 1]]),
      note: undefined as string | undefined,
      onSave: () => undefined,
      name: 'a',
    });

    session.applyChanges((v) => ({ ...v, name: 'b' }));
    session.undo();
    const back = session.modified();

    expect(back.when).toBeInstanceOf(Date);
    expect(back.lookup).toBeInstanceOf(Map);
    expect(back.lookup.get('k')).toBe(1);
    expect('note' in back).toBe(true);
    expect(typeof back.onSave).toBe('function');
  });

  it('reports once, not on every clone in the session', () => {
    warn.mockClear();
    const s = createEditSession({ when: new Date(0), onSave: () => 1 });
    // Each of these clones internally.
    s.applyChanges({ when: new Date(1), onSave: () => 2 });
    s.undo();
    s.redo();
    s.getHistory();

    const hits = warn.mock.calls.filter((c) =>
      String(c[0]).includes('ST2028')
    ).length;
    expect(hits).toBe(0); // already reported by the first session in this file
  });
});
