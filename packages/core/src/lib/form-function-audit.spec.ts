import { computed, signal } from '@angular/core';

import { form, signalTree } from '../index';

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
