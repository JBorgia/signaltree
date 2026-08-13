import type { PositionId } from '../types';
import { isTraversableNode } from '../utils';

const POSITION_REGISTRY_SYMBOL = Symbol.for('SignalTree:PositionRegistry');

export interface PositionRegistry {
  allocate(parent?: PositionId): PositionId;
  parentOf(position: PositionId): PositionId | undefined;
  contains(authority: PositionId, participant: PositionId): boolean;
}

class TreePositionRegistry implements PositionRegistry {
  private nextPositionId = 1;
  private parents = new Map<PositionId, PositionId | undefined>();

  allocate(parent?: PositionId): PositionId {
    const positionId = this.nextPositionId++ as PositionId;
    this.parents.set(positionId, parent);
    return positionId;
  }

  parentOf(position: PositionId): PositionId | undefined {
    return this.parents.get(position);
  }

  contains(authority: PositionId, participant: PositionId): boolean {
    if (authority === participant) {
      return true;
    }

    const seen = new Set<PositionId>();
    let current: PositionId | undefined = participant;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      const parent = this.parentOf(current);
      if (parent === authority) {
        return true;
      }
      current = parent;
    }

    return false;
  }
}

export function createPositionRegistry(): PositionRegistry {
  return new TreePositionRegistry();
}

export function definePositionRegistry(
  node: object,
  registry: PositionRegistry
): void {
  Object.defineProperty(node, POSITION_REGISTRY_SYMBOL, {
    value: registry,
    enumerable: false,
    configurable: true,
  });
}

export function getPositionRegistry(
  node: unknown
): PositionRegistry | undefined {
  if (!isTraversableNode(node)) {
    return undefined;
  }

  return (node as Record<symbol, PositionRegistry | undefined>)[
    POSITION_REGISTRY_SYMBOL
  ];
}
