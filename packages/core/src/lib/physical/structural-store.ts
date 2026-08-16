import { recordProductionSubstrateStat } from '../internals/production-substrate-stats';

export type SubjectLifetimeRecord<K extends string | number> = {
  active: boolean;
  key?: K;
  restoreAllowed: boolean;
};

type ActiveNode<K extends string | number> = {
  key: K;
  subjectId: number;
  prev: ActiveNode<K> | undefined;
  next: ActiveNode<K> | undefined;
};

export class StructuralStore<K extends string | number> {
  private readonly subjectIds = new Map<K, number>();
  private readonly subjectStates = new Map<number, SubjectLifetimeRecord<K>>();
  private readonly subjectRevisions = new Map<number, number>();
  private readonly activeNodesByKey = new Map<K, ActiveNode<K>>();
  private readonly activeNodesBySubject = new Map<number, ActiveNode<K>>();
  private nextSubjectId = 1;
  private activeHead: ActiveNode<K> | undefined;
  private activeTail: ActiveNode<K> | undefined;
  private activeCount = 0;

  planFreshSubjectIds(count: number): readonly number[] {
    return Array.from({ length: count }, (_, index) => this.nextSubjectId + index);
  }

  allocateFreshSubjectId(): number {
    const subjectId = this.nextSubjectId;
    this.nextSubjectId += 1;
    return subjectId;
  }

  subjectIdForKey(key: K): number | undefined {
    return this.subjectIds.get(key);
  }

  stateForSubject(subjectId: number): SubjectLifetimeRecord<K> | undefined {
    return this.subjectStates.get(subjectId);
  }

  hasSubject(subjectId: number): boolean {
    return this.subjectStates.has(subjectId);
  }

  subjectRevision(subjectId: number): number {
    return this.subjectRevisions.get(subjectId) ?? 0;
  }

  bumpSubjectRevision(subjectId: number): void {
    this.subjectRevisions.set(subjectId, this.subjectRevision(subjectId) + 1);
  }

  activeKeyForSubject(subjectId: number): K | undefined {
    const state = this.stateForSubject(subjectId);
    return state?.active ? state.key : undefined;
  }

  hasActiveKey(key: K): boolean {
    return this.subjectIds.has(key);
  }

  activeKeyCount(): number {
    return this.activeCount;
  }

  activeKeysSnapshot(): readonly K[] {
    const keys: K[] = [];
    for (let node = this.activeHead; node !== undefined; node = node.next) {
      keys.push(node.key);
    }
    return keys;
  }

  firstActiveKey(): K | undefined {
    return this.activeHead?.key;
  }

