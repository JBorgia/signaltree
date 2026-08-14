import { linkedSignal, signal, type Signal, type WritableSignal } from '@angular/core';

type StructuralKey = string | number;
type SubjectId = number;
type PositionId = number;
type SlotIndex = number;

type SubjectLifecycle = 'active' | 'tombstoned' | 'reclaimed';
type FacadeLifecycle = 'live' | 'tombstoned' | 'retired';

export type SubjectPhysicalResourceKind =
  | 'subject-record'
  | 'subject-id'
  | 'position-id'
  | 'slot-index'
  | 'activation-token'
  | 'value-token'
  | 'name-facade'
  | 'row-facade'
  | 'scalar-backing';

export type SubjectResourceInventory = {
  subjectId: SubjectId;
  lifecycle: SubjectLifecycle;
  present: readonly SubjectPhysicalResourceKind[];
};

export type SubjectReclamationPlan = {
  subjectId: SubjectId;
  eligible: boolean;
  retire: readonly SubjectPhysicalResourceKind[];
  retain: readonly SubjectPhysicalResourceKind[];
};

type Entry<K extends StructuralKey> = {
  key: K;
  subjectId: SubjectId;
  name: string;
};

type SubjectRecord<K extends StructuralKey> = {
  lifecycle: SubjectLifecycle;
  key?: K;
  positionId: PositionId;
  slotIndex: SlotIndex;
};

type NameFacade = Signal<string | undefined>;

export type RowFacade<K extends StructuralKey> = Signal<
  { id: K; name: string } | undefined
> & {
  readonly name: NameFacade;
};

export interface SubjectReclamationPrototype<K extends StructuralKey> {
  row(subjectId: SubjectId): RowFacade<K>;
  name(subjectId: SubjectId): NameFacade;
  lifecycle(subjectId: SubjectId): SubjectLifecycle;
  facadeLifecycle(subjectId: SubjectId): FacadeLifecycle;
  inventory(subjectId: SubjectId): SubjectResourceInventory;
  planReclamation(subjectId: SubjectId): SubjectReclamationPlan;
  keyForSubject(subjectId: SubjectId): K | undefined;
  subjectForKey(key: K): SubjectId | undefined;
  slotIndexForSubject(subjectId: SubjectId): SlotIndex | undefined;
  positionIdForSubject(subjectId: SubjectId): PositionId | undefined;
  hasBackingState(subjectId: SubjectId): boolean;
  remove(subjectId: SubjectId, fromKey: K): void;
  reclaim(subjectId: SubjectId): void;
  restore(subjectId: SubjectId, toKey: K): void;
  addFresh(key: K, name: string): SubjectId;
}

const RESOURCE_ORDER: readonly SubjectPhysicalResourceKind[] = [
  'subject-record',
  'subject-id',
  'position-id',
  'slot-index',
  'activation-token',
  'value-token',
  'name-facade',
  'row-facade',
  'scalar-backing',
];

const CONSERVATIVE_RETIRED_RESOURCES = new Set<SubjectPhysicalResourceKind>([
  'scalar-backing',
]);

