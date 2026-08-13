import {
  ChangeDetectionStrategy,
  Component,
  ApplicationRef,
  computed,
  effect,
  isSignal,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  createSlotTokenTreePrototype,
  StaleSlotTokenFrameError,
} from './slot-token-tree-prototype';

let activeTemplateTree = createSlotTokenTreePrototype({ a: 'A', b: true }).tree;

@Component({
  standalone: true,
  template: `{{ tree.$.a() }}|{{ tree.$.b() }}`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  get tree() {
    return activeTemplateTree;
  }
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const stable = async (): Promise<void> => {
  await TestBed.inject(ApplicationRef).whenStable();
};

describe('slot-token tree prototype', () => {
  it('assigns one numeric slot per scalar leaf', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
      settings: { theme: 'light', volume: 3 },
    });

    expect(prototype.slotCount()).toBe(4);
  });

  it('keeps computed consumers reactive through token-backed leaf accessors', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const label = computed(
      () => `${prototype.tree.$.profile.name()}|${prototype.tree.$.profile.enabled()}`
    );

    expect(label()).toBe('Alice|true');

    prototype.tree.$.profile.name.set('Alicia');
    expect(label()).toBe('Alicia|true');

    prototype.tree.$.profile.enabled.set(false);
    expect(label()).toBe('Alicia|false');
  });

  it('reruns effects when a token-backed leaf changes', async () => {
    const prototype = createSlotTokenTreePrototype({ a: 'A', b: true });
    const seen: string[] = [];

    TestBed.runInInjectionContext(() => {
      effect(() => {
        seen.push(prototype.tree.$.a());
      });
    });

    TestBed.flushEffects();
    prototype.tree.$.a.set('A2');
    TestBed.flushEffects();

    expect(seen).toEqual(['A', 'A2']);
  });

  it('does not invalidate an a-only computed when b changes', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
      settings: { theme: 'light' },
    });
    let runs = 0;
    const aOnly = computed(() => {
      runs++;
      return prototype.tree.$.profile.name();
    });

    expect(aOnly()).toBe('Alice');
    expect(runs).toBe(1);

    prototype.tree.$.settings.theme.set('dark');

    expect(aOnly()).toBe('Alice');
    expect(runs).toBe(1);
  });

  it('commits slot frames atomically without exposing a partial pair', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const name = prototype.tree.$.profile.name;
    const enabled = prototype.tree.$.profile.enabled;
    const pair = computed(() => `${name()}|${enabled()}`);
    const frame = prototype.beginFrame();

    frame.set(name, 'Alicia');
    frame.set(enabled, false);

    expect(pair()).toBe('Alice|true');

    frame.commit();

    expect(pair()).toBe('Alicia|false');
    expect(prototype.publicationCount()).toBe(1);
  });

  it('deduplicates repeated staged writes to one slot and publishes once', () => {
    const prototype = createSlotTokenTreePrototype({ a: 'A', b: true });
    const a = prototype.tree.$.a;
    let runs = 0;
    const consumer = computed(() => {
      runs++;
      return a();
    });

    expect(consumer()).toBe('A');
    expect(runs).toBe(1);

    const frame = prototype.beginFrame();
    frame.set(a, 'B');
    frame.set(a, 'C');
    frame.update(a, () => 'D');
    frame.commit();

    expect(consumer()).toBe('D');
    expect(runs).toBe(2);
    expect(prototype.publicationCount()).toBe(1);
  });

  it('keeps ordinary writes on the same revisioned path and stales open frames', () => {
    const prototype = createSlotTokenTreePrototype({ a: 'A', b: true });
    const frame = prototype.beginFrame();

    frame.set(prototype.tree.$.a, 'A2');
    prototype.tree.$.b.set(false);

    expect(prototype.revision()).toBe(1);
    expect(() => frame.commit()).toThrow(StaleSlotTokenFrameError);
    expect(prototype.tree()).toEqual({ a: 'A', b: false });
  });

  it('keeps stable leaf identity across sibling writes and atomic frame publication', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
    });
    const name = prototype.tree.$.profile.name;
    const enabled = prototype.tree.$.profile.enabled;

    enabled.set(false);
    expect(prototype.tree.$.profile.name).toBe(name);

    const frame = prototype.beginFrame();
    frame.set(name, 'Alicia');
    frame.set(enabled, true);
    frame.commit();

    expect(prototype.tree.$.profile.name).toBe(name);
    expect(name()).toBe('Alicia');
    expect(enabled()).toBe(true);
  });

  it('still behaves like a tree accessor for root and branch reads', () => {
    const prototype = createSlotTokenTreePrototype({
      profile: { name: 'Alice', enabled: true },
      settings: { theme: 'light' },
    });

    expect(prototype.tree()).toEqual({
      profile: { name: 'Alice', enabled: true },
      settings: { theme: 'light' },
    });
    expect(prototype.tree.$.profile()).toEqual({ name: 'Alice', enabled: true });
  });

  it('works in an OnPush zoneless template through indirect token reads', async () => {
    const prototype = createSlotTokenTreePrototype({ a: 'A', b: true });
    activeTemplateTree = prototype.tree;

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('A|true');

    prototype.tree.$.a.set('A2');
    await stable();
    prototype.tree.$.b.set(false);
    await stable();

    expect(fixture.nativeElement.textContent.trim()).toBe('A2|false');
  });

  it('separately reports Angular signal identity compatibility', () => {
    const prototype = createSlotTokenTreePrototype({ a: 'A', b: true });

    expect(isSignal(prototype.tree.$.a)).toBe(false);
    expect(typeof prototype.tree.$.a.set).toBe('function');
    expect(typeof prototype.tree.$.a.update).toBe('function');
  });
});
