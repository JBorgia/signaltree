import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form as ngForm } from '@angular/forms/signals';
import {
  signalTree,
  timeTravel,
  toWritableSignal,
  transactions,
} from '@signaltree/core';

// `getPathNotifier`/`resetPathNotifier` were deliberately dropped from the
// @signaltree/core root barrel in v12 (see packages/core/src/index.ts) — they
// are internals. This spec asserts that core's notifier fires for ng-forms
// branch models, which cannot be observed through the public API, so it reaches
// across the project boundary on purpose.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { getPathNotifier, resetPathNotifier } from '../../../core/src/lib/path-notifier';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
}

type ScopedAuthorityNode = {
  __positionIds?: number[];
};

type InternalTimeTravelManager = {
  undoAt(positionId: number): boolean;
  canUndoAt(positionId: number): boolean;
};

describe('greenfield Signal Forms branch-model spike', () => {
  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function create() {
    resetPathNotifier();
    const tree = signalTree({
      profile: {
        firstName: '',
        lastName: '',
        email: '',
      } as Profile,
    })
      .with(transactions())
      .with(timeTravel());
    const injector = TestBed.inject(Injector);
    const model = toWritableSignal(tree.$.profile, injector);
    const fieldTree = TestBed.runInInjectionContext(() => ngForm(model));
    const notifier = getPathNotifier();
    const turnStore = (tree as unknown as {
      __timeTravel: { getHistory(): Array<{ __effects?: Array<unknown> }> };
    }).__timeTravel;

    return { tree, fieldTree, notifier, turnStore };
  }

  it('keeps one model while field edits flow into SignalTree history', async () => {
    const { tree, fieldTree, turnStore } = create();

    fieldTree.firstName().value.set('Ada');
    await stable();

    expect(tree.$.profile.firstName()).toBe('Ada');

    const latestTurn = turnStore.getHistory().at(-1) as {
      __effects?: Array<{ path: string; ownerPath: string; position: number }>;
    };

    expect(latestTurn.__effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'profile.firstName',
          ownerPath: 'profile.firstName',
        }),
      ])
    );
  });

  it('groups multiple field edits into one turn while preserving descendant owner positions', async () => {
    const { tree, fieldTree, turnStore } = create();

    const pending = tree.transaction(() => {
      fieldTree.firstName().value.set('Ada');
      fieldTree.lastName().value.set('Lovelace');
    });
    await stable();

    expect(tree.$.profile()).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: '',
    });

    pending.confirm();
    await stable();

    const latestTurn = turnStore.getHistory().at(-1) as {
      __effects?: Array<{ path: string; ownerPath: string; position: number }>;
    };
    const profilePositionId = ((tree.$.profile as unknown as { __positionIds?: number[] }).__positionIds ?? [])[0];
    const positions = [...new Set(latestTurn.__effects?.map((effect) => effect.position) ?? [])];

    expect(latestTurn.__effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'profile.firstName',
          ownerPath: 'profile.firstName',
        }),
        expect.objectContaining({
          path: 'profile.lastName',
          ownerPath: 'profile.lastName',
        }),
      ])
    );
    expect(positions).toHaveLength(2);
    expect(positions.every((positionId) => positionId !== profilePositionId)).toBe(true);
  });

  it('lets one pending transaction rollback through the same model', async () => {
    const { tree, fieldTree } = create();

    const pending = tree.transaction(() => {
      fieldTree.firstName().value.set('Ada');
      fieldTree.lastName().value.set('Lovelace');
    });
    await stable();

    pending.rollback();
    await stable();

    expect(tree.$.profile()).toEqual({
      firstName: '',
      lastName: '',
      email: '',
    });
    expect(fieldTree.firstName().value()).toBe('');
    expect(fieldTree.lastName().value()).toBe('');
  });

  it('does not emit Angular form state as SignalTree mutations', async () => {
    const { fieldTree, notifier } = create();
    const notifications: Array<{ path: string; ownerPath: string }> = [];

    const unsubscribe = notifier.subscribe(
      '**',
      (_next, _prev, path, ownerPath, source) => {
        if (source === 'time-travel') {
          return;
        }
        notifications.push({ path, ownerPath });
      }
    );

    fieldTree.firstName().value.set('Ada');
    await stable();
    void fieldTree.firstName().touched();
    void fieldTree.firstName().dirty();

    unsubscribe();

    expect(notifications.every((entry) => entry.path.startsWith('profile'))).toBe(
      true
    );
    expect(notifications.map((entry) => entry.path)).toContain('profile.firstName');
  });

  it('lets branch authority undo one multi-field turn and updates the bound Angular form immediately', async () => {
    const { tree, fieldTree } = create();
    const manager = (tree as any).__timeTravel as InternalTimeTravelManager;
    const profile = tree.$.profile as unknown as ScopedAuthorityNode;
    const firstName = tree.$.profile.firstName as unknown as ScopedAuthorityNode;
    const profilePositionId = profile.__positionIds?.[0] as number;
    const firstNamePositionId = firstName.__positionIds?.[0] as number;

    const pending = tree.transaction(() => {
      fieldTree.firstName().value.set('Ada');
      fieldTree.lastName().value.set('Lovelace');
    });
    await stable();
    pending.confirm();
    await stable();

    expect(manager.canUndoAt(firstNamePositionId)).toBe(false);
    expect(manager.canUndoAt(profilePositionId)).toBe(true);

    expect(manager.undoAt(profilePositionId)).toBe(true);
    await stable();

    expect(fieldTree.firstName().value()).toBe('');
    expect(fieldTree.lastName().value()).toBe('');
    expect(tree.$.profile()).toEqual({
      firstName: '',
      lastName: '',
      email: '',
    });
  });
});
