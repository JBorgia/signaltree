import { recordProductionSubstrateStat } from '../internals/production-substrate-stats';

import { EntityValueStore } from './entity-value-store';
import { StructuralStore } from './structural-store';

type ProjectionNode<K extends string | number, E extends Record<string, unknown>> = {
  key: K;
  value: E;
  previous?: ProjectionNode<K, E>;
  next?: ProjectionNode<K, E>;
};

export class MaterializedEntityProjection<
  K extends string | number,
  E extends Record<string, unknown>,
> {
  private readonly storage = new Map<K, ProjectionNode<K, E>>();
  private head?: ProjectionNode<K, E>;
  private tail?: ProjectionNode<K, E>;

  get(key: K): E | undefined {
    return this.storage.get(key)?.value;
  }

  *entries(): IterableIterator<[K, E]> {
    let current = this.head;
    while (current !== undefined) {
      yield [current.key, current.value];
      current = current.next;
    }
  }

  replaceEntry(key: K, value: E): void {
    recordProductionSubstrateStat('projectionReplacements');
    const existing = this.storage.get(key);
    if (existing !== undefined) {
      existing.value = value;
      return;
    }

    this.appendNode(key, value);
  }

  appendEntry(key: K, value: E): void {
    recordProductionSubstrateStat('projectionAppends');
    const existing = this.storage.get(key);
    if (existing !== undefined) {
      existing.value = value;
      return;
    }

    this.appendNode(key, value);
  }

  rekeyEntry(fromKey: K, toKey: K): void {
    recordProductionSubstrateStat('projectionRekeys');
    const existing = this.storage.get(fromKey);
    if (existing === undefined) {
      return;
    }

    this.storage.delete(fromKey);
    existing.key = toKey;
    this.storage.set(toKey, existing);
  }

  restoreEntry(
    key: K,
    value: E,
    options?: { beforeKey?: K; afterKey?: K }
  ): void {
    recordProductionSubstrateStat('projectionRestores');
    const existing = this.storage.get(key);
    if (existing !== undefined) {
      existing.value = value;
      return;
    }

    const node: ProjectionNode<K, E> = {
      key,
      value,
    };

    const beforeNode =
      options?.beforeKey === undefined
        ? undefined
        : this.storage.get(options.beforeKey);
    const afterNode =
      options?.afterKey === undefined
        ? undefined
        : this.storage.get(options.afterKey);

    if (beforeNode !== undefined) {
      this.insertNodeAfter(node, beforeNode);
    } else if (afterNode !== undefined) {
      this.insertNodeBefore(node, afterNode);
    } else {
      this.appendDetachedNode(node);
    }

    this.storage.set(key, node);
  }

  removeEntry(key: K): void {
    recordProductionSubstrateStat('projectionRemovals');
    const existing = this.storage.get(key);
    if (existing === undefined) {
      return;
    }

    this.storage.delete(key);

    if (existing.previous !== undefined) {
      existing.previous.next = existing.next;
    } else {
      this.head = existing.next;
    }

    if (existing.next !== undefined) {
      existing.next.previous = existing.previous;
    } else {
      this.tail = existing.previous;
    }

    existing.previous = undefined;
    existing.next = undefined;
  }

  rebuild(
    structuralStore: StructuralStore<K>,
    valueStore: EntityValueStore<E>
  ): void {
    recordProductionSubstrateStat('projectionRebuilds');
    this.clear();
    for (const key of structuralStore.activeKeysSnapshot()) {
      recordProductionSubstrateStat('projectionEntriesVisited');
      const subjectId = structuralStore.subjectIdForKey(key);
      const value =
        subjectId === undefined
          ? undefined
          : valueStore.backingForSubject(subjectId);
      if (value !== undefined) {
        this.appendNode(key, value);
      }
    }
  }

  snapshot(): ReadonlyMap<K, E> {
    return new Map(this.entries());
  }

  clearForTesting(): void {
    this.clear();
  }

  private appendNode(key: K, value: E): void {
    const node: ProjectionNode<K, E> = {
      key,
      value,
    };

    this.appendDetachedNode(node);
    this.storage.set(key, node);
  }

  private appendDetachedNode(node: ProjectionNode<K, E>): void {
    node.next = undefined;
    node.previous = this.tail;

    if (this.tail !== undefined) {
      this.tail.next = node;
    } else {
      this.head = node;
    }

    this.tail = node;
  }

  private insertNodeAfter(
    node: ProjectionNode<K, E>,
    anchor: ProjectionNode<K, E>
  ): void {
    node.previous = anchor;
    node.next = anchor.next;
    if (anchor.next !== undefined) {
      anchor.next.previous = node;
    } else {
      this.tail = node;
    }
    anchor.next = node;
  }

  private insertNodeBefore(
    node: ProjectionNode<K, E>,
    anchor: ProjectionNode<K, E>
  ): void {
    node.next = anchor;
    node.previous = anchor.previous;
    if (anchor.previous !== undefined) {
      anchor.previous.next = node;
    } else {
      this.head = node;
    }
    anchor.previous = node;
  }

  private clear(): void {
    this.storage.clear();
    this.head = undefined;
    this.tail = undefined;
  }
}
