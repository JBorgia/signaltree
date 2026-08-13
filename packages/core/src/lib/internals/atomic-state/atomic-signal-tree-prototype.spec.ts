import { computed, isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { StaleAtomicScalarFrameError } from './atomic-scalar-store';
import { createAtomicSignalTreePrototype } from './atomic-signal-tree-prototype';

describe('atomic signal tree prototype', () => {
  it('preserves the leaf contract on an atomic-backed tree', () => {
    const prototype = createAtomicSignalTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const tree = prototype.tree;
    const name = tree.$.profile.name;
    const readonlyName = name.asReadonly();

    expect(name()).toBe('Alice');
    expect(isSignal(name)).toBe(true);
    expect(tree.$.profile.name).toBe(name);

    name.set('Alicia');
    expect(name()).toBe('Alicia');
    expect(readonlyName()).toBe('Alicia');

    name.update((value) => `${value}!`);
    expect(name()).toBe('Alicia!');
    expect(readonlyName()).toBe('Alicia!');
  });

  it('keeps leaf identity stable across sibling writes and atomic frame publication', () => {
    const prototype = createAtomicSignalTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const tree = prototype.tree;
    const name = tree.$.profile.name;
    const enabled = tree.$.profile.enabled;

    enabled.set(false);
    expect(tree.$.profile.name).toBe(name);

    const frame = prototype.beginFrame();
    frame.set(name, 'Alicia');
    frame.set(enabled, true);
    frame.commit();

    expect(tree.$.profile.name).toBe(name);
    expect(name()).toBe('Alicia');
    expect(enabled()).toBe(true);
  });

  it('does not expose a partial pair during atomic multi-leaf publication', () => {
    const prototype = createAtomicSignalTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const tree = prototype.tree;
    const name = tree.$.profile.name;
    const enabled = tree.$.profile.enabled;
    const pair = computed(() => `${name()}|${enabled()}`);
    const frame = prototype.beginFrame();

    frame.set(name, 'Alicia');
    frame.set(enabled, false);

    expect(pair()).toBe('Alice|true');

    frame.commit();

    expect(pair()).toBe('Alicia|false');
    expect(prototype.publicationCount()).toBe(1);
  });

  it('ordinary leaf writes use the same committed-root path and stale an open frame', () => {
    const prototype = createAtomicSignalTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const tree = prototype.tree;
    const name = tree.$.profile.name;
    const enabled = tree.$.profile.enabled;
    const frame = prototype.beginFrame();

    frame.set(name, 'Alicia');
    expect(prototype.revision()).toBe(0);

    enabled.set(false);

    expect(prototype.revision()).toBe(1);
    expect(() => frame.commit()).toThrow(StaleAtomicScalarFrameError);
    expect(name()).toBe('Alice');
    expect(enabled()).toBe(false);
  });

  it('still behaves like a tree accessor for root and branch reads', () => {
    const prototype = createAtomicSignalTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const tree = prototype.tree;

    expect(tree()).toEqual({ profile: { name: 'Alice', enabled: true } });
    expect(tree.$.profile()).toEqual({ name: 'Alice', enabled: true });
  });
});
