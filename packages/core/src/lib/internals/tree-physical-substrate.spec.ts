import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import type { ISignalTree } from '../types';

import { getOwnedPositionIds } from './owned-mutation';
import { getTreeScalarSlotRuntime } from './tree-scalar-slot-angular-runtime';

describe('tree physical substrate', () => {
  it('uses the slot-backed scalar substrate on the public signalTree path by default', () => {
    const tree = signalTree({ profile: { name: 'Alice' }, enabled: true }) as ISignalTree<{
      profile: {
        name: { (): string; set(value: string): void };
      };
      enabled: { (): boolean; set(value: boolean): void };
    }>;

    expect(getTreeScalarSlotRuntime(tree.$)).toBeDefined();
  });

  it('publishes reactive consequences only after a coherent slot-frame commit', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ a: 'A', b: 'B' }) as ISignalTree<{
        a: { (): string; set(value: string): void };
        b: { (): string; set(value: string): void };
      }>;
      const runtime = getTreeScalarSlotRuntime(tree.$);
      if (!runtime) {
        throw new Error('Expected scalar slot runtime on public signalTree path');
      }

      const aPositionId = getOwnedPositionIds(tree.$.a)?.[0];
      const bPositionId = getOwnedPositionIds(tree.$.b)?.[0];
      if (aPositionId === undefined || bPositionId === undefined) {
        throw new Error('Expected owned positions for scalar frame publication test');
      }

      const aSlot = runtime.resolveScalarSlot(aPositionId);
      const bSlot = runtime.resolveScalarSlot(bPositionId);
      if (aSlot === undefined || bSlot === undefined) {
        throw new Error('Expected slot bindings for scalar frame publication test');
      }

      const seen: string[] = [];
      effect(() => {
        seen.push(`${tree.$.a()}|${tree.$.b()}`);
      });
      TestBed.flushEffects();

      const frame = runtime.beginFrame();
      frame.set(aSlot, 'A2');
      frame.set(bSlot, 'B2');

      expect(tree.$.a()).toBe('A');
      expect(tree.$.b()).toBe('B');
      expect(seen).toEqual(['A|B']);

      frame.commit();

      expect(tree.$.a()).toBe('A2');
      expect(tree.$.b()).toBe('B2');
      expect(seen).toEqual(['A|B']);

      TestBed.flushEffects();

      expect(seen).toEqual(['A|B', 'A2|B2']);
    });
  });

  it('does not publish unchanged direct scalar writes and publishes exactly one changed slot write', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ a: 'A' }) as ISignalTree<{
        a: { (): string; set(value: string): void };
      }>;
      const runtime = getTreeScalarSlotRuntime(tree.$);
      if (!runtime) {
        throw new Error('Expected scalar slot runtime on public signalTree path');
      }

      const seen: string[] = [];
      effect(() => {
        seen.push(tree.$.a());
      });
      TestBed.flushEffects();

      const beforeRevision = runtime.revision();
      tree.$.a.set('A');
      TestBed.flushEffects();

      expect(runtime.revision()).toBe(beforeRevision);
      expect(seen).toEqual(['A']);

      tree.$.a.set('A2');
      expect(runtime.revision()).toBe(beforeRevision + 1);
      expect(seen).toEqual(['A']);

      TestBed.flushEffects();

      expect(tree.$.a()).toBe('A2');
      expect(seen).toEqual(['A', 'A2']);
    });
  });
});
