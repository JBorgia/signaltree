import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import type { ISignalTree } from '../types';

import { getOwnedPositionIds } from './owned-mutation';
import {
  createTreeScalarSlotRuntime,
  getTreeScalarSlotRuntime,
} from './tree-scalar-slot-runtime';

describe('tree scalar slot runtime', () => {
  it('keeps the same PositionId bound to the same SlotIndex across scalar writes', () => {
    const tree = signalTree({ profile: { name: 'Alice', enabled: true } }) as ISignalTree<{
      profile: {
        name: { (): string; set(value: string): void };
        enabled: { (): boolean; set(value: boolean): void };
      };
    }>;

    const runtime = getTreeScalarSlotRuntime(tree.$);
    if (!runtime) {
      throw new Error('Expected scalar slot runtime');
    }

    const positionId = getOwnedPositionIds(tree.$.profile.name)?.[0];
    if (positionId === undefined) {
      throw new Error('Expected owned position for profile.name');
    }

    const before = runtime.resolveScalarSlot(positionId);
    tree.$.profile.name.set('Alicia');
    tree.$.profile.name.set('Ally');
    const after = runtime.resolveScalarSlot(positionId);

    expect(before).toBeDefined();
    expect(after).toBe(before);
  });

  it('binds different PositionIds to different live scalar slots', () => {
    const tree = signalTree({ profile: { name: 'Alice' }, settings: { enabled: true } }) as ISignalTree<{
      profile: {
        name: { (): string; set(value: string): void };
      };
      settings: {
        enabled: { (): boolean; set(value: boolean): void };
      };
    }>;

    const runtime = getTreeScalarSlotRuntime(tree.$);
    if (!runtime) {
      throw new Error('Expected scalar slot runtime');
    }

    const namePositionId = getOwnedPositionIds(tree.$.profile.name)?.[0];
    const enabledPositionId = getOwnedPositionIds(tree.$.settings.enabled)?.[0];
    if (namePositionId === undefined || enabledPositionId === undefined) {
      throw new Error('Expected owned scalar positions');
    }

    expect(runtime.resolveScalarSlot(namePositionId)).not.toBe(
      runtime.resolveScalarSlot(enabledPositionId)
    );
  });

  it('preserves semantic PositionId and SlotIndex across parent rewrites of the same scalar path', () => {
    const tree = signalTree({ profile: { name: 'Alice', enabled: true } }) as ISignalTree<{
      profile: {
        (): { name: string; enabled: boolean };
        name: { (): string; set(value: string): void };
        enabled: { (): boolean; set(value: boolean): void };
      };
    }>;

    const runtime = getTreeScalarSlotRuntime(tree.$);
    if (!runtime) {
      throw new Error('Expected scalar slot runtime');
    }

    const beforePositionId = getOwnedPositionIds(tree.$.profile.name)?.[0];
    if (beforePositionId === undefined) {
      throw new Error('Expected owned position for profile.name');
    }

    const beforeSlot = runtime.resolveScalarSlot(beforePositionId);
    tree.$.profile({ name: 'Alicia', enabled: false });

    const afterPositionId = getOwnedPositionIds(tree.$.profile.name)?.[0];
    const afterSlot = afterPositionId === undefined
      ? undefined
      : runtime.resolveScalarSlot(afterPositionId);

    expect(afterPositionId).toBe(beforePositionId);
    expect(afterSlot).toBe(beforeSlot);
    expect(tree.$.profile.name()).toBe('Alicia');
    expect(tree.$.profile.enabled()).toBe(false);
  });

  it('leaves all slot values and revision untouched when a later equality check throws during frame commit', () => {
    const runtime = createTreeScalarSlotRuntime();
    const stable = runtime.createLeaf('A', Object.is);
    const throwsOnChange = runtime.createLeaf('B', (current, next) => {
      if (!Object.is(current, next)) {
        throw new Error('equality exploded');
      }

      return true;
    });

    const frame = runtime.beginFrame();
    frame.set(0, 'A2');
    frame.set(1, 'B2');

    expect(() => frame.commit()).toThrow('equality exploded');
    expect(stable()).toBe('A');
    expect(throwsOnChange()).toBe('B');
    expect(runtime.revision()).toBe(0);
  });
});
