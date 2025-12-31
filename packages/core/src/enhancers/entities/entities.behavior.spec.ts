import { describe, expect, it } from 'vitest';

import { entities } from './entities';

function createFakeTree(initial: any) {
  let state = initial;
  const tree: any = function (arg?: any) {
    if (arguments.length === 0) return state;
    if (typeof arg === 'function') state = arg(state);
    else state = arg;
  };

  tree.state = state;
  return tree as unknown as any;
}

describe('entities enhancer', () => {
  it('materializes entity map markers and enables entities', () => {
    const marker = { __isEntityMap: true, __entityMapConfig: {} };
    const tree = createFakeTree({ users: marker });

    const enhanced = entities()(tree as any) as any;

    expect((enhanced as any).__entitiesEnabled).toBe(true);
    // materialize either replaces the marker with a signal-like object
    const users = enhanced().users;
    expect(users).not.toEqual(marker);
  });
});
