/**
 * @signaltree/core/edit-session
 *
 * EditSession for tracking changes to a single value with undo/redo.
 * Unlike `timeTravel()` which tracks the entire tree, EditSession is for
 * isolated value editing (forms, entities, component-level state).
 */
export {
  createEditSession,
  type EditSession,
  type UndoRedoHistory,
} from './lib/edit-session';
