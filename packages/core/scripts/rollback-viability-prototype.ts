type PlainObject = Record<string, unknown>;
type PrototypeId = string | number;
type PrototypeRow<TId extends PrototypeId = PrototypeId> = { id: TId };

export type PrototypeScalarWrite = {
  kind: 'scalar';
  path: string;
  before: unknown;
  after: unknown;
};

export type PrototypeCollectionRemove<TRow extends PrototypeRow = PrototypeRow> = {
  kind: 'collection-remove';
  path: string;
  removed: TRow;
  removedId: TRow['id'];
  beforeIndex: number;
  prevId?: TRow['id'];
  nextId?: TRow['id'];
};

export type PrototypeCollectionAdd<TId extends PrototypeId = PrototypeId> = {
  kind: 'collection-add';
  path: string;
  entityPath: string;
  entityId: TId;
};

export type PrototypeWrite<TRow extends PrototypeRow = PrototypeRow> =
  | PrototypeScalarWrite
  | PrototypeCollectionRemove<TRow>
  | PrototypeCollectionAdd<TRow['id']>;

export type PrototypeTurn<TRow extends PrototypeRow = PrototypeRow> = {
  turnId: string;
  writes: PrototypeWrite<TRow>[];
};

export type PrototypeRollbackStatus =
  | 'applied'
  | 'preserved-concurrent'
  | 'cannot-reconcile'
  | 'dependency-conflict';

export type PrototypeRollbackResult<TState> = {
  status: PrototypeRollbackStatus;
  state: TState;
  reason?: string;
};

const clone = <T>(value: T): T => structuredClone(value);

const splitPath = (path: string): string[] => path.split('.').filter(Boolean);

const getAtPath = (state: unknown, path: string): unknown => {
  let current: unknown = state;
  for (const part of splitPath(path)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as PlainObject)[part];
  }
  return current;
};

const setAtPath = (state: unknown, path: string, value: unknown): void => {
  const parts = splitPath(path);
  if (parts.length === 0 || state === null || typeof state !== 'object') return;
  let current = state as PlainObject;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (next === null || typeof next !== 'object') {
      current[part] = {};
    }
    current = current[part] as PlainObject;
  }
  // `parts.at(-1)` is ES2022; this file sits under the package's `es2021`
  // lib and must stay strict-clean even though no gate compiles it today.
  current[parts[parts.length - 1]] = value;
};

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
};

const isDescendantPath = (path: string, ancestor: string): boolean =>
  path === ancestor || path.startsWith(`${ancestor}.`);

const summarizeStatus = (
  current: PrototypeRollbackStatus,
  next: PrototypeRollbackStatus
): PrototypeRollbackStatus => {
  if (current === 'cannot-reconcile' || next === 'cannot-reconcile') {
    return 'cannot-reconcile';
  }
  if (current === 'dependency-conflict' || next === 'dependency-conflict') {
    return 'dependency-conflict';
  }
  if (current === 'preserved-concurrent' || next === 'preserved-concurrent') {
    return 'preserved-concurrent';
  }
  return 'applied';
};

const rollbackScalarWrite = <TState>(
  state: TState,
  write: PrototypeScalarWrite
): PrototypeRollbackStatus => {
  const current = getAtPath(state, write.path);
  if (!valuesEqual(current, write.after)) {
    return 'preserved-concurrent';
  }
  setAtPath(state, write.path, clone(write.before));
  return 'applied';
};

const rollbackCollectionRemove = <
  TState,
  TRow extends PrototypeRow,
>(
  state: TState,
  write: PrototypeCollectionRemove<TRow>
): PrototypeRollbackStatus => {
  const current = getAtPath(state, write.path);
  if (!Array.isArray(current)) return 'cannot-reconcile';

  const rows = clone(current) as TRow[];
  if (rows.some((row) => row.id === write.removedId)) {
    return 'preserved-concurrent';
  }

  const prevIndex =
    write.prevId === undefined
      ? -1
      : rows.findIndex((row) => row.id === write.prevId);
  const nextIndex =
    write.nextId === undefined
      ? -1
      : rows.findIndex((row) => row.id === write.nextId);

  let insertIndex = write.beforeIndex;

  if (write.prevId !== undefined && write.nextId !== undefined) {
    if (prevIndex === -1 || nextIndex === -1 || prevIndex >= nextIndex) {
      return 'cannot-reconcile';
    }
    insertIndex = nextIndex;
  } else if (write.prevId !== undefined) {
    if (prevIndex === -1) return 'cannot-reconcile';
    insertIndex = prevIndex + 1;
  } else if (write.nextId !== undefined) {
    if (nextIndex === -1) return 'cannot-reconcile';
    insertIndex = nextIndex;
  }

  rows.splice(insertIndex, 0, clone(write.removed));
  setAtPath(state, write.path, rows);
  return 'applied';
};

const rollbackCollectionAdd = <TState, TId extends PrototypeId>(
  state: TState,
  write: PrototypeCollectionAdd<TId>
): PrototypeRollbackStatus => {
  const current = getAtPath(state, write.path);
  if (!Array.isArray(current)) return 'cannot-reconcile';
  const rows = clone(current) as Array<{ id: TId }>;
  const index = rows.findIndex((row) => row.id === write.entityId);
  if (index === -1) return 'preserved-concurrent';
  rows.splice(index, 1);
  setAtPath(state, write.path, rows);
  return 'applied';
};

export const rollbackPrototypeTurn = <
  TState,
  TRow extends PrototypeRow = PrototypeRow,
>(
  currentState: TState,
  turn: PrototypeTurn<TRow>,
  concurrentWrites: PrototypeWrite<TRow>[] = []
): PrototypeRollbackResult<TState> => {
  const createdEntityPaths = turn.writes
    .filter(
      (write): write is PrototypeCollectionAdd<TRow['id']> =>
        write.kind === 'collection-add'
    )
    .map((write) => write.entityPath);

  for (const createdEntityPath of createdEntityPaths) {
    const dependentWrite = concurrentWrites.find(
      (write) =>
        'path' in write &&
        typeof write.path === 'string' &&
        isDescendantPath(write.path, createdEntityPath)
    );
    if (dependentWrite) {
      return {
        status: 'dependency-conflict',
        state: clone(currentState),
        reason: `Dependent write under ${createdEntityPath}`,
      };
    }
  }

  const state = clone(currentState);
  let status: PrototypeRollbackStatus = 'applied';

  for (const write of [...turn.writes].reverse()) {
    const next =
      write.kind === 'scalar'
        ? rollbackScalarWrite(state, write)
        : write.kind === 'collection-remove'
          ? rollbackCollectionRemove(state, write)
          : rollbackCollectionAdd(state, write);
    status = summarizeStatus(status, next);
    if (status === 'cannot-reconcile') {
      return { status, state, reason: `Cannot reconcile ${write.kind}` };
    }
  }

  return { status, state };
};