  moveKeysToFront(keys: readonly K[]): void {
    const nodes = keys
      .map((key) => this.activeNodesByKey.get(key))
      .filter((node): node is ActiveNode<K> => node !== undefined);

    for (const node of nodes) {
      this.detachNode(node);
    }

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      this.prependDetachedNode(nodes[index]);
    }
  }

  reorderActiveKeys(keys: readonly K[]): void {
    this.activeHead = undefined;
    this.activeTail = undefined;

    for (const node of this.activeNodesByKey.values()) {
      node.prev = undefined;
      node.next = undefined;
    }

    let nextCount = 0;
    for (const key of keys) {
      const node = this.activeNodesByKey.get(key);
      if (node === undefined) {
        continue;
      }

      this.appendDetachedNode(node);
      nextCount += 1;
    }

    this.activeCount = nextCount;
  }

  restoreIndexForSubjects(
    beforeSubject?: number,
    afterSubject?: number
  ): number {
    const beforeNode =
      beforeSubject === undefined
        ? undefined
        : this.activeNodesBySubject.get(beforeSubject);
    const afterNode =
      afterSubject === undefined
        ? undefined
        : this.activeNodesBySubject.get(afterSubject);

    if (beforeNode !== undefined && afterNode !== undefined) {
      if (this.nodePrecedes(beforeNode, afterNode)) {
        return this.indexOfNode(beforeNode) + 1;
      }
      return this.indexOfNode(afterNode);
    }

    if (afterNode !== undefined) {
      return this.indexOfNode(afterNode);
    }

    if (beforeNode !== undefined) {
      return this.indexOfNode(beforeNode) + 1;
    }

    return this.activeCount;
  }

  neighborSubjectsForKey(key: K): {
    beforeSubject?: number;
    afterSubject?: number;
  } {
    const node = this.activeNodesByKey.get(key);
    if (node === undefined) {
      return {};
    }

    return {
      beforeSubject: node.prev?.subjectId,
      afterSubject: node.next?.subjectId,
    };
  }

  tombstonedSubjectsSnapshot(): readonly number[] {
    return [...this.subjectStates.entries()]
      .filter(([, subjectState]) => !subjectState.active)
      .map(([subjectId]) => subjectId)
      .sort((left, right) => left - right);
  }

  createSubject(subjectId: number, key: K): void {
    recordProductionSubstrateStat('structuralSubjectsCreated');
    this.nextSubjectId = Math.max(this.nextSubjectId, subjectId + 1);
    this.activateSubject(subjectId, key);
    this.subjectRevisions.set(subjectId, 0);
    this.createAndAppendActiveNode(subjectId, key);
  }

  transferSubject(subjectId: number, from: K, to: K, restoreAllowed = true): void {
    recordProductionSubstrateStat('structuralSubjectTransfers');
    const node = this.activeNodesByKey.get(from);
    this.subjectIds.delete(from);
    this.activateSubject(subjectId, to, restoreAllowed);

    if (node === undefined) {
      this.createAndAppendActiveNode(subjectId, to);
      return;
    }

    this.activeNodesByKey.delete(from);
    node.key = to;
    this.activeNodesByKey.set(to, node);
    this.activeNodesBySubject.set(subjectId, node);
  }

  tombstoneSubject(subjectId: number, key: K, restoreAllowed: boolean): void {
    recordProductionSubstrateStat('structuralSubjectTombstones');
    this.subjectIds.delete(key);

    const node = this.activeNodesByKey.get(key);
    if (node !== undefined) {
      this.unregisterActiveNode(node);
      this.detachNode(node);
      this.activeCount -= 1;
    }

    this.subjectStates.set(subjectId, {
      active: false,
      restoreAllowed,
    });
  }

  restoreSubject(
    subjectId: number,
    key: K,
    beforeSubject?: number,
    afterSubject?: number,
    restoreAllowed = true
  ): void {
    this.activateSubject(subjectId, key, restoreAllowed);

    const node: ActiveNode<K> = {
      key,
      subjectId,
      prev: undefined,
      next: undefined,
    };

    this.activeNodesByKey.set(key, node);
    this.activeNodesBySubject.set(subjectId, node);
    this.activeCount += 1;

    const beforeNode =
      beforeSubject === undefined
        ? undefined
        : this.activeNodesBySubject.get(beforeSubject);
    const afterNode =
      afterSubject === undefined
        ? undefined
        : this.activeNodesBySubject.get(afterSubject);

    if (beforeNode !== undefined && afterNode !== undefined) {
      if (this.nodePrecedes(beforeNode, afterNode)) {
        this.insertDetachedNodeAfter(node, beforeNode);
      } else {
        this.insertDetachedNodeBefore(node, afterNode);
      }
      return;
    }

    if (afterNode !== undefined) {
      this.insertDetachedNodeBefore(node, afterNode);
      return;
    }

    if (beforeNode !== undefined) {
      this.insertDetachedNodeAfter(node, beforeNode);
      return;
    }

    this.appendDetachedNode(node);
  }

  retireSubject(subjectId: number): void {
    this.subjectStates.set(subjectId, {
      active: false,
      restoreAllowed: false,
    });
  }

  clear(): void {
    this.subjectIds.clear();
    this.subjectStates.clear();
    this.subjectRevisions.clear();
    this.activeNodesByKey.clear();
    this.activeNodesBySubject.clear();
    this.activeHead = undefined;
    this.activeTail = undefined;
    this.activeCount = 0;
    this.nextSubjectId = 1;
  }

  __assertActiveOrderIntegrityForTesting(): void {
    if (this.activeHead?.prev !== undefined) {
      throw new Error('Active head must not have a previous node.');
    }

    if (this.activeTail?.next !== undefined) {
      throw new Error('Active tail must not have a next node.');
    }

    const reachableKeys = new Set<K>();
    const reachableSubjects = new Set<number>();
    let previous: ActiveNode<K> | undefined;
    let count = 0;
    let node = this.activeHead;

    while (node !== undefined) {
      if (node.prev !== previous) {
        throw new Error('Broken prev link in active node chain.');
      }

      if (previous !== undefined && previous.next !== node) {
        throw new Error('Broken next link in active node chain.');
      }

      if (reachableKeys.has(node.key)) {
        throw new Error(`Duplicate reachable key ${String(node.key)}.`);
      }

      if (reachableSubjects.has(node.subjectId)) {
        throw new Error(`Duplicate reachable subject ${String(node.subjectId)}.`);
      }

      if (this.activeNodesByKey.get(node.key) !== node) {
        throw new Error(`Key lookup mismatch for ${String(node.key)}.`);
      }

      if (this.activeNodesBySubject.get(node.subjectId) !== node) {
        throw new Error(`Subject lookup mismatch for ${String(node.subjectId)}.`);
      }

      if (this.subjectIds.get(node.key) !== node.subjectId) {
        throw new Error(`Subject id mapping mismatch for key ${String(node.key)}.`);
      }

      const state = this.subjectStates.get(node.subjectId);
      if (!state?.active || state.key !== node.key) {
        throw new Error(`Active state mismatch for subject ${String(node.subjectId)}.`);
      }

      reachableKeys.add(node.key);
      reachableSubjects.add(node.subjectId);
      count += 1;
      previous = node;
      node = node.next;
    }

    if (previous !== this.activeTail) {
      throw new Error('Active tail does not match the reachable chain tail.');
    }

    if (count !== this.activeCount) {
      throw new Error('Active count does not match the reachable chain size.');
    }

    if (this.activeNodesByKey.size !== count) {
      throw new Error('Active key index size does not match reachable node count.');
    }

    if (this.activeNodesBySubject.size !== count) {
      throw new Error('Active subject index size does not match reachable node count.');
    }
  }

  private createAndAppendActiveNode(subjectId: number, key: K): void {
    const node: ActiveNode<K> = {
      key,
      subjectId,
      prev: undefined,
      next: undefined,
    };

    this.activeNodesByKey.set(key, node);
    this.activeNodesBySubject.set(subjectId, node);
    this.appendDetachedNode(node);
    this.activeCount += 1;
  }

  private unregisterActiveNode(node: ActiveNode<K>): void {
    this.activeNodesByKey.delete(node.key);
    this.activeNodesBySubject.delete(node.subjectId);
  }

  private prependDetachedNode(node: ActiveNode<K>): void {
    node.prev = undefined;
    node.next = this.activeHead;
    if (this.activeHead !== undefined) {
      this.activeHead.prev = node;
    } else {
      this.activeTail = node;
    }
    this.activeHead = node;
  }

  private appendDetachedNode(node: ActiveNode<K>): void {
    node.next = undefined;
    node.prev = this.activeTail;
    if (this.activeTail !== undefined) {
      this.activeTail.next = node;
    } else {
      this.activeHead = node;
    }
    this.activeTail = node;
  }

  private insertDetachedNodeAfter(node: ActiveNode<K>, anchor: ActiveNode<K>): void {
    node.prev = anchor;
    node.next = anchor.next;
    if (anchor.next !== undefined) {
      anchor.next.prev = node;
    } else {
      this.activeTail = node;
    }
    anchor.next = node;
  }

  private insertDetachedNodeBefore(node: ActiveNode<K>, anchor: ActiveNode<K>): void {
    node.next = anchor;
    node.prev = anchor.prev;
    if (anchor.prev !== undefined) {
      anchor.prev.next = node;
    } else {
      this.activeHead = node;
    }
    anchor.prev = node;
  }

  private detachNode(node: ActiveNode<K>): void {
    if (node.prev !== undefined) {
      node.prev.next = node.next;
    } else {
      this.activeHead = node.next;
    }

    if (node.next !== undefined) {
      node.next.prev = node.prev;
    } else {
      this.activeTail = node.prev;
    }

    node.prev = undefined;
    node.next = undefined;
  }

  private nodePrecedes(left: ActiveNode<K>, right: ActiveNode<K>): boolean {
    let node: ActiveNode<K> | undefined = left;
    while (node !== undefined) {
      if (node === right) {
        return true;
      }
      node = node.next;
    }

    return false;
  }

  private indexOfNode(target: ActiveNode<K>): number {
    let index = 0;
    let node = this.activeHead;
    while (node !== undefined) {
      if (node === target) {
        return index;
      }
      index += 1;
      node = node.next;
    }

    return -1;
  }

  private activateSubject(subjectId: number, key: K, restoreAllowed = true): void {
    this.subjectIds.set(key, subjectId);
    this.subjectStates.set(subjectId, {
      active: true,
      key,
      restoreAllowed,
    });
  }
}
