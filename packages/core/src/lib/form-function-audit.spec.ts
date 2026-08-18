import { computed, signal } from '@angular/core';

import { form, history, signalTree, timeTravel } from '../index';

/**
 * EVIDENCE — `form()` function-by-function audit (RELEASE-1.0.md, F1..F7).
 *
 * TEMPORARY. This file characterizes the CURRENT `form()` marker so each
 * function's disposition rests on measurement. Like ANG-V0-F it is deleted once
 * the dispositions are frozen: a suite pinning the behaviour of a mechanism
 * under hostile audit would give it test-backed legitimacy.
 */

interface Profile extends Record<string, unknown> {
  name: string;
  age: number;
}

// ============================================================================
// F1 — `dirty`
// ============================================================================
describe('F1 dirty — what baseline does it compare against?', () => {
  it('MEASURES: the marker exposes no way to move the baseline', () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    });
    const api = tree.$.p as unknown as Record<string, unknown>;

    for (const candidate of [
      'markPristine',
      'commit',
      'setInitial',
      'setBaseline',
      'rebase',
      'markClean',
    ]) {
      expect(api[candidate]).toBeUndefined();
    }
  });

  it('a successful submit leaves the form PERMANENTLY dirty', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    });
    const marker = tree.$.p;

    expect(marker.dirty()).toBe(false);

    marker.patch({ name: 'Ada' });
    expect(marker.dirty()).toBe(true);

    // The user saves. The save succeeds.
    const saved = await marker.submit(async (values) => values);
    expect(saved).toEqual({ name: 'Ada', age: 0 });

    // There are now NO unsaved changes. `dirty` disagrees, and nothing short of
    // discarding the saved values can change its mind.
    expect(marker.dirty()).toBe(true);

    // reset() clears dirty only by throwing the saved work away.
    marker.reset();
    expect(marker.dirty()).toBe(false);
    expect(marker().name).toBe('');
  });

  it('NULL: an application-held baseline gives the post-save answer', () => {
    const tree = signalTree({ p: { name: '', age: 0 } });

    // The baseline is a value the application owns, not a construction-time
    // capture. It moves when the application says truth was persisted.
    const baseline = signal(tree.$.p());
    const dirty = computed(
      () => JSON.stringify(tree.$.p()) !== JSON.stringify(baseline())
    );

    expect(dirty()).toBe(false);

    tree.$.p({ name: 'Ada' });
    expect(dirty()).toBe(true);

    // Save succeeds -> the baseline moves. No values discarded.
    baseline.set(tree.$.p());
    expect(dirty()).toBe(false);
    expect(tree.$.p.name()).toBe('Ada');

    // And it still detects the next edit.
    tree.$.p.age.set(36);
    expect(dirty()).toBe(true);
  });

  it('NULL: the baseline can be captured LATE — no construction-time hook', () => {
    const tree = signalTree({ p: { name: 'preloaded', age: 7 } });

    // Tree already built and already written to before anyone cared about
    // dirtiness. A construction-time capture cannot express this.
    tree.$.p.name.set('server-hydrated');

    const baseline = signal(tree.$.p());
    const dirty = computed(
      () => JSON.stringify(tree.$.p()) !== JSON.stringify(baseline())
    );

    expect(dirty()).toBe(false);
    tree.$.p.name.set('user-edit');
    expect(dirty()).toBe(true);
  });
});

// ============================================================================
// F2 — `touched`
//
// The INTERACTION question, held apart from F1 on purpose. The marker's own
// source makes one non-trivial claim for it: that `touched` must ride in the
// snapshot so UNDO restores it. Tested before it is credited.
// ============================================================================
describe('F2 touched — who writes it, and does undo really need it?', () => {
  it('SignalTree NEVER sets touched — every write path leaves it false', () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    });
    const marker = tree.$.p;

    expect(marker.touched()).toEqual({ name: false, age: false });

    // Every write API the marker offers.
    marker.patch({ name: 'Ada' });
    marker.set({ age: 36 });
    marker.$.name.set('Grace');

    // Values changed; touched did not move a millimetre.
    expect(marker().name).toBe('Grace');
    expect(marker().age).toBe(36);
    expect(marker.touched()).toEqual({ name: false, age: false });

    // The ONLY thing that moves it is the application saying so.
    marker.touch('name');
    expect(marker.touched()).toEqual({ name: true, age: false });
  });

  it('the touched MAP SHAPE is fixed at construction', () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    });
    const marker = tree.$.p;

    // Keys come from Object.keys(initial) at construction.
    expect(Object.keys(marker.touched()).sort()).toEqual(['age', 'name']);
  });

  it('CLAIM UNDER TEST: does undo restore touched?', () => {
    const tree = signalTree({
      p: form<Profile>({
        initial: { name: '', age: 0 },
        history: history({ capacity: 10 }),
      }),
    });
    const marker = tree.$.p;

    marker.patch({ name: 'Ada' });
    marker.touch('name');
    expect(marker.touched().name).toBe(true);

    marker.patch({ name: 'Grace' });
    marker.touch('age');
    expect(marker.touched()).toEqual({ name: true, age: true });

    marker.history?.undo();

    // Values stepped back. `touched` did NOT: under the comment's own standard
    // it should read { name: true, age: false }.
    expect(marker().name).toBe('Ada');
    expect(marker.touched()).toEqual({ name: true, age: true });
  });

  it('NULL: an app-held touched map does the same, and is not shape-locked', () => {
    const tree = signalTree({ p: { name: '', age: 0 } });

    // Interaction state, owned where interaction happens.
    const touched = signal<Record<string, boolean>>({});
    const touch = (f: string) => touched.update((t) => ({ ...t, [f]: true }));
    const isTouched = (f: string) => computed(() => touched()[f] ?? false);

    const nameTouched = isTouched('name');
    expect(nameTouched()).toBe(false);

    tree.$.p.name.set('Ada');
    expect(nameTouched()).toBe(false); // a write is not an interaction

    touch('name');
    expect(nameTouched()).toBe(true);

    // And it covers fields the tree never declared — a dynamically added
    // control, a repeated row, a field the server sent late.
    touch('phones.0.value');
    expect(touched()['phones.0.value']).toBe(true);
  });
});

describe('F2 touched — the OTHER undo, which is the one the comment describes', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('MEASURES tree-level timeTravel undo against marker-level history undo', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    }).with(timeTravel());
    const marker = tree.$.p;

    marker.patch({ name: 'Ada' });
    marker.touch('name');
    await tick();

    marker.patch({ name: 'Grace' });
    marker.touch('age');
    await tick();

    expect(marker.touched()).toEqual({ name: true, age: true });

    tree.undo();
    await tick();

    // Values stepped back. `touched` did not: the state at that moment was
    // { name: true, age: false }.
    expect(marker()).toEqual({ name: 'Ada', age: 0 });
    expect(marker.touched()).toEqual({ name: true, age: true });
  });

  it('MECHANISM: touch() records NO history entry, so no undo can reach it', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: '', age: 0 } }),
    }).with(timeTravel());
    const marker = tree.$.p;

    marker.patch({ name: 'Ada' });
    await tick();
    const base = tree.getHistory().length;

    marker.touch('name');
    marker.touchAll();
    await tick();

    // Interaction state changed twice. History did not move, so there is no
    // entry holding the earlier touched state for undo to return to.
    expect(tree.getHistory().length).toBe(base);
  });
});
