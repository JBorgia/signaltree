import { computed, signal } from '@angular/core';

import { form, history, LoadingState, signalTree, status, timeTravel } from '../index';

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

// ============================================================================
// F3 — `submitting`
//
// The question is NOT "does form.submit() toggle a flag" — it plainly does.
// It is: what semantic fact does `submitting` represent, WHO CAN KNOW it became
// true, and does that fact describe SignalTree TRUTH or the LIFECYCLE OF AN
// EXTERNAL OPERATION?
// ============================================================================
describe('F3 submitting — a fact about truth, or about an operation?', () => {
  it('WHO KNOWS: only calling marker.submit() sets it — a save the app runs itself is invisible', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    });
    const marker = tree.$.p;

    // The application saves the very same values, through its own service.
    // This is an ordinary thing to do, and SignalTree cannot see it.
    const appSave = async () => {
      await Promise.resolve();
      return 'saved';
    };
    const inFlight = appSave();

    expect(marker.submitting()).toBe(false);
    await inFlight;
    expect(marker.submitting()).toBe(false);

    // So `submitting` does not report "a submission of this state is running".
    // It reports "ONE PARTICULAR API ON THIS MARKER was called".
  });

  it('CARDINALITY: one boolean cannot describe two concurrent operations', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    });
    const marker = tree.$.p;

    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((r) => (releaseSlow = r));

    const slowSubmit = marker.submit(async () => {
      await slow;
      return 'slow';
    });
    expect(marker.submitting()).toBe(true);

    // A second, faster submission starts and finishes while the first runs.
    await marker.submit(async () => 'fast');

    // The fast one's `finally` cleared the flag. The SLOW one is still running.
    expect(marker.submitting()).toBe(false);

    releaseSlow?.();
    await slowSubmit;
    expect(marker.submitting()).toBe(false);
  });

  it('CATEGORY: core already models in-flight external work, with more states', () => {
    const tree = signalTree({ job: status() });

    expect(tree.$.job.state()).toBe(LoadingState.NotLoaded);
    tree.$.job.setLoading();
    expect(tree.$.job.state()).toBe(LoadingState.Loading);

    // `status()` distinguishes not-started / running / succeeded / failed and
    // carries the error. `submitting` is a boolean that collapses all four.
    tree.$.job.setError('boom');
    expect(tree.$.job.state()).toBe(LoadingState.Error);
    expect(tree.$.job.error()).toBe('boom');
  });

  it('NULL: the operation lifecycle belongs to whoever runs the operation', async () => {
    const tree = signalTree({ p: { name: 'Ada', age: 36 } });

    // Owned where the operation is owned.
    const saving = signal(false);
    const save = async (values: Profile) => {
      saving.set(true);
      try {
        await Promise.resolve();
        return values;
      } finally {
        saving.set(false);
      }
    };

    expect(saving()).toBe(false);
    const p = save(tree.$.p() as Profile);
    expect(saving()).toBe(true);
    await p;
    expect(saving()).toBe(false);
  });
});

// ============================================================================
// F3b — `submit()` ITSELF, the orchestration wrapper.
//
// Deleting `submitting` must not leave `marker.submit(handler)` alive merely
// because it rode alongside the flag. Validation ownership already removed the
// validateAll() step, so what remains to justify is orchestration.
//
// NULL:  const result = await save(tree.$.p());
// ============================================================================
describe('F3b submit() — what does the orchestration add?', () => {
  it('VALUE COHERENCE: submit reads values AFTER an await, not at call time', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    });
    const marker = tree.$.p;

    let seen: Profile | undefined;
    const pending = marker.submit(async (values) => {
      seen = values;
      return values;
    });

    // A write that lands after submit() was called but before the handler runs.
    marker.patch({ name: 'RACED' });
    await pending;

    // The handler received the LATER value: submit() reads valuesSignal() after
    // awaiting, so what is submitted is not what was on screen when the user
    // pressed the button.
    expect(seen?.name).toBe('RACED');
  });

  it('NULL: reading at call time submits exactly what the user saw', async () => {
    const tree = signalTree({ p: { name: 'Ada', age: 36 } });

    const save = async (values: Profile) => values;

    // The application snapshots when it decides to submit.
    const submitted = save(tree.$.p() as Profile);
    tree.$.p({ name: 'RACED' });

    expect((await submitted).name).toBe('Ada');
  });

  it('CAUSAL ATTRIBUTION: a submit records nothing — it is not an event in the tree', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    }).with(timeTravel());
    const marker = tree.$.p;

    await tick();
    const before = tree.getHistory().length;

    await marker.submit(async (v) => v);
    await tick();

    expect(tree.getHistory().length).toBe(before);
  });

  it('ERROR OWNERSHIP: a throwing handler propagates, exactly as the null does', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    });
    const marker = tree.$.p;

    await expect(
      marker.submit(async () => {
        throw new Error('server said no');
      })
    ).rejects.toThrow('server said no');

    // No error is retained anywhere on the marker for the app to read.
    const api = marker as unknown as Record<string, unknown>;
    expect(api['submitError']).toBeUndefined();
    expect(api['lastError']).toBeUndefined();
  });

  it('CANCELLATION / WRITE GATING: neither is offered', async () => {
    const tree = signalTree({
      p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
    });
    const marker = tree.$.p;
    const api = marker as unknown as Record<string, unknown>;

    for (const c of ['abort', 'cancel', 'abortSubmit']) {
      expect(api[c]).toBeUndefined();
    }

    // And the tree stays writable mid-submit: no gate, no lock.
    let release: (() => void) | undefined;
    const pending = marker.submit(async () => {
      await new Promise<void>((r) => (release = r));
      return 'done';
    });
    // submit() awaits validation before invoking the handler, so let the
    // handler actually start before asserting anything about mid-flight state.
    await new Promise((r) => setTimeout(r, 0));
    expect(marker.submitting()).toBe(true);

    marker.patch({ age: 99 });
    expect(marker().age).toBe(99);

    release?.();
    await pending;
  });
});

