export type PositionId = number;

export interface LivePosition {
  id: PositionId;
  path: string;
}

export interface PositionMutationRecord {
  owner: PositionId;
  ownerPath: string;
  changedPath: string;
}

export interface PositionIdentityPrototype {
  materialize(path: string): LivePosition;
  changePath(fromPath: string, toPath: string): LivePosition;
  remove(path: string): PositionId;
  currentPath(id: PositionId): string | undefined;
  hasIdentity(id: PositionId): boolean;
  observeOwner(ownerPath: string): PositionId;
  recordMutation(ownerPath: string, changedPath: string): PositionMutationRecord;
}

export const createPositionIdentityPrototype = (): PositionIdentityPrototype => {
  let nextId = 1;
  const knownIds = new Set<PositionId>();
  const liveByPath = new Map<string, LivePosition>();
  const livePathById = new Map<PositionId, string>();

  const allocate = (path: string): LivePosition => {
    const position: LivePosition = { id: nextId++, path };
    knownIds.add(position.id);
    liveByPath.set(path, position);
    livePathById.set(position.id, path);
    return position;
  };

  return {
    materialize(path) {
      return liveByPath.get(path) ?? allocate(path);
    },

    changePath(fromPath, toPath) {
      const current = liveByPath.get(fromPath);
      if (!current) {
        throw new Error(`No live position at ${fromPath}`);
      }
      if (fromPath !== toPath && liveByPath.has(toPath)) {
        throw new Error(`Target path already occupied: ${toPath}`);
      }

      liveByPath.delete(fromPath);
      const next: LivePosition = { id: current.id, path: toPath };
      liveByPath.set(toPath, next);
      livePathById.set(next.id, toPath);
      return next;
    },

    remove(path) {
      const current = liveByPath.get(path);
      if (!current) {
        throw new Error(`No live position at ${path}`);
      }

      liveByPath.delete(path);
      livePathById.delete(current.id);
      return current.id;
    },

    currentPath(id) {
      return livePathById.get(id);
    },

    hasIdentity(id) {
      return knownIds.has(id);
    },

    observeOwner(ownerPath) {
      const owner = liveByPath.get(ownerPath);
      if (!owner) {
        throw new Error(`No live owner at ${ownerPath}`);
      }

      return owner.id;
    },

    recordMutation(ownerPath, changedPath) {
      const owner = liveByPath.get(ownerPath);
      if (!owner) {
        throw new Error(`No live owner at ${ownerPath}`);
      }

      return {
        owner: owner.id,
        ownerPath,
        changedPath,
      };
    },
  };
};
