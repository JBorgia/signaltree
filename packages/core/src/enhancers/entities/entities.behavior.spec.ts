import { describe, expect, it } from 'vitest';

import { entityMap, signalTree } from '../..';
import { entities } from './entities';

describe('entities enhancer (removed)', () => {
  it('should throw a helpful error explaining removal', () => {
    expect(() => {
      // @ts-ignore - assert runtime behavior
      signalTree({ users: entityMap<{ id: number }, number>() }).with(
        entities()
      );
    }).toThrow(/entities\(\) has been removed/i);
  });

  it('should continue to work without calling entities()', () => {
    const tree = signalTree({ users: entityMap<{ id: number }, number>() });

    tree.$.users.upsertOne({ id: 1 });

    expect(tree.$.users.all()).toEqual([{ id: 1 }]);
  });
});
