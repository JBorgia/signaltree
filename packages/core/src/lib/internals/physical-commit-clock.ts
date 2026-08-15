import { isTraversableNode } from '../utils';

const PHYSICAL_COMMIT_CLOCK = Symbol.for('SignalTree:PhysicalCommitClock');

export interface PhysicalCommitClock {
  revision(): number;
  advance(): number;
}

export function createPhysicalCommitClock(): PhysicalCommitClock {
  let revision = 0;

  return {
    revision(): number {
      return revision;
    },
    advance(): number {
      revision += 1;
      return revision;
    },
  };
}

export function definePhysicalCommitClock(
  node: object,
  clock: PhysicalCommitClock
): void {
  Object.defineProperty(node, PHYSICAL_COMMIT_CLOCK, {
    value: clock,
    enumerable: false,
    configurable: true,
  });
}

export function getPhysicalCommitClock(
  node: unknown
): PhysicalCommitClock | undefined {
  if (!isTraversableNode(node)) {
    return undefined;
  }

  return (node as Record<symbol, PhysicalCommitClock | undefined>)[
    PHYSICAL_COMMIT_CLOCK
  ];
}
