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
describe('ST2028 — the edit-session clone fallback is lossy and now says so', () => {
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

  it('degrades ALL of them when one function forces the JSON fallback', () => {
    const s = createEditSession({
      when: new Date(0),
      tags: new Map([['a', 1]]),
      maybe: undefined,
      onSave: () => 1,
    });
    const v = s.modified() as Record<string, unknown>;

    // Documenting the damage rather than asserting it is fine: one
    // non-cloneable field costs every special type in the object.
    expect(v['when'] instanceof Date).toBe(false);
    expect(v['tags'] instanceof Map).toBe(false);
    expect('maybe' in v).toBe(false);

    // ...and says so. Asserted HERE rather than in its own test because the
    // dedupe flag is module-global — a later test would find it already spent.
    const msg = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(msg).toContain('ST2028');
    expect(msg).toContain('structuredClone');
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
