import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { entityMap } from './types';

/**
 * DERIVATION E — the last two members: `tap` and `intercept`.
 *
 * `tap`       push notification of add/update/remove.
 * `intercept` a WRITE-PATH AUTHORITY: it can block or transform a mutation
 *             before it lands.
 *
 * These are different in kind and are derived separately.
 */
type Row = { id: string; n: number };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ============================================================================
// E-TAP — is push observation a function, given a complete pull surface?
// ============================================================================
describe('E-TAP — push observation', () => {
  it('MEASURE — tap reports WHICH member changed and how', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    const seen: string[] = [];
    tree.$.rows.tap({
      onAdd: (e, id) => seen.push(`add:${id}:${e.n}`),
      onUpdate: (id, changes) => seen.push(`upd:${id}:${JSON.stringify(changes)}`),
      onRemove: (id) => seen.push(`rem:${id}`),
    });

    tree.$.rows.addOne({ id: 'a', n: 1 });
    tree.$.rows.updateOne('a', { n: 2 });
    tree.$.rows.removeOne('a');

    expect(seen).toEqual(['add:a:1', 'upd:a:{"n":2}', 'rem:a']);
  });

  it('NULL — the pull surface carries the same information, recovered by diff', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });

    // ANG-V0-D already established entityMap CRUD is fully visible through its
    // own read surface. The only thing push adds is CHANGE IDENTITY, which pull
    // recovers by diffing — at O(width) per change rather than O(delta).
    let prev = new Map<string, number>();
    const events = computed(() => {
      const next = new Map(tree.$.rows.all().map((r) => [r.id, r.n]));
      const out: string[] = [];
      for (const [id, n] of next) {
        if (!prev.has(id)) out.push(`add:${id}:${n}`);
        else if (prev.get(id) !== n) out.push(`upd:${id}:{"n":${n}}`);
      }
      for (const id of prev.keys()) if (!next.has(id)) out.push(`rem:${id}`);
      prev = next;
      return out;
    });

    tree.$.rows.addOne({ id: 'a', n: 1 });
    expect(events()).toEqual(['add:a:1']);
    tree.$.rows.updateOne('a', { n: 2 });
    expect(events()).toEqual(['upd:a:{"n":2}']);
    tree.$.rows.removeOne('a');
    expect(events()).toEqual(['rem:a']);
  });
});

// ============================================================================
// E-INT — `intercept` is a write-path authority, and the async form is broken.
// ============================================================================
describe('E-INT — write-path authority', () => {
  it('MEASURE — a SYNCHRONOUS interceptor really does block the write', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.intercept({
      onAdd: (e, ctx) => {
        if (e.n < 0) ctx.block('negative');
      },
    });

    expect(() => tree.$.rows.addOne({ id: 'bad', n: -1 })).toThrow(/negative/);
    expect(tree.$.rows.ids()).toEqual([]);

    tree.$.rows.addOne({ id: 'ok', n: 1 });
    expect(tree.$.rows.ids()).toEqual(['ok']);
  });

  it('DEFECT — an ASYNC interceptor does NOT block: the type says Promise, the call site never awaits', async () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });

    // `InterceptHandlers.onAdd` is declared `=> void | Promise<void>`, so this
    // is a form the PUBLIC TYPE invites. Every call site iterates handlers in a
    // plain synchronous loop with no await.
    let blockAttempted = false;
    tree.$.rows.intercept({
      onAdd: async (e, ctx) => {
        await Promise.resolve();
        if (e.n < 0) {
          blockAttempted = true;
          // The throw is caught HERE only so it does not surface as an
          // unhandled rejection and fail the run. In production nothing catches
          // it: the rejection is the entire trace the fail-open ever left,
          // which is why the defect was invisible.
          try {
            ctx.block('negative');
          } catch {
            /* swallowed by the promise, exactly as in production */
          }
        }
      },
    });

    // No throw — the write is already committed by the time the handler resumes.
    expect(() => tree.$.rows.addOne({ id: 'bad', n: -1 })).not.toThrow();
    expect(tree.$.rows.ids()).toEqual(['bad']);

    await tick();

    // The handler DID try to block. Its rejection landed nowhere.
    expect(blockAttempted).toBe(true);
    expect(tree.$.rows.byId('bad')?.n()).toBe(-1);
  });

  it('DEFECT — ctx.blocked / ctx.blockReason are vestigial: block() throws instead of setting them', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    let observedBlocked: boolean | undefined;

    tree.$.rows.intercept({
      onAdd: (e, ctx) => {
        observedBlocked = ctx.blocked;
        // The ctx exposes `blocked`/`blockReason` as if a handler could consult
        // or set them. `block()` throws out of the loop, so they are never true.
      },
    });

    tree.$.rows.addOne({ id: 'a', n: 1 });
    expect(observedBlocked).toBe(false);
  });
});
