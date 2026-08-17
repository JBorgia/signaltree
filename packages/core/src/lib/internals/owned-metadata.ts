import { isTraversableNode } from './node-shape';

/**
 * Owned-node METADATA: the read side of mutation ownership, and the WeakMap it
 * reads from.
 *
 * Framework-neutral by nature — every one of these is a property read or a
 * WeakMap lookup. They were unreachable from a neutral module only because they
 * shared a file with `runOwnedMutation` and `wrapOwnedWritableSignal`, which
 * call Angular's `untracked`.
 *
 * That co-location was the whole reason `interceptLeafSignals` looked
 * framework-bound: it imports ONLY these four getters from owned-mutation, and
 * none of the writing side. Splitting the file makes the SDK symbol neutral
 * without inventing a port, and without genericizing a framework primitive —
 * the operations it needs are "read this node's owned metadata", which is
 * SignalTree's own domain, not Angular's.
 *
 * `owned-mutation.ts` keeps the WRITE side and re-exports these, so nothing
 * about the public surface or the mutation path changes.
 */

export type OwnedNodeMetadata = {
  positionIds?: readonly number[];
  subjectIds?: readonly number[];
  ownerPath?: string;
  emitsMutations?: boolean;
};

export const OWNED_NODE_METADATA = new WeakMap<object, OwnedNodeMetadata>();

export function getOwnedPositionIds(node: unknown): number[] | undefined {
  if (isTraversableNode(node)) {
    const direct = (node as { __positionIds?: number[] }).__positionIds;
    if (direct) {
      return [...direct];
    }

    const sidecar = OWNED_NODE_METADATA.get(node as object)?.positionIds;
    return sidecar ? [...sidecar] : undefined;
  }

  return undefined;
}

export function getOwnedSubjectIds(node: unknown): number[] | undefined {
  if (isTraversableNode(node)) {
    const direct = (node as { __subjectIds?: number[] }).__subjectIds;
    if (direct) {
      return [...direct];
    }

    const sidecar = OWNED_NODE_METADATA.get(node as object)?.subjectIds;
    return sidecar ? [...sidecar] : undefined;
  }

  return undefined;
}

export function getOwnedOwnerPath(node: unknown): string | undefined {
  if (isTraversableNode(node)) {
    const direct = (node as { __ownerPath?: string }).__ownerPath;
    if (direct !== undefined) {
      return direct;
    }

    return OWNED_NODE_METADATA.get(node as object)?.ownerPath;
  }

  return undefined;
}

export function hasIntrinsicMutationEmitter(node: unknown): boolean {
  if (isTraversableNode(node)) {
    const direct = (node as { __emitsMutations?: boolean }).__emitsMutations;
    if (direct !== undefined) {
      return direct;
    }

    return OWNED_NODE_METADATA.get(node as object)?.emitsMutations === true;
  }

  return false;
}
