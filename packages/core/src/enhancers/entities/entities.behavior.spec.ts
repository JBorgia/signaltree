import { describe, expect, it, vi } from 'vitest';

import { entityMap, signalTree } from '../..';
import { entities } from './entities';

describe('entities enhancer', () => {
  it('should show deprecation warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    signalTree({
      users: entityMap<{ id: number }, number>(),
    }).with(entities());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('entities() enhancer is deprecated')
    );

    warnSpy.mockRestore();
  });

  it('should still work (backward compatible)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tree = signalTree({
      users: entityMap<{ id: number; name: string }, number>(),
    }).with(entities());

    tree.$.users.upsertOne({ id: 1, name: 'Alice' });

    expect(tree.$.users.all()).toEqual([{ id: 1, name: 'Alice' }]);
    expect(
      (tree as unknown as { __entitiesEnabled: boolean }).__entitiesEnabled
    ).toBe(true);
  });

  it('should mark tree as entities enabled', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tree = signalTree({
      users: entityMap<{ id: number }, number>(),
    }).with(entities());

    expect(
      (tree as unknown as { __entitiesEnabled: boolean }).__entitiesEnabled
    ).toBe(true);
  });
});
