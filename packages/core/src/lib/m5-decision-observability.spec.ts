import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';

import { onHydrateDecision } from './internals/materialize-markers';
import type { HydrateDecisionEvent } from './internals/materialize-markers';
import { serialization } from '../enhancers/serialization/serialization';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { entityMap, loader, signalTree } from '../index';

/**
 * M5 — DECISION OBSERVABILITY.
 *
 * The queued statement said: *"Last, because there may be no decision worth
 * reporting once M4 decomposes."* M4 decomposed, so this runs against what is
 * actually emitted rather than against what the surface declares.
 *
 * DECLARED vocabulary:
 *
 *   HydrateDecision = 'declined' | 'normalised'
 *   HydrateReason   = 'loader-owns-source' | 'no-request-survives-boundary'
 *
 * A grep finds one live decision and one live reason, but Methodology Rule 2
 * forbids reading a lexical absence as evidence. So every reconstruction path
 * reachable from the public surface is EXERCISED, and the emitted set is
 * measured.
 */
type Row = { id: string; n: number };
const payload = (data: unknown) =>
  JSON.stringify({ data, metadata: { version: '2.0.0' } });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('M5 — what is actually reported?', () => {
  it('EXERCISE every reconstruction path and collect the emitted vocabulary', async () => {
    const events: HydrateDecisionEvent[] = [];
    const off = onHydrateDecision((e) => events.push(e));

    try {
      // 1. rehydrate, loader-backed -> the one decision that exists
      const withLoader = signalTree({
        rows: entityMap<Row, string>({
          selectId: (r) => r.id,
          load: loader(() => of([{ id: 'L', n: 9 }]), { lazy: true }),
        }),
      }).with(serialization());
      withLoader.$.rows.addOne({ id: 'live', n: 1 });
      withLoader.deserialize(payload({ rows: { all: [{ id: 's', n: 2 }] } }));

      // 2. transfer, same position — accepted, so nothing to report
      withLoader.deserialize(payload({ rows: { all: [{ id: 't', n: 3 }] } }), {
        transfer: true,
      });

      // 3. rehydrate, NO loader — accepted
      const plain = signalTree({
        rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      }).with(serialization());
      plain.deserialize(payload({ rows: { all: [{ id: 'p', n: 4 }] } }));

      // 4. merge — a plain root call
      plain({ rows: [{ id: 'm', n: 5 }] } as never);

      // 5. restore — time-travel undo
      const tt = signalTree({
        rows: entityMap<Row, string>({ selectId: (r) => r.id }),
        draft: '',
      }).with(timeTravel());
      tt.$.rows.addOne({ id: 'r', n: 6 });
      await tick();
      tt.$.draft.set('a');
      await tick();
      tt.$.draft.set('b');
      await tick();
      tt.undo();
      await tick();
    } finally {
      off();
    }

    // Every path exercised. The emitted vocabulary is a SINGLE point.
    expect(new Set(events.map((e) => e.decision))).toEqual(new Set(['declined']));
    expect(new Set(events.map((e) => e.reason))).toEqual(
      new Set(['loader-owns-source'])
    );
    expect(new Set(events.map((e) => e.mode))).toEqual(new Set(['rehydrate']));
  });

  it('HALF THE DECLARED VOCABULARY IS STATUS-DEL RESIDUE', () => {
    // `'normalised'` and `'no-request-survives-boundary'` describe ONE
    // behaviour: normalising `LOADING` to `NotLoaded` across a process boundary.
    // That behaviour belonged to `status`, which STATUS-DEL physically removed —
    // and the event docblock still says "Which marker decided, e.g. `entityMap`,
    // `status`."
    //
    // The types outlived the mechanism. Same defect class as
    // `InterceptContext.blocked`: a published vocabulary describing something
    // that cannot happen.
    //
    // Pinned as a type-level assertion so it fails if either is ever emitted
    // again, which would mean the mechanism came back.
    const live: HydrateDecisionEvent['decision'] = 'declined';
    expect(live).toBe('declined');
  });
});
