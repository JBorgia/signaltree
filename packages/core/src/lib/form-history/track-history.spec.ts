import { ApplicationRef, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { trackHistory } from './form-history';

/**
 * `trackHistory()` is the marker-free counterpart to `history()`: it attaches
 * the same undo/redo engine to ANY `WritableSignal`, via an `effect()` that
 * observes the model and records every change (whatever the write source —
 * `model.set`/`.update`, or a bound Angular Signal Forms `FieldTree`).
 *
 * The effect's initial run (and every subsequent run) is scheduled
 * asynchronously by Angular's effect scheduler, so specs flush it with
 * `ApplicationRef.whenStable()` (confirmed empirically: a bare microtask
 * `await Promise.resolve()` does NOT flush it under this vitest/TestBed
 * setup — only `whenStable()` does). Undo/redo themselves write the model
 * synchronously, so no flush is needed to observe their effect.
 */
async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

interface Profile extends Record<string, unknown> {
  name: string;
  tags: string[];
}

describe('trackHistory()', () => {
  it('attaches undo/redo to a plain WritableSignal — no form() marker', async () => {
    const model = signal<Profile>({ name: '', tags: [] });
    const injector = TestBed.inject(Injector);
    const hist = trackHistory(model, { injector });

    expect(hist.canUndo()).toBe(false);
    expect(hist.canRedo()).toBe(false);

    model.set({ name: 'Ada', tags: [] });
    await stable();
    expect(hist.canUndo()).toBe(true);
    expect(model().name).toBe('Ada');

    model.update((m) => ({ ...m, name: 'Grace' }));
    await stable();
    expect(model().name).toBe('Grace');

    hist.undo();
    expect(model().name).toBe('Ada');
    expect(hist.canRedo()).toBe(true);

    hist.undo();
    expect(model().name).toBe('');
    expect(hist.canUndo()).toBe(false);

    hist.redo();
    expect(model().name).toBe('Ada');
    hist.redo();
    expect(model().name).toBe('Grace');
    expect(hist.canRedo()).toBe(false);
  });

  it('canUndo/canRedo track the buffer accurately across a mixed edit/undo/redo sequence', async () => {
    const model = signal<Profile>({ name: '', tags: [] });
    const injector = TestBed.inject(Injector);
    const hist = trackHistory(model, { injector });

    model.set({ name: 'a', tags: [] });
    await stable();
    model.set({ name: 'b', tags: [] });
    await stable();

    expect(hist.history().past.length).toBe(2);
    hist.undo();
    expect(hist.canUndo()).toBe(true);
    expect(hist.canRedo()).toBe(true);
    hist.undo();
    expect(hist.canUndo()).toBe(false);
    expect(hist.canRedo()).toBe(true);
  });

  it('clearHistory() drops past/future but keeps the current value as present', async () => {
    const model = signal<Profile>({ name: '', tags: [] });
    const injector = TestBed.inject(Injector);
    const hist = trackHistory(model, { injector });

    model.set({ name: 'Ada', tags: [] });
    await stable();
    expect(hist.canUndo()).toBe(true);

    hist.clearHistory();
    expect(hist.canUndo()).toBe(false);
    expect(hist.canRedo()).toBe(false);
    expect(hist.history().present).toEqual({ name: 'Ada', tags: [] });
    expect(model().name).toBe('Ada'); // clearHistory never touches the model
  });

  describe('exclude', () => {
    interface Secret extends Record<string, unknown> {
      name: string;
      secret: string;
    }

    it('never buffers an excluded field, and keeps its live value across undo', async () => {
      const model = signal<Secret>({ name: '', secret: '' });
      const injector = TestBed.inject(Injector);
      const hist = trackHistory(model, { injector, exclude: ['secret'] });

      model.set({ name: 'Ada', secret: 'shhh1' });
      await stable();
      model.set({ name: 'Grace', secret: 'shhh2' });
      await stable();

      const snap = hist.history();
      expect('secret' in snap.present).toBe(false);
      expect(snap.past.every((s) => !('secret' in s))).toBe(true);

      hist.undo();
      // name reverts, but secret keeps its LIVE value (not resurrected from
      // an old snapshot — the field was never recorded in the first place).
      expect(model().name).toBe('Ada');
      expect(model().secret).toBe('shhh2');
    });

    it('an edit that only touches the excluded field records nothing', async () => {
      const model = signal<Secret>({ name: 'Ada', secret: 'a' });
      const injector = TestBed.inject(Injector);
      const hist = trackHistory(model, { injector, exclude: ['secret'] });
      await stable(); // let the initial (no-op) record settle

      model.set({ name: 'Ada', secret: 'b' });
      await stable();
      expect(hist.canUndo()).toBe(false);
      expect(hist.history().past.length).toBe(0);
    });
  });

  describe('nested objects and arrays', () => {
    interface Nested extends Record<string, unknown> {
      profile: { name: string; address: { city: string } };
      tags: string[];
    }

    it('round-trips a nested object edit through undo/redo', async () => {
      const model = signal<Nested>({
        profile: { name: '', address: { city: '' } },
        tags: [],
      });
      const injector = TestBed.inject(Injector);
      const hist = trackHistory(model, { injector });

      model.set({
        profile: { name: 'Ada', address: { city: 'London' } },
        tags: [],
      });
      await stable();
      expect(model().profile.address.city).toBe('London');

      hist.undo();
      expect(model().profile).toEqual({ name: '', address: { city: '' } });

      hist.redo();
      expect(model().profile).toEqual({
        name: 'Ada',
        address: { city: 'London' },
      });
    });

    it('round-trips an array-valued edit through undo/redo', async () => {
      const model = signal<Nested>({
        profile: { name: '', address: { city: '' } },
        tags: [],
      });
      const injector = TestBed.inject(Injector);
      const hist = trackHistory(model, { injector });

      model.update((m) => ({ ...m, tags: [...m.tags, 'a'] }));
      await stable();
      model.update((m) => ({ ...m, tags: [...m.tags, 'b'] }));
      await stable();
      expect(model().tags).toEqual(['a', 'b']);

      hist.undo();
      expect(model().tags).toEqual(['a']);
      hist.undo();
      expect(model().tags).toEqual([]);

      hist.redo();
      expect(model().tags).toEqual(['a']);
      hist.redo();
      expect(model().tags).toEqual(['a', 'b']);
    });

    it('mutating the array in place does not corrupt a past snapshot (deep clone)', async () => {
      const model = signal<Nested>({
        profile: { name: '', address: { city: '' } },
        tags: ['a'],
      });
      const injector = TestBed.inject(Injector);
      const hist = trackHistory(model, { injector });
      await stable();

      model.update((m) => ({ ...m, tags: [...m.tags, 'b'] }));
      await stable();

      const pastTags = hist.history().past[0].tags;
      // Mutate the LIVE model's array reference; the buffered snapshot must
      // be an independent deep clone, not an alias.
      model().tags.push('mutated');
      expect(pastTags).toEqual(['a']);
    });
  });
});
