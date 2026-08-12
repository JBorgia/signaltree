import { describe, expect, it } from 'vitest';

import {
  createPositionIdentityPrototype,
  type PositionId,
} from '../../scripts/position-identity-prototype';

describe('position identity prototype', () => {
  it('keeps retained identity stable across changeId and path reuse', () => {
    const positions = createPositionIdentityPrototype();

    const p1 = positions.materialize('rows.7');
    const beforeRekey = positions.recordMutation('rows.7', 'rows.7.value');

    positions.changePath('rows.7', 'rows.42');

    const p2 = positions.materialize('rows.7');
    const afterReuse = positions.recordMutation('rows.7', 'rows.7.value');

    expect(beforeRekey.owner).toBe(p1.id);
    expect(afterReuse.owner).toBe(p2.id);
    expect(p2.id).not.toBe(p1.id);
    expect(positions.currentPath(p1.id)).toBe('rows.42');
    expect(positions.currentPath(p2.id)).toBe('rows.7');
  });

  it('distinguishes removed positions from later occupants of the same path', () => {
    const positions = createPositionIdentityPrototype();

    const p1 = positions.materialize('rows.7');
    const retained = positions.recordMutation('rows.7', 'rows.7');

    const removedId = positions.remove('rows.7');
    const p2 = positions.materialize('rows.7');
    const laterWrite = positions.recordMutation('rows.7', 'rows.7');

    expect(removedId).toBe(p1.id);
    expect(retained.owner).toBe(p1.id);
    expect(laterWrite.owner).toBe(p2.id);
    expect(p2.id).not.toBe(p1.id);
    expect(positions.currentPath(p1.id)).toBeUndefined();
    expect(positions.currentPath(p2.id)).toBe('rows.7');
    expect(positions.hasIdentity(p1.id)).toBe(true);
  });

  it('never reuses the identity of a rekeyed-and-removed position', () => {
    const positions = createPositionIdentityPrototype();

    const p1 = positions.materialize('rows.7');
    positions.changePath('rows.7', 'rows.42');
    const rekeyedWrite = positions.recordMutation('rows.42', 'rows.42.value');

    positions.remove('rows.42');

    const p3 = positions.materialize('rows.42');
    const reusedDestinationWrite = positions.recordMutation('rows.42', 'rows.42.value');

    expect(rekeyedWrite.owner).toBe(p1.id);
    expect(reusedDestinationWrite.owner).toBe(p3.id);
    expect(p3.id).not.toBe(p1.id);
    expect(positions.currentPath(p1.id)).toBeUndefined();
    expect(positions.currentPath(p3.id)).toBe('rows.42');
  });

  it('gives retained and live observers the same owner until path reuse creates a new occupant', () => {
    const positions = createPositionIdentityPrototype();

    const p1 = positions.materialize('rows.7');
    const recordedBeforeRekey = positions.recordMutation('rows.7', 'rows.7.value');
    const liveBeforeRekey = positions.observeOwner('rows.7');

    positions.changePath('rows.7', 'rows.42');

    const liveAfterRekey = positions.observeOwner('rows.42');
    positions.materialize('rows.7');
    const liveAfterReuse = positions.observeOwner('rows.7');

    expect(recordedBeforeRekey.owner).toBe(p1.id);
    expect(liveBeforeRekey).toBe(p1.id);
    expect(liveAfterRekey).toBe(p1.id);
    expect(liveAfterReuse).not.toBe(p1.id);
    expect(liveAfterReuse).toBeGreaterThan(p1.id);
  });

  it('uses durable opaque ids rather than path strings', () => {
    const positions = createPositionIdentityPrototype();

    const ids: PositionId[] = [
      positions.materialize('rows.7').id,
      positions.materialize('rows.8').id,
    ];

    expect(ids).toEqual([1, 2]);
  });
});