export function createSubjectReclamationPrototype<K extends StructuralKey>(
  entries: ReadonlyArray<Entry<K>>
): SubjectReclamationPrototype<K> {
  const keyToSubject = new Map<K, SubjectId>();
  const subjects = new Map<SubjectId, SubjectRecord<K>>();
  const scalarBacking = new Map<SubjectId, string>();
  const activationTokens = new Map<SubjectId, WritableSignal<number>>();
  const valueTokens = new Map<SubjectId, WritableSignal<number>>();
  const nameFacades = new Map<SubjectId, NameFacade>();
  const rowFacades = new Map<SubjectId, RowFacade<K>>();

  let nextSubjectId = 1;
  let nextPositionId = 1;
  let nextSlotIndex = 0;

  const ensureActivationToken = (subjectId: SubjectId): WritableSignal<number> => {
    let token = activationTokens.get(subjectId);
    if (!token) {
      token = signal(0);
      activationTokens.set(subjectId, token);
    }
    return token;
  };

  const ensureValueToken = (subjectId: SubjectId): WritableSignal<number> => {
    let token = valueTokens.get(subjectId);
    if (!token) {
      token = signal(0);
      valueTokens.set(subjectId, token);
    }
    return token;
  };

  const bumpActivation = (subjectId: SubjectId): void => {
    ensureActivationToken(subjectId).update((value) => value + 1);
  };

  const bumpValue = (subjectId: SubjectId): void => {
    ensureValueToken(subjectId).update((value) => value + 1);
  };

  const requireSubject = (subjectId: SubjectId): SubjectRecord<K> => {
    const record = subjects.get(subjectId);
    if (!record) {
      throw new Error(`Unknown subject ${String(subjectId)}.`);
    }
    return record;
  };

  const registerActiveSubject = (
    subjectId: SubjectId,
    key: K,
    name: string
  ): void => {
    if (keyToSubject.has(key)) {
      throw new Error(`Duplicate key ${String(key)}.`);
    }
    if (subjects.has(subjectId)) {
      throw new Error(`Duplicate subject ${String(subjectId)}.`);
    }

    keyToSubject.set(key, subjectId);
    subjects.set(subjectId, {
      lifecycle: 'active',
      key,
      positionId: nextPositionId++,
      slotIndex: nextSlotIndex++,
    });
    scalarBacking.set(subjectId, name);
    ensureActivationToken(subjectId);
    ensureValueToken(subjectId);
    nextSubjectId = Math.max(nextSubjectId, subjectId + 1);
  };

  for (const entry of entries) {
    registerActiveSubject(entry.subjectId, entry.key, entry.name);
  }

  const api: SubjectReclamationPrototype<K> = {
    row(subjectId: SubjectId): RowFacade<K> {
      const cached = rowFacades.get(subjectId);
      if (cached) {
        return cached;
      }

      const name = api.name(subjectId);
      const row = linkedSignal(() => {
        ensureActivationToken(subjectId)();
        const record = requireSubject(subjectId);
        if (record.lifecycle !== 'active' || record.key === undefined) {
          return undefined;
        }
        const currentName = name();
        if (currentName === undefined) {
          return undefined;
        }
        return { id: record.key, name: currentName };
      }) as unknown as RowFacade<K>;

      Object.defineProperty(row, 'name', {
        value: name,
        enumerable: true,
        configurable: true,
      });

      rowFacades.set(subjectId, row);
      return row;
    },
    name(subjectId: SubjectId): NameFacade {
      const cached = nameFacades.get(subjectId);
      if (cached) {
        return cached;
      }

      const facade = linkedSignal(() => {
        ensureActivationToken(subjectId)();
        const record = requireSubject(subjectId);
        if (record.lifecycle !== 'active') {
          return undefined;
        }

        ensureValueToken(subjectId)();
        return scalarBacking.get(subjectId);
      }) as NameFacade;

      nameFacades.set(subjectId, facade);
      return facade;
    },
    lifecycle(subjectId: SubjectId): SubjectLifecycle {
      return requireSubject(subjectId).lifecycle;
    },
    facadeLifecycle(subjectId: SubjectId): FacadeLifecycle {
      switch (requireSubject(subjectId).lifecycle) {
        case 'active':
          return 'live';
        case 'tombstoned':
          return 'tombstoned';
        case 'reclaimed':
          return 'retired';
      }
    },
    inventory(subjectId: SubjectId): SubjectResourceInventory {
      requireSubject(subjectId);

      const present = RESOURCE_ORDER.filter((resource) => {
        switch (resource) {
          case 'subject-record':
          case 'subject-id':
          case 'position-id':
          case 'slot-index':
            return subjects.has(subjectId);
          case 'activation-token':
            return activationTokens.has(subjectId);
          case 'value-token':
            return valueTokens.has(subjectId);
          case 'name-facade':
            return nameFacades.has(subjectId);
          case 'row-facade':
            return rowFacades.has(subjectId);
          case 'scalar-backing':
            return scalarBacking.has(subjectId);
        }
      });

      return {
        subjectId,
        lifecycle: api.lifecycle(subjectId),
        present,
      };
    },
    planReclamation(subjectId: SubjectId): SubjectReclamationPlan {
      const inventory = api.inventory(subjectId);
      if (inventory.lifecycle === 'reclaimed') {
        return {
          subjectId,
          eligible: false,
          retire: [],
          retain: [],
        };
      }

      if (inventory.lifecycle !== 'tombstoned') {
        return {
          subjectId,
          eligible: false,
          retire: [],
          retain: inventory.present,
        };
      }

      const retire = inventory.present.filter((resource) =>
        CONSERVATIVE_RETIRED_RESOURCES.has(resource)
      );
      const retain = inventory.present.filter(
        (resource) => !CONSERVATIVE_RETIRED_RESOURCES.has(resource)
      );

      return {
        subjectId,
        eligible: true,
        retire,
        retain,
      };
    },
    keyForSubject(subjectId: SubjectId): K | undefined {
      return requireSubject(subjectId).key;
    },
    subjectForKey(key: K): SubjectId | undefined {
      return keyToSubject.get(key);
    },
    slotIndexForSubject(subjectId: SubjectId): SlotIndex | undefined {
      return subjects.get(subjectId)?.slotIndex;
    },
    positionIdForSubject(subjectId: SubjectId): PositionId | undefined {
      return subjects.get(subjectId)?.positionId;
    },
    hasBackingState(subjectId: SubjectId): boolean {
      return scalarBacking.has(subjectId);
    },
    remove(subjectId: SubjectId, fromKey: K): void {
      const record = requireSubject(subjectId);
      if (record.lifecycle !== 'active' || record.key !== fromKey) {
        throw new Error(
          `Subject ${String(subjectId)} is not currently bound to key ${String(fromKey)}.`
        );
      }

      keyToSubject.delete(fromKey);
      record.lifecycle = 'tombstoned';
      record.key = undefined;
      bumpActivation(subjectId);
    },
    reclaim(subjectId: SubjectId): void {
      const record = requireSubject(subjectId);
      if (record.lifecycle !== 'tombstoned') {
        throw new Error(`Subject ${String(subjectId)} is not currently tombstoned.`);
      }

      const plan = api.planReclamation(subjectId);
      if (!plan.eligible) {
        throw new Error(`Subject ${String(subjectId)} is not eligible for reclamation.`);
      }

      for (const resource of plan.retire) {
        if (resource === 'scalar-backing') {
          scalarBacking.delete(subjectId);
        }
      }
      record.lifecycle = 'reclaimed';
      bumpActivation(subjectId);
      bumpValue(subjectId);
    },
    restore(subjectId: SubjectId, toKey: K): void {
      const record = requireSubject(subjectId);
      if (record.lifecycle === 'reclaimed') {
        throw new Error(`Subject ${String(subjectId)} has been reclaimed and cannot be restored.`);
      }
      if (record.lifecycle !== 'tombstoned') {
        throw new Error(`Subject ${String(subjectId)} is not currently tombstoned.`);
      }
      if (!scalarBacking.has(subjectId)) {
        throw new Error(`Subject ${String(subjectId)} has no retained backing state.`);
      }
      if (keyToSubject.has(toKey)) {
        throw new Error(`Key ${String(toKey)} is already occupied.`);
      }

      record.lifecycle = 'active';
      record.key = toKey;
      keyToSubject.set(toKey, subjectId);
      bumpActivation(subjectId);
    },
    addFresh(key: K, name: string): SubjectId {
      const subjectId = nextSubjectId++;
      registerActiveSubject(subjectId, key, name);
      return subjectId;
    },
  };

  return api;
}
