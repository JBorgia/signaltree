import { TestBed } from '@angular/core/testing';

import { signalTree } from '../../../lib/signal-tree';
import { computedEnhancer, createComputed } from './computed';

describe('Computed Enhancer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should enhance tree with computed capabilities', () => {
    const tree = signalTree({ count: 0 }).with(computedEnhancer());

    expect(tree.computed).toBeDefined();
  });

  it('should create computed signals that update reactively', () => {
    const tree = signalTree({ count: 0, multiplier: 2 }).with(
      computedEnhancer()
    );

    const doubled = tree.computed(
      (state) => (state as any).count() * (state as any).multiplier()
    );

    expect(doubled()).toBe(0);

    (tree.state as any).count.set(5);
    expect(doubled()).toBe(10);

    (tree.state as any).multiplier.set(3);
    expect(doubled()).toBe(15);
  });

  it('should handle complex computed expressions', () => {
    const tree = signalTree({
      firstName: 'John',
      lastName: 'Doe',
      age: 30,
    }).with(computedEnhancer());

    const fullName = tree.computed(
      (state) => `${(state as any).firstName()} ${(state as any).lastName()}`
    );

    const isAdult = tree.computed((state) => (state as any).age() >= 18);

    expect(fullName()).toBe('John Doe');
    expect(isAdult()).toBe(true);

    (tree.state as any).firstName.set('Jane');
    expect(fullName()).toBe('Jane Doe');

    (tree.state as any).age.set(16);
    expect(isAdult()).toBe(false);
  });

  it('should work with nested object properties', () => {
    const tree = signalTree({
      user: {
        profile: {
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    }).with(computedEnhancer());

    const fullName = tree.computed(
      (state) =>
        `${(state as any).user.profile.firstName()} ${(
          state as any
        ).user.profile.lastName()}`
    );

    expect(fullName()).toBe('John Doe');

    (tree.state as any).user.profile.firstName.set('Jane');
    expect(fullName()).toBe('Jane Doe');
  });

  it('should handle array computations', () => {
    const tree = signalTree({
      numbers: [1, 2, 3, 4, 5],
    }).with(computedEnhancer());

    const sum = tree.computed((state) =>
      (state as any)
        .numbers()
        .reduce((acc: number, num: number) => acc + num, 0)
    );

    const count = tree.computed((state) => (state as any).numbers().length);

    expect(sum()).toBe(15);
    expect(count()).toBe(5);

    (tree.state as any).numbers.set([1, 2, 3, 4, 5, 6]);
    expect(sum()).toBe(21);
    expect(count()).toBe(6);
  });
});

describe('createComputed utility', () => {
  it('should create computed signals from dependencies', () => {
    const a = signalTree({ value: 1 });
    const b = signalTree({ value: 2 });

    const sum = createComputed(
      [(a.state as any).value, (b.state as any).value],
      () => (a.state as any).value() + (b.state as any).value()
    );

    expect(sum()).toBe(3);

    (a.state as any).value.set(5);
    expect(sum()).toBe(7);

    (b.state as any).value.set(10);
    expect(sum()).toBe(15);
  });
});
