/**
 * @signaltree/core/edit-session
 *
 * EditSession primitives for draft-and-cancel workflows.
 *
 * - `createEditSession(initial)` — value-level undo/redo wrapper.
 * - `createTreeEditSession(source)` — bound to a tree path or writable signal,
 *   adds `.commit()` / `.cancel()` / `.pullFromSource()`. v10.1+.
 */
export {
  createEditSession,
  createTreeEditSession,
  type EditSession,
  type TreeEditSession,
  type TreeEditSource,
  type UndoRedoHistory,
} from './lib/edit-session';