// ============================================================================
// F4 — "wizard".
//
// NULL: no concept called "wizard" exists. An application has state, and a UI
// containing several views. What required capability becomes impossible?
//
// The bundle is split BEFORE measuring, so "wizard" cannot smuggle five
// separately-owned things through as one:
//
//   current step      allowed transition / guard    step ordering
//   step completion   next / previous convenience
// ============================================================================
describe('F4 wizard — is step position TREE STATE at all?', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const makeWizardTree = () =>
    signalTree({
      p: form<Profile>({
        initial: { name: '', age: 0 },
        wizard: { steps: ['one', 'two', 'three'] },
      }),
    });

  it('DECISIVE: the step is INVISIBLE to the tree snapshot', async () => {
    const tree = makeWizardTree();
    await tree.$.p.wizard?.goTo(1);

    const snap = JSON.stringify(tree());
    // The step index reached 1, yet nothing in the tree's own value carries it.
    expect(tree.$.p.wizard?.currentStep()).toBe(1);
    expect(snap).not.toContain('currentStep');
    expect(snap).not.toContain('step');
    // Recorded while here: the root read projects the marker's SNAPSHOT shape
    // ({ values, touched }), not `T`. `values` and `touched` are in; the
    // wizard's position is in neither.
    expect(snap).toBe(
      JSON.stringify({
        p: { values: { name: '', age: 0 }, touched: { name: false, age: false } },
      })
    );
  });

  it('DECISIVE: timeTravel undo does not move the step', async () => {
    const tree = signalTree({
      p: form<Profile>({
        initial: { name: '', age: 0 },
        wizard: { steps: ['one', 'two', 'three'] },
      }),
    }).with(timeTravel());
    const w = tree.$.p.wizard;

    tree.$.p.patch({ name: 'Ada' });
    await tick();
    await w?.next();
    tree.$.p.patch({ name: 'Grace' });
    await tick();

    expect(w?.currentStep()).toBe(1);

    tree.undo();
    await tick();

    // Values rewound; navigation did not. The step is not part of tree history.
    expect(tree.$.p().name).toBe('Ada');
    expect(w?.currentStep()).toBe(1);
  });

  it('a bare navigation records NO history entry', async () => {
    const tree = signalTree({
      p: form<Profile>({
        initial: { name: '', age: 0 },
        wizard: { steps: ['one', 'two', 'three'] },
      }),
    }).with(timeTravel());

    tree.$.p.patch({ name: 'Ada' });
    await tick();
    const before = tree.getHistory().length;

    await tree.$.p.wizard?.next();
    await tree.$.p.wizard?.next();
    await tick();

    expect(tree.getHistory().length).toBe(before);
  });

  it('GUARD: canNext reports step ARITHMETIC, not permission', async () => {
    const tree = makeWizardTree();
    const w = tree.$.p.wizard;

    // No completion of step one has occurred; nothing has been filled in.
    expect(w?.currentStep()).toBe(0);
    expect(w?.canNext()).toBe(true);

    // So `canNext` answers "is there a later step", not "may I go there".
    await w?.goTo(2);
    expect(w?.canNext()).toBe(false);
    expect(w?.isLastStep()).toBe(true);
  });

  it('NULL: the whole surface is one integer plus computeds over a static list', () => {
    const steps = ['one', 'two', 'three'] as const;
    const step = signal(0);

    const stepName = computed(() => steps[step()]);
    const canPrev = computed(() => step() > 0);
    const isLast = computed(() => step() === steps.length - 1);
    const next = () => step.update((i) => Math.min(i + 1, steps.length - 1));
    const prev = () => step.update((i) => Math.max(i - 1, 0));

    expect(stepName()).toBe('one');
    expect(canPrev()).toBe(false);
    next();
    expect(stepName()).toBe('two');
    prev();
    expect(step()).toBe(0);
    next();
    next();
    expect(isLast()).toBe(true);
  });
});
