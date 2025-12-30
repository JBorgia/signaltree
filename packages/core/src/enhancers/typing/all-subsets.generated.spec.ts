/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// GENERATED FILE - do not edit by hand
// Comprehensive type-level checks for enhancer subsets
import type { Equals, Assert } from './helpers-types';
import type { ISignalTree } from '../../lib/types';
type Tree = { count: number };
import type { BatchingMethods } from '../batching/lib/batching';
import type { MemoizationMethods } from '../memoization/lib/memoization';
import type { TimeTravelMethods } from '../time-travel/lib/time-travel';
import type { DevToolsMethods } from '../devtools/lib/devtools';
import type { EntitiesEnabled } from '../../lib/types';
type EntitiesMethods = EntitiesEnabled;
import type { OptimizedUpdateMethods } from '../../lib/types';

// Helper to detect method presence
// Special-case legacy 'entities' check to map to the new marker `__entitiesEnabled`.
type HasMethod<T, K extends string> = K extends 'entities'
  ? '__entitiesEnabled' extends keyof T
    ? true
    : false
  : K extends keyof T
  ? true
  : false;

type Subset_A = BatchingMethods<Tree>;
type Subset_A_has_batch = Assert<Equals<HasMethod<Subset_A, 'batch'>, true>>;
type Subset_A_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_A, 'batchUpdate'>, true>
>;
type Subset_A_has_memoize = Assert<
  Equals<HasMethod<Subset_A, 'memoize'>, false>
>;
type Subset_A_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_A, 'memoizedUpdate'>, false>
>;
type Subset_A_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_A, 'clearMemoCache'>, false>
>;
type Subset_A_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_A, 'getCacheStats'>, false>
>;
type Subset_A_has_undo = Assert<Equals<HasMethod<Subset_A, 'undo'>, false>>;
type Subset_A_has_redo = Assert<Equals<HasMethod<Subset_A, 'redo'>, false>>;
type Subset_A_has_canUndo = Assert<
  Equals<HasMethod<Subset_A, 'canUndo'>, false>
>;
type Subset_A_has_canRedo = Assert<
  Equals<HasMethod<Subset_A, 'canRedo'>, false>
>;
type Subset_A_has_getHistory = Assert<
  Equals<HasMethod<Subset_A, 'getHistory'>, false>
>;
type Subset_A_has_resetHistory = Assert<
  Equals<HasMethod<Subset_A, 'resetHistory'>, false>
>;
type Subset_A_has_jumpTo = Assert<Equals<HasMethod<Subset_A, 'jumpTo'>, false>>;
type Subset_A_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_A, 'getCurrentIndex'>, false>
>;
type Subset_A_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_A, 'connectDevTools'>, false>
>;
type Subset_A_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_A, 'disconnectDevTools'>, false>
>;
type Subset_A_has_entities = Assert<
  Equals<HasMethod<Subset_A, '__entitiesEnabled'>, false>
>;
type Subset_A_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_A, 'updateOptimized'>, false>
>;

type Subset_B = MemoizationMethods<Tree>;
type Subset_B_has_batch = Assert<Equals<HasMethod<Subset_B, 'batch'>, false>>;
type Subset_B_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_B, 'batchUpdate'>, false>
>;
type Subset_B_has_memoize = Assert<
  Equals<HasMethod<Subset_B, 'memoize'>, true>
>;
type Subset_B_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_B, 'memoizedUpdate'>, true>
>;
type Subset_B_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_B, 'clearMemoCache'>, true>
>;
type Subset_B_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_B, 'getCacheStats'>, true>
>;
type Subset_B_has_undo = Assert<Equals<HasMethod<Subset_B, 'undo'>, false>>;
type Subset_B_has_redo = Assert<Equals<HasMethod<Subset_B, 'redo'>, false>>;
type Subset_B_has_canUndo = Assert<
  Equals<HasMethod<Subset_B, 'canUndo'>, false>
>;
type Subset_B_has_canRedo = Assert<
  Equals<HasMethod<Subset_B, 'canRedo'>, false>
>;
type Subset_B_has_getHistory = Assert<
  Equals<HasMethod<Subset_B, 'getHistory'>, false>
>;
type Subset_B_has_resetHistory = Assert<
  Equals<HasMethod<Subset_B, 'resetHistory'>, false>
>;
type Subset_B_has_jumpTo = Assert<Equals<HasMethod<Subset_B, 'jumpTo'>, false>>;
type Subset_B_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_B, 'getCurrentIndex'>, false>
>;
type Subset_B_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_B, 'connectDevTools'>, false>
>;
type Subset_B_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_B, 'disconnectDevTools'>, false>
>;
type Subset_B_has_entities = Assert<
  Equals<HasMethod<Subset_B, '__entitiesEnabled'>, false>
>;
type Subset_B_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_B, 'updateOptimized'>, false>
>;

type Subset_AB = BatchingMethods<Tree> & MemoizationMethods<Tree>;
type Subset_AB_has_batch = Assert<Equals<HasMethod<Subset_AB, 'batch'>, true>>;
type Subset_AB_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AB, 'batchUpdate'>, true>
>;
type Subset_AB_has_memoize = Assert<
  Equals<HasMethod<Subset_AB, 'memoize'>, true>
>;
type Subset_AB_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AB, 'memoizedUpdate'>, true>
>;
type Subset_AB_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AB, 'clearMemoCache'>, true>
>;
type Subset_AB_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AB, 'getCacheStats'>, true>
>;
type Subset_AB_has_undo = Assert<Equals<HasMethod<Subset_AB, 'undo'>, false>>;
type Subset_AB_has_redo = Assert<Equals<HasMethod<Subset_AB, 'redo'>, false>>;
type Subset_AB_has_canUndo = Assert<
  Equals<HasMethod<Subset_AB, 'canUndo'>, false>
>;
type Subset_AB_has_canRedo = Assert<
  Equals<HasMethod<Subset_AB, 'canRedo'>, false>
>;
type Subset_AB_has_getHistory = Assert<
  Equals<HasMethod<Subset_AB, 'getHistory'>, false>
>;
type Subset_AB_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AB, 'resetHistory'>, false>
>;
type Subset_AB_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AB, 'jumpTo'>, false>
>;
type Subset_AB_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AB, 'getCurrentIndex'>, false>
>;
type Subset_AB_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AB, 'connectDevTools'>, false>
>;
type Subset_AB_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AB, 'disconnectDevTools'>, false>
>;
type Subset_AB_has_entities = Assert<
  Equals<HasMethod<Subset_AB, 'entities'>, false>
>;
type Subset_AB_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AB, 'updateOptimized'>, false>
>;

type Subset_C = TimeTravelMethods<Tree>;
type Subset_C_has_batch = Assert<Equals<HasMethod<Subset_C, 'batch'>, false>>;
type Subset_C_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_C, 'batchUpdate'>, false>
>;
type Subset_C_has_memoize = Assert<
  Equals<HasMethod<Subset_C, 'memoize'>, false>
>;
type Subset_C_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_C, 'memoizedUpdate'>, false>
>;
type Subset_C_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_C, 'clearMemoCache'>, false>
>;
type Subset_C_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_C, 'getCacheStats'>, false>
>;
type Subset_C_has_undo = Assert<Equals<HasMethod<Subset_C, 'undo'>, true>>;
type Subset_C_has_redo = Assert<Equals<HasMethod<Subset_C, 'redo'>, true>>;
type Subset_C_has_canUndo = Assert<
  Equals<HasMethod<Subset_C, 'canUndo'>, true>
>;
type Subset_C_has_canRedo = Assert<
  Equals<HasMethod<Subset_C, 'canRedo'>, true>
>;
type Subset_C_has_getHistory = Assert<
  Equals<HasMethod<Subset_C, 'getHistory'>, true>
>;
type Subset_C_has_resetHistory = Assert<
  Equals<HasMethod<Subset_C, 'resetHistory'>, true>
>;
type Subset_C_has_jumpTo = Assert<Equals<HasMethod<Subset_C, 'jumpTo'>, true>>;
type Subset_C_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_C, 'getCurrentIndex'>, true>
>;
type Subset_C_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_C, 'connectDevTools'>, false>
>;
type Subset_C_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_C, 'disconnectDevTools'>, false>
>;
type Subset_C_has_entities = Assert<
  Equals<HasMethod<Subset_C, 'entities'>, false>
>;
type Subset_C_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_C, 'updateOptimized'>, false>
>;

type Subset_AC = BatchingMethods<Tree> & TimeTravelMethods<Tree>;
type Subset_AC_has_batch = Assert<Equals<HasMethod<Subset_AC, 'batch'>, true>>;
type Subset_AC_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AC, 'batchUpdate'>, true>
>;
type Subset_AC_has_memoize = Assert<
  Equals<HasMethod<Subset_AC, 'memoize'>, false>
>;
type Subset_AC_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AC, 'memoizedUpdate'>, false>
>;
type Subset_AC_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AC, 'clearMemoCache'>, false>
>;
type Subset_AC_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AC, 'getCacheStats'>, false>
>;
type Subset_AC_has_undo = Assert<Equals<HasMethod<Subset_AC, 'undo'>, true>>;
type Subset_AC_has_redo = Assert<Equals<HasMethod<Subset_AC, 'redo'>, true>>;
type Subset_AC_has_canUndo = Assert<
  Equals<HasMethod<Subset_AC, 'canUndo'>, true>
>;
type Subset_AC_has_canRedo = Assert<
  Equals<HasMethod<Subset_AC, 'canRedo'>, true>
>;
type Subset_AC_has_getHistory = Assert<
  Equals<HasMethod<Subset_AC, 'getHistory'>, true>
>;
type Subset_AC_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AC, 'resetHistory'>, true>
>;
type Subset_AC_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AC, 'jumpTo'>, true>
>;
type Subset_AC_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AC, 'getCurrentIndex'>, true>
>;
type Subset_AC_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AC, 'connectDevTools'>, false>
>;
type Subset_AC_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AC, 'disconnectDevTools'>, false>
>;
type Subset_AC_has_entities = Assert<
  Equals<HasMethod<Subset_AC, 'entities'>, false>
>;
type Subset_AC_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AC, 'updateOptimized'>, false>
>;

type Subset_BC = MemoizationMethods<Tree> & TimeTravelMethods<Tree>;
type Subset_BC_has_batch = Assert<Equals<HasMethod<Subset_BC, 'batch'>, false>>;
type Subset_BC_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BC, 'batchUpdate'>, false>
>;
type Subset_BC_has_memoize = Assert<
  Equals<HasMethod<Subset_BC, 'memoize'>, true>
>;
type Subset_BC_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BC, 'memoizedUpdate'>, true>
>;
type Subset_BC_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BC, 'clearMemoCache'>, true>
>;
type Subset_BC_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BC, 'getCacheStats'>, true>
>;
type Subset_BC_has_undo = Assert<Equals<HasMethod<Subset_BC, 'undo'>, true>>;
type Subset_BC_has_redo = Assert<Equals<HasMethod<Subset_BC, 'redo'>, true>>;
type Subset_BC_has_canUndo = Assert<
  Equals<HasMethod<Subset_BC, 'canUndo'>, true>
>;
type Subset_BC_has_canRedo = Assert<
  Equals<HasMethod<Subset_BC, 'canRedo'>, true>
>;
type Subset_BC_has_getHistory = Assert<
  Equals<HasMethod<Subset_BC, 'getHistory'>, true>
>;
type Subset_BC_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BC, 'resetHistory'>, true>
>;
type Subset_BC_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BC, 'jumpTo'>, true>
>;
type Subset_BC_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BC, 'getCurrentIndex'>, true>
>;
type Subset_BC_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BC, 'connectDevTools'>, false>
>;
type Subset_BC_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BC, 'disconnectDevTools'>, false>
>;
type Subset_BC_has_entities = Assert<
  Equals<HasMethod<Subset_BC, 'entities'>, false>
>;
type Subset_BC_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BC, 'updateOptimized'>, false>
>;

type Subset_ABC = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree>;
type Subset_ABC_has_batch = Assert<
  Equals<HasMethod<Subset_ABC, 'batch'>, true>
>;
type Subset_ABC_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABC, 'batchUpdate'>, true>
>;
type Subset_ABC_has_memoize = Assert<
  Equals<HasMethod<Subset_ABC, 'memoize'>, true>
>;
type Subset_ABC_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABC, 'memoizedUpdate'>, true>
>;
type Subset_ABC_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABC, 'clearMemoCache'>, true>
>;
type Subset_ABC_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABC, 'getCacheStats'>, true>
>;
type Subset_ABC_has_undo = Assert<Equals<HasMethod<Subset_ABC, 'undo'>, true>>;
type Subset_ABC_has_redo = Assert<Equals<HasMethod<Subset_ABC, 'redo'>, true>>;
type Subset_ABC_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABC, 'canUndo'>, true>
>;
type Subset_ABC_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABC, 'canRedo'>, true>
>;
type Subset_ABC_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABC, 'getHistory'>, true>
>;
type Subset_ABC_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABC, 'resetHistory'>, true>
>;
type Subset_ABC_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABC, 'jumpTo'>, true>
>;
type Subset_ABC_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABC, 'getCurrentIndex'>, true>
>;
type Subset_ABC_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABC, 'connectDevTools'>, false>
>;
type Subset_ABC_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABC, 'disconnectDevTools'>, false>
>;
type Subset_ABC_has_entities = Assert<
  Equals<HasMethod<Subset_ABC, 'entities'>, false>
>;
type Subset_ABC_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABC, 'updateOptimized'>, false>
>;

type Subset_D = DevToolsMethods<Tree>;
type Subset_D_has_batch = Assert<Equals<HasMethod<Subset_D, 'batch'>, false>>;
type Subset_D_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_D, 'batchUpdate'>, false>
>;
type Subset_D_has_memoize = Assert<
  Equals<HasMethod<Subset_D, 'memoize'>, false>
>;
type Subset_D_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_D, 'memoizedUpdate'>, false>
>;
type Subset_D_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_D, 'clearMemoCache'>, false>
>;
type Subset_D_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_D, 'getCacheStats'>, false>
>;
type Subset_D_has_undo = Assert<Equals<HasMethod<Subset_D, 'undo'>, false>>;
type Subset_D_has_redo = Assert<Equals<HasMethod<Subset_D, 'redo'>, false>>;
type Subset_D_has_canUndo = Assert<
  Equals<HasMethod<Subset_D, 'canUndo'>, false>
>;
type Subset_D_has_canRedo = Assert<
  Equals<HasMethod<Subset_D, 'canRedo'>, false>
>;
type Subset_D_has_getHistory = Assert<
  Equals<HasMethod<Subset_D, 'getHistory'>, false>
>;
type Subset_D_has_resetHistory = Assert<
  Equals<HasMethod<Subset_D, 'resetHistory'>, false>
>;
type Subset_D_has_jumpTo = Assert<Equals<HasMethod<Subset_D, 'jumpTo'>, false>>;
type Subset_D_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_D, 'getCurrentIndex'>, false>
>;
type Subset_D_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_D, 'connectDevTools'>, true>
>;
type Subset_D_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_D, 'disconnectDevTools'>, true>
>;
type Subset_D_has_entities = Assert<
  Equals<HasMethod<Subset_D, 'entities'>, false>
>;
type Subset_D_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_D, 'updateOptimized'>, false>
>;

type Subset_AD = BatchingMethods<Tree> & DevToolsMethods<Tree>;
type Subset_AD_has_batch = Assert<Equals<HasMethod<Subset_AD, 'batch'>, true>>;
type Subset_AD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AD, 'batchUpdate'>, true>
>;
type Subset_AD_has_memoize = Assert<
  Equals<HasMethod<Subset_AD, 'memoize'>, false>
>;
type Subset_AD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AD, 'memoizedUpdate'>, false>
>;
type Subset_AD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AD, 'clearMemoCache'>, false>
>;
type Subset_AD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AD, 'getCacheStats'>, false>
>;
type Subset_AD_has_undo = Assert<Equals<HasMethod<Subset_AD, 'undo'>, false>>;
type Subset_AD_has_redo = Assert<Equals<HasMethod<Subset_AD, 'redo'>, false>>;
type Subset_AD_has_canUndo = Assert<
  Equals<HasMethod<Subset_AD, 'canUndo'>, false>
>;
type Subset_AD_has_canRedo = Assert<
  Equals<HasMethod<Subset_AD, 'canRedo'>, false>
>;
type Subset_AD_has_getHistory = Assert<
  Equals<HasMethod<Subset_AD, 'getHistory'>, false>
>;
type Subset_AD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AD, 'resetHistory'>, false>
>;
type Subset_AD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AD, 'jumpTo'>, false>
>;
type Subset_AD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AD, 'getCurrentIndex'>, false>
>;
type Subset_AD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AD, 'connectDevTools'>, true>
>;
type Subset_AD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AD, 'disconnectDevTools'>, true>
>;
type Subset_AD_has_entities = Assert<
  Equals<HasMethod<Subset_AD, 'entities'>, false>
>;
type Subset_AD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AD, 'updateOptimized'>, false>
>;

type Subset_BD = MemoizationMethods<Tree> & DevToolsMethods<Tree>;
type Subset_BD_has_batch = Assert<Equals<HasMethod<Subset_BD, 'batch'>, false>>;
type Subset_BD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BD, 'batchUpdate'>, false>
>;
type Subset_BD_has_memoize = Assert<
  Equals<HasMethod<Subset_BD, 'memoize'>, true>
>;
type Subset_BD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BD, 'memoizedUpdate'>, true>
>;
type Subset_BD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BD, 'clearMemoCache'>, true>
>;
type Subset_BD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BD, 'getCacheStats'>, true>
>;
type Subset_BD_has_undo = Assert<Equals<HasMethod<Subset_BD, 'undo'>, false>>;
type Subset_BD_has_redo = Assert<Equals<HasMethod<Subset_BD, 'redo'>, false>>;
type Subset_BD_has_canUndo = Assert<
  Equals<HasMethod<Subset_BD, 'canUndo'>, false>
>;
type Subset_BD_has_canRedo = Assert<
  Equals<HasMethod<Subset_BD, 'canRedo'>, false>
>;
type Subset_BD_has_getHistory = Assert<
  Equals<HasMethod<Subset_BD, 'getHistory'>, false>
>;
type Subset_BD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BD, 'resetHistory'>, false>
>;
type Subset_BD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BD, 'jumpTo'>, false>
>;
type Subset_BD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BD, 'getCurrentIndex'>, false>
>;
type Subset_BD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BD, 'connectDevTools'>, true>
>;
type Subset_BD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BD, 'disconnectDevTools'>, true>
>;
type Subset_BD_has_entities = Assert<
  Equals<HasMethod<Subset_BD, 'entities'>, false>
>;
type Subset_BD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BD, 'updateOptimized'>, false>
>;

type Subset_ABD = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  DevToolsMethods<Tree>;
type Subset_ABD_has_batch = Assert<
  Equals<HasMethod<Subset_ABD, 'batch'>, true>
>;
type Subset_ABD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABD, 'batchUpdate'>, true>
>;
type Subset_ABD_has_memoize = Assert<
  Equals<HasMethod<Subset_ABD, 'memoize'>, true>
>;
type Subset_ABD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABD, 'memoizedUpdate'>, true>
>;
type Subset_ABD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABD, 'clearMemoCache'>, true>
>;
type Subset_ABD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABD, 'getCacheStats'>, true>
>;
type Subset_ABD_has_undo = Assert<Equals<HasMethod<Subset_ABD, 'undo'>, false>>;
type Subset_ABD_has_redo = Assert<Equals<HasMethod<Subset_ABD, 'redo'>, false>>;
type Subset_ABD_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABD, 'canUndo'>, false>
>;
type Subset_ABD_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABD, 'canRedo'>, false>
>;
type Subset_ABD_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABD, 'getHistory'>, false>
>;
type Subset_ABD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABD, 'resetHistory'>, false>
>;
type Subset_ABD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABD, 'jumpTo'>, false>
>;
type Subset_ABD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABD, 'getCurrentIndex'>, false>
>;
type Subset_ABD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABD, 'connectDevTools'>, true>
>;
type Subset_ABD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABD, 'disconnectDevTools'>, true>
>;
type Subset_ABD_has_entities = Assert<
  Equals<HasMethod<Subset_ABD, 'entities'>, false>
>;
type Subset_ABD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABD, 'updateOptimized'>, false>
>;

type Subset_CD = TimeTravelMethods<Tree> & DevToolsMethods<Tree>;
type Subset_CD_has_batch = Assert<Equals<HasMethod<Subset_CD, 'batch'>, false>>;
type Subset_CD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CD, 'batchUpdate'>, false>
>;
type Subset_CD_has_memoize = Assert<
  Equals<HasMethod<Subset_CD, 'memoize'>, false>
>;
type Subset_CD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CD, 'memoizedUpdate'>, false>
>;
type Subset_CD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CD, 'clearMemoCache'>, false>
>;
type Subset_CD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CD, 'getCacheStats'>, false>
>;
type Subset_CD_has_undo = Assert<Equals<HasMethod<Subset_CD, 'undo'>, true>>;
type Subset_CD_has_redo = Assert<Equals<HasMethod<Subset_CD, 'redo'>, true>>;
type Subset_CD_has_canUndo = Assert<
  Equals<HasMethod<Subset_CD, 'canUndo'>, true>
>;
type Subset_CD_has_canRedo = Assert<
  Equals<HasMethod<Subset_CD, 'canRedo'>, true>
>;
type Subset_CD_has_getHistory = Assert<
  Equals<HasMethod<Subset_CD, 'getHistory'>, true>
>;
type Subset_CD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CD, 'resetHistory'>, true>
>;
type Subset_CD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CD, 'jumpTo'>, true>
>;
type Subset_CD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CD, 'getCurrentIndex'>, true>
>;
type Subset_CD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CD, 'connectDevTools'>, true>
>;
type Subset_CD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CD, 'disconnectDevTools'>, true>
>;
type Subset_CD_has_entities = Assert<
  Equals<HasMethod<Subset_CD, 'entities'>, false>
>;
type Subset_CD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CD, 'updateOptimized'>, false>
>;

type Subset_ACD = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree>;
type Subset_ACD_has_batch = Assert<
  Equals<HasMethod<Subset_ACD, 'batch'>, true>
>;
type Subset_ACD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACD, 'batchUpdate'>, true>
>;
type Subset_ACD_has_memoize = Assert<
  Equals<HasMethod<Subset_ACD, 'memoize'>, false>
>;
type Subset_ACD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACD, 'memoizedUpdate'>, false>
>;
type Subset_ACD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACD, 'clearMemoCache'>, false>
>;
type Subset_ACD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACD, 'getCacheStats'>, false>
>;
type Subset_ACD_has_undo = Assert<Equals<HasMethod<Subset_ACD, 'undo'>, true>>;
type Subset_ACD_has_redo = Assert<Equals<HasMethod<Subset_ACD, 'redo'>, true>>;
type Subset_ACD_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACD, 'canUndo'>, true>
>;
type Subset_ACD_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACD, 'canRedo'>, true>
>;
type Subset_ACD_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACD, 'getHistory'>, true>
>;
type Subset_ACD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACD, 'resetHistory'>, true>
>;
type Subset_ACD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACD, 'jumpTo'>, true>
>;
type Subset_ACD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACD, 'getCurrentIndex'>, true>
>;
type Subset_ACD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACD, 'connectDevTools'>, true>
>;
type Subset_ACD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACD, 'disconnectDevTools'>, true>
>;
type Subset_ACD_has_entities = Assert<
  Equals<HasMethod<Subset_ACD, 'entities'>, false>
>;
type Subset_ACD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACD, 'updateOptimized'>, false>
>;

type Subset_BCD = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree>;
type Subset_BCD_has_batch = Assert<
  Equals<HasMethod<Subset_BCD, 'batch'>, false>
>;
type Subset_BCD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCD, 'batchUpdate'>, false>
>;
type Subset_BCD_has_memoize = Assert<
  Equals<HasMethod<Subset_BCD, 'memoize'>, true>
>;
type Subset_BCD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCD, 'memoizedUpdate'>, true>
>;
type Subset_BCD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCD, 'clearMemoCache'>, true>
>;
type Subset_BCD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCD, 'getCacheStats'>, true>
>;
type Subset_BCD_has_undo = Assert<Equals<HasMethod<Subset_BCD, 'undo'>, true>>;
type Subset_BCD_has_redo = Assert<Equals<HasMethod<Subset_BCD, 'redo'>, true>>;
type Subset_BCD_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCD, 'canUndo'>, true>
>;
type Subset_BCD_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCD, 'canRedo'>, true>
>;
type Subset_BCD_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCD, 'getHistory'>, true>
>;
type Subset_BCD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCD, 'resetHistory'>, true>
>;
type Subset_BCD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCD, 'jumpTo'>, true>
>;
type Subset_BCD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCD, 'getCurrentIndex'>, true>
>;
type Subset_BCD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCD, 'connectDevTools'>, true>
>;
type Subset_BCD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCD, 'disconnectDevTools'>, true>
>;
type Subset_BCD_has_entities = Assert<
  Equals<HasMethod<Subset_BCD, 'entities'>, false>
>;
type Subset_BCD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCD, 'updateOptimized'>, false>
>;

type Subset_ABCD = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree>;
type Subset_ABCD_has_batch = Assert<
  Equals<HasMethod<Subset_ABCD, 'batch'>, true>
>;
type Subset_ABCD_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCD, 'batchUpdate'>, true>
>;
type Subset_ABCD_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCD, 'memoize'>, true>
>;
type Subset_ABCD_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCD, 'memoizedUpdate'>, true>
>;
type Subset_ABCD_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCD, 'clearMemoCache'>, true>
>;
type Subset_ABCD_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCD, 'getCacheStats'>, true>
>;
type Subset_ABCD_has_undo = Assert<
  Equals<HasMethod<Subset_ABCD, 'undo'>, true>
>;
type Subset_ABCD_has_redo = Assert<
  Equals<HasMethod<Subset_ABCD, 'redo'>, true>
>;
type Subset_ABCD_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCD, 'canUndo'>, true>
>;
type Subset_ABCD_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCD, 'canRedo'>, true>
>;
type Subset_ABCD_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCD, 'getHistory'>, true>
>;
type Subset_ABCD_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCD, 'resetHistory'>, true>
>;
type Subset_ABCD_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCD, 'jumpTo'>, true>
>;
type Subset_ABCD_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCD, 'getCurrentIndex'>, true>
>;
type Subset_ABCD_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCD, 'connectDevTools'>, true>
>;
type Subset_ABCD_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCD, 'disconnectDevTools'>, true>
>;
type Subset_ABCD_has_entities = Assert<
  Equals<HasMethod<Subset_ABCD, 'entities'>, false>
>;
type Subset_ABCD_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCD, 'updateOptimized'>, false>
>;

type Subset_E = EntitiesMethods<Tree>;
type Subset_E_has_batch = Assert<Equals<HasMethod<Subset_E, 'batch'>, false>>;
type Subset_E_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_E, 'batchUpdate'>, false>
>;
type Subset_E_has_memoize = Assert<
  Equals<HasMethod<Subset_E, 'memoize'>, false>
>;
type Subset_E_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_E, 'memoizedUpdate'>, false>
>;
type Subset_E_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_E, 'clearMemoCache'>, false>
>;
type Subset_E_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_E, 'getCacheStats'>, false>
>;
type Subset_E_has_undo = Assert<Equals<HasMethod<Subset_E, 'undo'>, false>>;
type Subset_E_has_redo = Assert<Equals<HasMethod<Subset_E, 'redo'>, false>>;
type Subset_E_has_canUndo = Assert<
  Equals<HasMethod<Subset_E, 'canUndo'>, false>
>;
type Subset_E_has_canRedo = Assert<
  Equals<HasMethod<Subset_E, 'canRedo'>, false>
>;
type Subset_E_has_getHistory = Assert<
  Equals<HasMethod<Subset_E, 'getHistory'>, false>
>;
type Subset_E_has_resetHistory = Assert<
  Equals<HasMethod<Subset_E, 'resetHistory'>, false>
>;
type Subset_E_has_jumpTo = Assert<Equals<HasMethod<Subset_E, 'jumpTo'>, false>>;
type Subset_E_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_E, 'getCurrentIndex'>, false>
>;
type Subset_E_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_E, 'connectDevTools'>, false>
>;
type Subset_E_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_E, 'disconnectDevTools'>, false>
>;
type Subset_E_has_entities = Assert<
  Equals<HasMethod<Subset_E, 'entities'>, true>
>;
type Subset_E_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_E, 'updateOptimized'>, false>
>;

type Subset_AE = BatchingMethods<Tree> & EntitiesMethods<Tree>;
type Subset_AE_has_batch = Assert<Equals<HasMethod<Subset_AE, 'batch'>, true>>;
type Subset_AE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AE, 'batchUpdate'>, true>
>;
type Subset_AE_has_memoize = Assert<
  Equals<HasMethod<Subset_AE, 'memoize'>, false>
>;
type Subset_AE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AE, 'memoizedUpdate'>, false>
>;
type Subset_AE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AE, 'clearMemoCache'>, false>
>;
type Subset_AE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AE, 'getCacheStats'>, false>
>;
type Subset_AE_has_undo = Assert<Equals<HasMethod<Subset_AE, 'undo'>, false>>;
type Subset_AE_has_redo = Assert<Equals<HasMethod<Subset_AE, 'redo'>, false>>;
type Subset_AE_has_canUndo = Assert<
  Equals<HasMethod<Subset_AE, 'canUndo'>, false>
>;
type Subset_AE_has_canRedo = Assert<
  Equals<HasMethod<Subset_AE, 'canRedo'>, false>
>;
type Subset_AE_has_getHistory = Assert<
  Equals<HasMethod<Subset_AE, 'getHistory'>, false>
>;
type Subset_AE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AE, 'resetHistory'>, false>
>;
type Subset_AE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AE, 'jumpTo'>, false>
>;
type Subset_AE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AE, 'getCurrentIndex'>, false>
>;
type Subset_AE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AE, 'connectDevTools'>, false>
>;
type Subset_AE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AE, 'disconnectDevTools'>, false>
>;
type Subset_AE_has_entities = Assert<
  Equals<HasMethod<Subset_AE, 'entities'>, true>
>;
type Subset_AE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AE, 'updateOptimized'>, false>
>;

type Subset_BE = MemoizationMethods<Tree> & EntitiesMethods<Tree>;
type Subset_BE_has_batch = Assert<Equals<HasMethod<Subset_BE, 'batch'>, false>>;
type Subset_BE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BE, 'batchUpdate'>, false>
>;
type Subset_BE_has_memoize = Assert<
  Equals<HasMethod<Subset_BE, 'memoize'>, true>
>;
type Subset_BE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BE, 'memoizedUpdate'>, true>
>;
type Subset_BE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BE, 'clearMemoCache'>, true>
>;
type Subset_BE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BE, 'getCacheStats'>, true>
>;
type Subset_BE_has_undo = Assert<Equals<HasMethod<Subset_BE, 'undo'>, false>>;
type Subset_BE_has_redo = Assert<Equals<HasMethod<Subset_BE, 'redo'>, false>>;
type Subset_BE_has_canUndo = Assert<
  Equals<HasMethod<Subset_BE, 'canUndo'>, false>
>;
type Subset_BE_has_canRedo = Assert<
  Equals<HasMethod<Subset_BE, 'canRedo'>, false>
>;
type Subset_BE_has_getHistory = Assert<
  Equals<HasMethod<Subset_BE, 'getHistory'>, false>
>;
type Subset_BE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BE, 'resetHistory'>, false>
>;
type Subset_BE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BE, 'jumpTo'>, false>
>;
type Subset_BE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BE, 'getCurrentIndex'>, false>
>;
type Subset_BE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BE, 'connectDevTools'>, false>
>;
type Subset_BE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BE, 'disconnectDevTools'>, false>
>;
type Subset_BE_has_entities = Assert<
  Equals<HasMethod<Subset_BE, 'entities'>, true>
>;
type Subset_BE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BE, 'updateOptimized'>, false>
>;

type Subset_ABE = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ABE_has_batch = Assert<
  Equals<HasMethod<Subset_ABE, 'batch'>, true>
>;
type Subset_ABE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABE, 'batchUpdate'>, true>
>;
type Subset_ABE_has_memoize = Assert<
  Equals<HasMethod<Subset_ABE, 'memoize'>, true>
>;
type Subset_ABE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABE, 'memoizedUpdate'>, true>
>;
type Subset_ABE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABE, 'clearMemoCache'>, true>
>;
type Subset_ABE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABE, 'getCacheStats'>, true>
>;
type Subset_ABE_has_undo = Assert<Equals<HasMethod<Subset_ABE, 'undo'>, false>>;
type Subset_ABE_has_redo = Assert<Equals<HasMethod<Subset_ABE, 'redo'>, false>>;
type Subset_ABE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABE, 'canUndo'>, false>
>;
type Subset_ABE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABE, 'canRedo'>, false>
>;
type Subset_ABE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABE, 'getHistory'>, false>
>;
type Subset_ABE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABE, 'resetHistory'>, false>
>;
type Subset_ABE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABE, 'jumpTo'>, false>
>;
type Subset_ABE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABE, 'getCurrentIndex'>, false>
>;
type Subset_ABE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABE, 'connectDevTools'>, false>
>;
type Subset_ABE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABE, 'disconnectDevTools'>, false>
>;
type Subset_ABE_has_entities = Assert<
  Equals<HasMethod<Subset_ABE, 'entities'>, true>
>;
type Subset_ABE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABE, 'updateOptimized'>, false>
>;

type Subset_CE = TimeTravelMethods<Tree> & EntitiesMethods<Tree>;
type Subset_CE_has_batch = Assert<Equals<HasMethod<Subset_CE, 'batch'>, false>>;
type Subset_CE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CE, 'batchUpdate'>, false>
>;
type Subset_CE_has_memoize = Assert<
  Equals<HasMethod<Subset_CE, 'memoize'>, false>
>;
type Subset_CE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CE, 'memoizedUpdate'>, false>
>;
type Subset_CE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CE, 'clearMemoCache'>, false>
>;
type Subset_CE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CE, 'getCacheStats'>, false>
>;
type Subset_CE_has_undo = Assert<Equals<HasMethod<Subset_CE, 'undo'>, true>>;
type Subset_CE_has_redo = Assert<Equals<HasMethod<Subset_CE, 'redo'>, true>>;
type Subset_CE_has_canUndo = Assert<
  Equals<HasMethod<Subset_CE, 'canUndo'>, true>
>;
type Subset_CE_has_canRedo = Assert<
  Equals<HasMethod<Subset_CE, 'canRedo'>, true>
>;
type Subset_CE_has_getHistory = Assert<
  Equals<HasMethod<Subset_CE, 'getHistory'>, true>
>;
type Subset_CE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CE, 'resetHistory'>, true>
>;
type Subset_CE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CE, 'jumpTo'>, true>
>;
type Subset_CE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CE, 'getCurrentIndex'>, true>
>;
type Subset_CE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CE, 'connectDevTools'>, false>
>;
type Subset_CE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CE, 'disconnectDevTools'>, false>
>;
type Subset_CE_has_entities = Assert<
  Equals<HasMethod<Subset_CE, 'entities'>, true>
>;
type Subset_CE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CE, 'updateOptimized'>, false>
>;

type Subset_ACE = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ACE_has_batch = Assert<
  Equals<HasMethod<Subset_ACE, 'batch'>, true>
>;
type Subset_ACE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACE, 'batchUpdate'>, true>
>;
type Subset_ACE_has_memoize = Assert<
  Equals<HasMethod<Subset_ACE, 'memoize'>, false>
>;
type Subset_ACE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACE, 'memoizedUpdate'>, false>
>;
type Subset_ACE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACE, 'clearMemoCache'>, false>
>;
type Subset_ACE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACE, 'getCacheStats'>, false>
>;
type Subset_ACE_has_undo = Assert<Equals<HasMethod<Subset_ACE, 'undo'>, true>>;
type Subset_ACE_has_redo = Assert<Equals<HasMethod<Subset_ACE, 'redo'>, true>>;
type Subset_ACE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACE, 'canUndo'>, true>
>;
type Subset_ACE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACE, 'canRedo'>, true>
>;
type Subset_ACE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACE, 'getHistory'>, true>
>;
type Subset_ACE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACE, 'resetHistory'>, true>
>;
type Subset_ACE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACE, 'jumpTo'>, true>
>;
type Subset_ACE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACE, 'getCurrentIndex'>, true>
>;
type Subset_ACE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACE, 'connectDevTools'>, false>
>;
type Subset_ACE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACE, 'disconnectDevTools'>, false>
>;
type Subset_ACE_has_entities = Assert<
  Equals<HasMethod<Subset_ACE, 'entities'>, true>
>;
type Subset_ACE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACE, 'updateOptimized'>, false>
>;

type Subset_BCE = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_BCE_has_batch = Assert<
  Equals<HasMethod<Subset_BCE, 'batch'>, false>
>;
type Subset_BCE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCE, 'batchUpdate'>, false>
>;
type Subset_BCE_has_memoize = Assert<
  Equals<HasMethod<Subset_BCE, 'memoize'>, true>
>;
type Subset_BCE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCE, 'memoizedUpdate'>, true>
>;
type Subset_BCE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCE, 'clearMemoCache'>, true>
>;
type Subset_BCE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCE, 'getCacheStats'>, true>
>;
type Subset_BCE_has_undo = Assert<Equals<HasMethod<Subset_BCE, 'undo'>, true>>;
type Subset_BCE_has_redo = Assert<Equals<HasMethod<Subset_BCE, 'redo'>, true>>;
type Subset_BCE_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCE, 'canUndo'>, true>
>;
type Subset_BCE_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCE, 'canRedo'>, true>
>;
type Subset_BCE_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCE, 'getHistory'>, true>
>;
type Subset_BCE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCE, 'resetHistory'>, true>
>;
type Subset_BCE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCE, 'jumpTo'>, true>
>;
type Subset_BCE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCE, 'getCurrentIndex'>, true>
>;
type Subset_BCE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCE, 'connectDevTools'>, false>
>;
type Subset_BCE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCE, 'disconnectDevTools'>, false>
>;
type Subset_BCE_has_entities = Assert<
  Equals<HasMethod<Subset_BCE, 'entities'>, true>
>;
type Subset_BCE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCE, 'updateOptimized'>, false>
>;

type Subset_ABCE = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ABCE_has_batch = Assert<
  Equals<HasMethod<Subset_ABCE, 'batch'>, true>
>;
type Subset_ABCE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCE, 'batchUpdate'>, true>
>;
type Subset_ABCE_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCE, 'memoize'>, true>
>;
type Subset_ABCE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCE, 'memoizedUpdate'>, true>
>;
type Subset_ABCE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCE, 'clearMemoCache'>, true>
>;
type Subset_ABCE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCE, 'getCacheStats'>, true>
>;
type Subset_ABCE_has_undo = Assert<
  Equals<HasMethod<Subset_ABCE, 'undo'>, true>
>;
type Subset_ABCE_has_redo = Assert<
  Equals<HasMethod<Subset_ABCE, 'redo'>, true>
>;
type Subset_ABCE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCE, 'canUndo'>, true>
>;
type Subset_ABCE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCE, 'canRedo'>, true>
>;
type Subset_ABCE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCE, 'getHistory'>, true>
>;
type Subset_ABCE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCE, 'resetHistory'>, true>
>;
type Subset_ABCE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCE, 'jumpTo'>, true>
>;
type Subset_ABCE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCE, 'getCurrentIndex'>, true>
>;
type Subset_ABCE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCE, 'connectDevTools'>, false>
>;
type Subset_ABCE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCE, 'disconnectDevTools'>, false>
>;
type Subset_ABCE_has_entities = Assert<
  Equals<HasMethod<Subset_ABCE, 'entities'>, true>
>;
type Subset_ABCE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCE, 'updateOptimized'>, false>
>;

type Subset_DE = DevToolsMethods<Tree> & EntitiesMethods<Tree>;
type Subset_DE_has_batch = Assert<Equals<HasMethod<Subset_DE, 'batch'>, false>>;
type Subset_DE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_DE, 'batchUpdate'>, false>
>;
type Subset_DE_has_memoize = Assert<
  Equals<HasMethod<Subset_DE, 'memoize'>, false>
>;
type Subset_DE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_DE, 'memoizedUpdate'>, false>
>;
type Subset_DE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_DE, 'clearMemoCache'>, false>
>;
type Subset_DE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_DE, 'getCacheStats'>, false>
>;
type Subset_DE_has_undo = Assert<Equals<HasMethod<Subset_DE, 'undo'>, false>>;
type Subset_DE_has_redo = Assert<Equals<HasMethod<Subset_DE, 'redo'>, false>>;
type Subset_DE_has_canUndo = Assert<
  Equals<HasMethod<Subset_DE, 'canUndo'>, false>
>;
type Subset_DE_has_canRedo = Assert<
  Equals<HasMethod<Subset_DE, 'canRedo'>, false>
>;
type Subset_DE_has_getHistory = Assert<
  Equals<HasMethod<Subset_DE, 'getHistory'>, false>
>;
type Subset_DE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_DE, 'resetHistory'>, false>
>;
type Subset_DE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_DE, 'jumpTo'>, false>
>;
type Subset_DE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_DE, 'getCurrentIndex'>, false>
>;
type Subset_DE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_DE, 'connectDevTools'>, true>
>;
type Subset_DE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_DE, 'disconnectDevTools'>, true>
>;
type Subset_DE_has_entities = Assert<
  Equals<HasMethod<Subset_DE, 'entities'>, true>
>;
type Subset_DE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_DE, 'updateOptimized'>, false>
>;

type Subset_ADE = BatchingMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ADE_has_batch = Assert<
  Equals<HasMethod<Subset_ADE, 'batch'>, true>
>;
type Subset_ADE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ADE, 'batchUpdate'>, true>
>;
type Subset_ADE_has_memoize = Assert<
  Equals<HasMethod<Subset_ADE, 'memoize'>, false>
>;
type Subset_ADE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ADE, 'memoizedUpdate'>, false>
>;
type Subset_ADE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ADE, 'clearMemoCache'>, false>
>;
type Subset_ADE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ADE, 'getCacheStats'>, false>
>;
type Subset_ADE_has_undo = Assert<Equals<HasMethod<Subset_ADE, 'undo'>, false>>;
type Subset_ADE_has_redo = Assert<Equals<HasMethod<Subset_ADE, 'redo'>, false>>;
type Subset_ADE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ADE, 'canUndo'>, false>
>;
type Subset_ADE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ADE, 'canRedo'>, false>
>;
type Subset_ADE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ADE, 'getHistory'>, false>
>;
type Subset_ADE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ADE, 'resetHistory'>, false>
>;
type Subset_ADE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ADE, 'jumpTo'>, false>
>;
type Subset_ADE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ADE, 'getCurrentIndex'>, false>
>;
type Subset_ADE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ADE, 'connectDevTools'>, true>
>;
type Subset_ADE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ADE, 'disconnectDevTools'>, true>
>;
type Subset_ADE_has_entities = Assert<
  Equals<HasMethod<Subset_ADE, 'entities'>, true>
>;
type Subset_ADE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ADE, 'updateOptimized'>, false>
>;

type Subset_BDE = MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_BDE_has_batch = Assert<
  Equals<HasMethod<Subset_BDE, 'batch'>, false>
>;
type Subset_BDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BDE, 'batchUpdate'>, false>
>;
type Subset_BDE_has_memoize = Assert<
  Equals<HasMethod<Subset_BDE, 'memoize'>, true>
>;
type Subset_BDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BDE, 'memoizedUpdate'>, true>
>;
type Subset_BDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BDE, 'clearMemoCache'>, true>
>;
type Subset_BDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BDE, 'getCacheStats'>, true>
>;
type Subset_BDE_has_undo = Assert<Equals<HasMethod<Subset_BDE, 'undo'>, false>>;
type Subset_BDE_has_redo = Assert<Equals<HasMethod<Subset_BDE, 'redo'>, false>>;
type Subset_BDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_BDE, 'canUndo'>, false>
>;
type Subset_BDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_BDE, 'canRedo'>, false>
>;
type Subset_BDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_BDE, 'getHistory'>, false>
>;
type Subset_BDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BDE, 'resetHistory'>, false>
>;
type Subset_BDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BDE, 'jumpTo'>, false>
>;
type Subset_BDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BDE, 'getCurrentIndex'>, false>
>;
type Subset_BDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BDE, 'connectDevTools'>, true>
>;
type Subset_BDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BDE, 'disconnectDevTools'>, true>
>;
type Subset_BDE_has_entities = Assert<
  Equals<HasMethod<Subset_BDE, 'entities'>, true>
>;
type Subset_BDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BDE, 'updateOptimized'>, false>
>;

type Subset_ABDE = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ABDE_has_batch = Assert<
  Equals<HasMethod<Subset_ABDE, 'batch'>, true>
>;
type Subset_ABDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABDE, 'batchUpdate'>, true>
>;
type Subset_ABDE_has_memoize = Assert<
  Equals<HasMethod<Subset_ABDE, 'memoize'>, true>
>;
type Subset_ABDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABDE, 'memoizedUpdate'>, true>
>;
type Subset_ABDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABDE, 'clearMemoCache'>, true>
>;
type Subset_ABDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABDE, 'getCacheStats'>, true>
>;
type Subset_ABDE_has_undo = Assert<
  Equals<HasMethod<Subset_ABDE, 'undo'>, false>
>;
type Subset_ABDE_has_redo = Assert<
  Equals<HasMethod<Subset_ABDE, 'redo'>, false>
>;
type Subset_ABDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABDE, 'canUndo'>, false>
>;
type Subset_ABDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABDE, 'canRedo'>, false>
>;
type Subset_ABDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABDE, 'getHistory'>, false>
>;
type Subset_ABDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABDE, 'resetHistory'>, false>
>;
type Subset_ABDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABDE, 'jumpTo'>, false>
>;
type Subset_ABDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABDE, 'getCurrentIndex'>, false>
>;
type Subset_ABDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABDE, 'connectDevTools'>, true>
>;
type Subset_ABDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABDE, 'disconnectDevTools'>, true>
>;
type Subset_ABDE_has_entities = Assert<
  Equals<HasMethod<Subset_ABDE, 'entities'>, true>
>;
type Subset_ABDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABDE, 'updateOptimized'>, false>
>;

type Subset_CDE = TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_CDE_has_batch = Assert<
  Equals<HasMethod<Subset_CDE, 'batch'>, false>
>;
type Subset_CDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CDE, 'batchUpdate'>, false>
>;
type Subset_CDE_has_memoize = Assert<
  Equals<HasMethod<Subset_CDE, 'memoize'>, false>
>;
type Subset_CDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CDE, 'memoizedUpdate'>, false>
>;
type Subset_CDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CDE, 'clearMemoCache'>, false>
>;
type Subset_CDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CDE, 'getCacheStats'>, false>
>;
type Subset_CDE_has_undo = Assert<Equals<HasMethod<Subset_CDE, 'undo'>, true>>;
type Subset_CDE_has_redo = Assert<Equals<HasMethod<Subset_CDE, 'redo'>, true>>;
type Subset_CDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_CDE, 'canUndo'>, true>
>;
type Subset_CDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_CDE, 'canRedo'>, true>
>;
type Subset_CDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_CDE, 'getHistory'>, true>
>;
type Subset_CDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CDE, 'resetHistory'>, true>
>;
type Subset_CDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CDE, 'jumpTo'>, true>
>;
type Subset_CDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CDE, 'getCurrentIndex'>, true>
>;
type Subset_CDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CDE, 'connectDevTools'>, true>
>;
type Subset_CDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CDE, 'disconnectDevTools'>, true>
>;
type Subset_CDE_has_entities = Assert<
  Equals<HasMethod<Subset_CDE, 'entities'>, true>
>;
type Subset_CDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CDE, 'updateOptimized'>, false>
>;

type Subset_ACDE = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ACDE_has_batch = Assert<
  Equals<HasMethod<Subset_ACDE, 'batch'>, true>
>;
type Subset_ACDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACDE, 'batchUpdate'>, true>
>;
type Subset_ACDE_has_memoize = Assert<
  Equals<HasMethod<Subset_ACDE, 'memoize'>, false>
>;
type Subset_ACDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACDE, 'memoizedUpdate'>, false>
>;
type Subset_ACDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACDE, 'clearMemoCache'>, false>
>;
type Subset_ACDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACDE, 'getCacheStats'>, false>
>;
type Subset_ACDE_has_undo = Assert<
  Equals<HasMethod<Subset_ACDE, 'undo'>, true>
>;
type Subset_ACDE_has_redo = Assert<
  Equals<HasMethod<Subset_ACDE, 'redo'>, true>
>;
type Subset_ACDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACDE, 'canUndo'>, true>
>;
type Subset_ACDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACDE, 'canRedo'>, true>
>;
type Subset_ACDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACDE, 'getHistory'>, true>
>;
type Subset_ACDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACDE, 'resetHistory'>, true>
>;
type Subset_ACDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACDE, 'jumpTo'>, true>
>;
type Subset_ACDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACDE, 'getCurrentIndex'>, true>
>;
type Subset_ACDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACDE, 'connectDevTools'>, true>
>;
type Subset_ACDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACDE, 'disconnectDevTools'>, true>
>;
type Subset_ACDE_has_entities = Assert<
  Equals<HasMethod<Subset_ACDE, 'entities'>, true>
>;
type Subset_ACDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACDE, 'updateOptimized'>, false>
>;

type Subset_BCDE = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_BCDE_has_batch = Assert<
  Equals<HasMethod<Subset_BCDE, 'batch'>, false>
>;
type Subset_BCDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCDE, 'batchUpdate'>, false>
>;
type Subset_BCDE_has_memoize = Assert<
  Equals<HasMethod<Subset_BCDE, 'memoize'>, true>
>;
type Subset_BCDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCDE, 'memoizedUpdate'>, true>
>;
type Subset_BCDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCDE, 'clearMemoCache'>, true>
>;
type Subset_BCDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCDE, 'getCacheStats'>, true>
>;
type Subset_BCDE_has_undo = Assert<
  Equals<HasMethod<Subset_BCDE, 'undo'>, true>
>;
type Subset_BCDE_has_redo = Assert<
  Equals<HasMethod<Subset_BCDE, 'redo'>, true>
>;
type Subset_BCDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCDE, 'canUndo'>, true>
>;
type Subset_BCDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCDE, 'canRedo'>, true>
>;
type Subset_BCDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCDE, 'getHistory'>, true>
>;
type Subset_BCDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCDE, 'resetHistory'>, true>
>;
type Subset_BCDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCDE, 'jumpTo'>, true>
>;
type Subset_BCDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCDE, 'getCurrentIndex'>, true>
>;
type Subset_BCDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCDE, 'connectDevTools'>, true>
>;
type Subset_BCDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCDE, 'disconnectDevTools'>, true>
>;
type Subset_BCDE_has_entities = Assert<
  Equals<HasMethod<Subset_BCDE, 'entities'>, true>
>;
type Subset_BCDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCDE, 'updateOptimized'>, false>
>;

type Subset_ABCDE = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree>;
type Subset_ABCDE_has_batch = Assert<
  Equals<HasMethod<Subset_ABCDE, 'batch'>, true>
>;
type Subset_ABCDE_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCDE, 'batchUpdate'>, true>
>;
type Subset_ABCDE_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCDE, 'memoize'>, true>
>;
type Subset_ABCDE_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCDE, 'memoizedUpdate'>, true>
>;
type Subset_ABCDE_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCDE, 'clearMemoCache'>, true>
>;
type Subset_ABCDE_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCDE, 'getCacheStats'>, true>
>;
type Subset_ABCDE_has_undo = Assert<
  Equals<HasMethod<Subset_ABCDE, 'undo'>, true>
>;
type Subset_ABCDE_has_redo = Assert<
  Equals<HasMethod<Subset_ABCDE, 'redo'>, true>
>;
type Subset_ABCDE_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCDE, 'canUndo'>, true>
>;
type Subset_ABCDE_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCDE, 'canRedo'>, true>
>;
type Subset_ABCDE_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCDE, 'getHistory'>, true>
>;
type Subset_ABCDE_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCDE, 'resetHistory'>, true>
>;
type Subset_ABCDE_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCDE, 'jumpTo'>, true>
>;
type Subset_ABCDE_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCDE, 'getCurrentIndex'>, true>
>;
type Subset_ABCDE_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDE, 'connectDevTools'>, true>
>;
type Subset_ABCDE_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDE, 'disconnectDevTools'>, true>
>;
type Subset_ABCDE_has_entities = Assert<
  Equals<HasMethod<Subset_ABCDE, 'entities'>, true>
>;
type Subset_ABCDE_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCDE, 'updateOptimized'>, false>
>;

type Subset_F = OptimizedUpdateMethods<Tree>;
type Subset_F_has_batch = Assert<Equals<HasMethod<Subset_F, 'batch'>, false>>;
type Subset_F_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_F, 'batchUpdate'>, false>
>;
type Subset_F_has_memoize = Assert<
  Equals<HasMethod<Subset_F, 'memoize'>, false>
>;
type Subset_F_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_F, 'memoizedUpdate'>, false>
>;
type Subset_F_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_F, 'clearMemoCache'>, false>
>;
type Subset_F_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_F, 'getCacheStats'>, false>
>;
type Subset_F_has_undo = Assert<Equals<HasMethod<Subset_F, 'undo'>, false>>;
type Subset_F_has_redo = Assert<Equals<HasMethod<Subset_F, 'redo'>, false>>;
type Subset_F_has_canUndo = Assert<
  Equals<HasMethod<Subset_F, 'canUndo'>, false>
>;
type Subset_F_has_canRedo = Assert<
  Equals<HasMethod<Subset_F, 'canRedo'>, false>
>;
type Subset_F_has_getHistory = Assert<
  Equals<HasMethod<Subset_F, 'getHistory'>, false>
>;
type Subset_F_has_resetHistory = Assert<
  Equals<HasMethod<Subset_F, 'resetHistory'>, false>
>;
type Subset_F_has_jumpTo = Assert<Equals<HasMethod<Subset_F, 'jumpTo'>, false>>;
type Subset_F_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_F, 'getCurrentIndex'>, false>
>;
type Subset_F_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_F, 'connectDevTools'>, false>
>;
type Subset_F_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_F, 'disconnectDevTools'>, false>
>;
type Subset_F_has_entities = Assert<
  Equals<HasMethod<Subset_F, 'entities'>, false>
>;
type Subset_F_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_F, 'updateOptimized'>, true>
>;

type Subset_AF = BatchingMethods<Tree> & OptimizedUpdateMethods<Tree>;
type Subset_AF_has_batch = Assert<Equals<HasMethod<Subset_AF, 'batch'>, true>>;
type Subset_AF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AF, 'batchUpdate'>, true>
>;
type Subset_AF_has_memoize = Assert<
  Equals<HasMethod<Subset_AF, 'memoize'>, false>
>;
type Subset_AF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AF, 'memoizedUpdate'>, false>
>;
type Subset_AF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AF, 'clearMemoCache'>, false>
>;
type Subset_AF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AF, 'getCacheStats'>, false>
>;
type Subset_AF_has_undo = Assert<Equals<HasMethod<Subset_AF, 'undo'>, false>>;
type Subset_AF_has_redo = Assert<Equals<HasMethod<Subset_AF, 'redo'>, false>>;
type Subset_AF_has_canUndo = Assert<
  Equals<HasMethod<Subset_AF, 'canUndo'>, false>
>;
type Subset_AF_has_canRedo = Assert<
  Equals<HasMethod<Subset_AF, 'canRedo'>, false>
>;
type Subset_AF_has_getHistory = Assert<
  Equals<HasMethod<Subset_AF, 'getHistory'>, false>
>;
type Subset_AF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AF, 'resetHistory'>, false>
>;
type Subset_AF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AF, 'jumpTo'>, false>
>;
type Subset_AF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AF, 'getCurrentIndex'>, false>
>;
type Subset_AF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AF, 'connectDevTools'>, false>
>;
type Subset_AF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AF, 'disconnectDevTools'>, false>
>;
type Subset_AF_has_entities = Assert<
  Equals<HasMethod<Subset_AF, 'entities'>, false>
>;
type Subset_AF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AF, 'updateOptimized'>, true>
>;

type Subset_BF = MemoizationMethods<Tree> & OptimizedUpdateMethods<Tree>;
type Subset_BF_has_batch = Assert<Equals<HasMethod<Subset_BF, 'batch'>, false>>;
type Subset_BF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BF, 'batchUpdate'>, false>
>;
type Subset_BF_has_memoize = Assert<
  Equals<HasMethod<Subset_BF, 'memoize'>, true>
>;
type Subset_BF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BF, 'memoizedUpdate'>, true>
>;
type Subset_BF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BF, 'clearMemoCache'>, true>
>;
type Subset_BF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BF, 'getCacheStats'>, true>
>;
type Subset_BF_has_undo = Assert<Equals<HasMethod<Subset_BF, 'undo'>, false>>;
type Subset_BF_has_redo = Assert<Equals<HasMethod<Subset_BF, 'redo'>, false>>;
type Subset_BF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BF, 'canUndo'>, false>
>;
type Subset_BF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BF, 'canRedo'>, false>
>;
type Subset_BF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BF, 'getHistory'>, false>
>;
type Subset_BF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BF, 'resetHistory'>, false>
>;
type Subset_BF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BF, 'jumpTo'>, false>
>;
type Subset_BF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BF, 'getCurrentIndex'>, false>
>;
type Subset_BF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BF, 'connectDevTools'>, false>
>;
type Subset_BF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BF, 'disconnectDevTools'>, false>
>;
type Subset_BF_has_entities = Assert<
  Equals<HasMethod<Subset_BF, 'entities'>, false>
>;
type Subset_BF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BF, 'updateOptimized'>, true>
>;

type Subset_ABF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABF_has_batch = Assert<
  Equals<HasMethod<Subset_ABF, 'batch'>, true>
>;
type Subset_ABF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABF, 'batchUpdate'>, true>
>;
type Subset_ABF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABF, 'memoize'>, true>
>;
type Subset_ABF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABF, 'memoizedUpdate'>, true>
>;
type Subset_ABF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABF, 'clearMemoCache'>, true>
>;
type Subset_ABF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABF, 'getCacheStats'>, true>
>;
type Subset_ABF_has_undo = Assert<Equals<HasMethod<Subset_ABF, 'undo'>, false>>;
type Subset_ABF_has_redo = Assert<Equals<HasMethod<Subset_ABF, 'redo'>, false>>;
type Subset_ABF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABF, 'canUndo'>, false>
>;
type Subset_ABF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABF, 'canRedo'>, false>
>;
type Subset_ABF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABF, 'getHistory'>, false>
>;
type Subset_ABF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABF, 'resetHistory'>, false>
>;
type Subset_ABF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABF, 'jumpTo'>, false>
>;
type Subset_ABF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABF, 'getCurrentIndex'>, false>
>;
type Subset_ABF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABF, 'connectDevTools'>, false>
>;
type Subset_ABF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABF, 'disconnectDevTools'>, false>
>;
type Subset_ABF_has_entities = Assert<
  Equals<HasMethod<Subset_ABF, 'entities'>, false>
>;
type Subset_ABF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABF, 'updateOptimized'>, true>
>;

type Subset_CF = TimeTravelMethods<Tree> & OptimizedUpdateMethods<Tree>;
type Subset_CF_has_batch = Assert<Equals<HasMethod<Subset_CF, 'batch'>, false>>;
type Subset_CF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CF, 'batchUpdate'>, false>
>;
type Subset_CF_has_memoize = Assert<
  Equals<HasMethod<Subset_CF, 'memoize'>, false>
>;
type Subset_CF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CF, 'memoizedUpdate'>, false>
>;
type Subset_CF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CF, 'clearMemoCache'>, false>
>;
type Subset_CF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CF, 'getCacheStats'>, false>
>;
type Subset_CF_has_undo = Assert<Equals<HasMethod<Subset_CF, 'undo'>, true>>;
type Subset_CF_has_redo = Assert<Equals<HasMethod<Subset_CF, 'redo'>, true>>;
type Subset_CF_has_canUndo = Assert<
  Equals<HasMethod<Subset_CF, 'canUndo'>, true>
>;
type Subset_CF_has_canRedo = Assert<
  Equals<HasMethod<Subset_CF, 'canRedo'>, true>
>;
type Subset_CF_has_getHistory = Assert<
  Equals<HasMethod<Subset_CF, 'getHistory'>, true>
>;
type Subset_CF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CF, 'resetHistory'>, true>
>;
type Subset_CF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CF, 'jumpTo'>, true>
>;
type Subset_CF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CF, 'getCurrentIndex'>, true>
>;
type Subset_CF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CF, 'connectDevTools'>, false>
>;
type Subset_CF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CF, 'disconnectDevTools'>, false>
>;
type Subset_CF_has_entities = Assert<
  Equals<HasMethod<Subset_CF, 'entities'>, false>
>;
type Subset_CF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CF, 'updateOptimized'>, true>
>;

type Subset_ACF = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ACF_has_batch = Assert<
  Equals<HasMethod<Subset_ACF, 'batch'>, true>
>;
type Subset_ACF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACF, 'batchUpdate'>, true>
>;
type Subset_ACF_has_memoize = Assert<
  Equals<HasMethod<Subset_ACF, 'memoize'>, false>
>;
type Subset_ACF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACF, 'memoizedUpdate'>, false>
>;
type Subset_ACF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACF, 'clearMemoCache'>, false>
>;
type Subset_ACF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACF, 'getCacheStats'>, false>
>;
type Subset_ACF_has_undo = Assert<Equals<HasMethod<Subset_ACF, 'undo'>, true>>;
type Subset_ACF_has_redo = Assert<Equals<HasMethod<Subset_ACF, 'redo'>, true>>;
type Subset_ACF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACF, 'canUndo'>, true>
>;
type Subset_ACF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACF, 'canRedo'>, true>
>;
type Subset_ACF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACF, 'getHistory'>, true>
>;
type Subset_ACF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACF, 'resetHistory'>, true>
>;
type Subset_ACF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACF, 'jumpTo'>, true>
>;
type Subset_ACF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACF, 'getCurrentIndex'>, true>
>;
type Subset_ACF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACF, 'connectDevTools'>, false>
>;
type Subset_ACF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACF, 'disconnectDevTools'>, false>
>;
type Subset_ACF_has_entities = Assert<
  Equals<HasMethod<Subset_ACF, 'entities'>, false>
>;
type Subset_ACF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACF, 'updateOptimized'>, true>
>;

type Subset_BCF = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BCF_has_batch = Assert<
  Equals<HasMethod<Subset_BCF, 'batch'>, false>
>;
type Subset_BCF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCF, 'batchUpdate'>, false>
>;
type Subset_BCF_has_memoize = Assert<
  Equals<HasMethod<Subset_BCF, 'memoize'>, true>
>;
type Subset_BCF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCF, 'memoizedUpdate'>, true>
>;
type Subset_BCF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCF, 'clearMemoCache'>, true>
>;
type Subset_BCF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCF, 'getCacheStats'>, true>
>;
type Subset_BCF_has_undo = Assert<Equals<HasMethod<Subset_BCF, 'undo'>, true>>;
type Subset_BCF_has_redo = Assert<Equals<HasMethod<Subset_BCF, 'redo'>, true>>;
type Subset_BCF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCF, 'canUndo'>, true>
>;
type Subset_BCF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCF, 'canRedo'>, true>
>;
type Subset_BCF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCF, 'getHistory'>, true>
>;
type Subset_BCF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCF, 'resetHistory'>, true>
>;
type Subset_BCF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCF, 'jumpTo'>, true>
>;
type Subset_BCF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCF, 'getCurrentIndex'>, true>
>;
type Subset_BCF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCF, 'connectDevTools'>, false>
>;
type Subset_BCF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCF, 'disconnectDevTools'>, false>
>;
type Subset_BCF_has_entities = Assert<
  Equals<HasMethod<Subset_BCF, 'entities'>, false>
>;
type Subset_BCF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCF, 'updateOptimized'>, true>
>;

type Subset_ABCF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABCF_has_batch = Assert<
  Equals<HasMethod<Subset_ABCF, 'batch'>, true>
>;
type Subset_ABCF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCF, 'batchUpdate'>, true>
>;
type Subset_ABCF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCF, 'memoize'>, true>
>;
type Subset_ABCF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCF, 'memoizedUpdate'>, true>
>;
type Subset_ABCF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCF, 'clearMemoCache'>, true>
>;
type Subset_ABCF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCF, 'getCacheStats'>, true>
>;
type Subset_ABCF_has_undo = Assert<
  Equals<HasMethod<Subset_ABCF, 'undo'>, true>
>;
type Subset_ABCF_has_redo = Assert<
  Equals<HasMethod<Subset_ABCF, 'redo'>, true>
>;
type Subset_ABCF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCF, 'canUndo'>, true>
>;
type Subset_ABCF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCF, 'canRedo'>, true>
>;
type Subset_ABCF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCF, 'getHistory'>, true>
>;
type Subset_ABCF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCF, 'resetHistory'>, true>
>;
type Subset_ABCF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCF, 'jumpTo'>, true>
>;
type Subset_ABCF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCF, 'getCurrentIndex'>, true>
>;
type Subset_ABCF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCF, 'connectDevTools'>, false>
>;
type Subset_ABCF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCF, 'disconnectDevTools'>, false>
>;
type Subset_ABCF_has_entities = Assert<
  Equals<HasMethod<Subset_ABCF, 'entities'>, false>
>;
type Subset_ABCF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCF, 'updateOptimized'>, true>
>;

type Subset_DF = DevToolsMethods<Tree> & OptimizedUpdateMethods<Tree>;
type Subset_DF_has_batch = Assert<Equals<HasMethod<Subset_DF, 'batch'>, false>>;
type Subset_DF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_DF, 'batchUpdate'>, false>
>;
type Subset_DF_has_memoize = Assert<
  Equals<HasMethod<Subset_DF, 'memoize'>, false>
>;
type Subset_DF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_DF, 'memoizedUpdate'>, false>
>;
type Subset_DF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_DF, 'clearMemoCache'>, false>
>;
type Subset_DF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_DF, 'getCacheStats'>, false>
>;
type Subset_DF_has_undo = Assert<Equals<HasMethod<Subset_DF, 'undo'>, false>>;
type Subset_DF_has_redo = Assert<Equals<HasMethod<Subset_DF, 'redo'>, false>>;
type Subset_DF_has_canUndo = Assert<
  Equals<HasMethod<Subset_DF, 'canUndo'>, false>
>;
type Subset_DF_has_canRedo = Assert<
  Equals<HasMethod<Subset_DF, 'canRedo'>, false>
>;
type Subset_DF_has_getHistory = Assert<
  Equals<HasMethod<Subset_DF, 'getHistory'>, false>
>;
type Subset_DF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_DF, 'resetHistory'>, false>
>;
type Subset_DF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_DF, 'jumpTo'>, false>
>;
type Subset_DF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_DF, 'getCurrentIndex'>, false>
>;
type Subset_DF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_DF, 'connectDevTools'>, true>
>;
type Subset_DF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_DF, 'disconnectDevTools'>, true>
>;
type Subset_DF_has_entities = Assert<
  Equals<HasMethod<Subset_DF, 'entities'>, false>
>;
type Subset_DF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_DF, 'updateOptimized'>, true>
>;

type Subset_ADF = BatchingMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ADF_has_batch = Assert<
  Equals<HasMethod<Subset_ADF, 'batch'>, true>
>;
type Subset_ADF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ADF, 'batchUpdate'>, true>
>;
type Subset_ADF_has_memoize = Assert<
  Equals<HasMethod<Subset_ADF, 'memoize'>, false>
>;
type Subset_ADF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ADF, 'memoizedUpdate'>, false>
>;
type Subset_ADF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ADF, 'clearMemoCache'>, false>
>;
type Subset_ADF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ADF, 'getCacheStats'>, false>
>;
type Subset_ADF_has_undo = Assert<Equals<HasMethod<Subset_ADF, 'undo'>, false>>;
type Subset_ADF_has_redo = Assert<Equals<HasMethod<Subset_ADF, 'redo'>, false>>;
type Subset_ADF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ADF, 'canUndo'>, false>
>;
type Subset_ADF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ADF, 'canRedo'>, false>
>;
type Subset_ADF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ADF, 'getHistory'>, false>
>;
type Subset_ADF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ADF, 'resetHistory'>, false>
>;
type Subset_ADF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ADF, 'jumpTo'>, false>
>;
type Subset_ADF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ADF, 'getCurrentIndex'>, false>
>;
type Subset_ADF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ADF, 'connectDevTools'>, true>
>;
type Subset_ADF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ADF, 'disconnectDevTools'>, true>
>;
type Subset_ADF_has_entities = Assert<
  Equals<HasMethod<Subset_ADF, 'entities'>, false>
>;
type Subset_ADF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ADF, 'updateOptimized'>, true>
>;

type Subset_BDF = MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BDF_has_batch = Assert<
  Equals<HasMethod<Subset_BDF, 'batch'>, false>
>;
type Subset_BDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BDF, 'batchUpdate'>, false>
>;
type Subset_BDF_has_memoize = Assert<
  Equals<HasMethod<Subset_BDF, 'memoize'>, true>
>;
type Subset_BDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BDF, 'memoizedUpdate'>, true>
>;
type Subset_BDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BDF, 'clearMemoCache'>, true>
>;
type Subset_BDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BDF, 'getCacheStats'>, true>
>;
type Subset_BDF_has_undo = Assert<Equals<HasMethod<Subset_BDF, 'undo'>, false>>;
type Subset_BDF_has_redo = Assert<Equals<HasMethod<Subset_BDF, 'redo'>, false>>;
type Subset_BDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BDF, 'canUndo'>, false>
>;
type Subset_BDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BDF, 'canRedo'>, false>
>;
type Subset_BDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BDF, 'getHistory'>, false>
>;
type Subset_BDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BDF, 'resetHistory'>, false>
>;
type Subset_BDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BDF, 'jumpTo'>, false>
>;
type Subset_BDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BDF, 'getCurrentIndex'>, false>
>;
type Subset_BDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BDF, 'connectDevTools'>, true>
>;
type Subset_BDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BDF, 'disconnectDevTools'>, true>
>;
type Subset_BDF_has_entities = Assert<
  Equals<HasMethod<Subset_BDF, 'entities'>, false>
>;
type Subset_BDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BDF, 'updateOptimized'>, true>
>;

type Subset_ABDF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABDF_has_batch = Assert<
  Equals<HasMethod<Subset_ABDF, 'batch'>, true>
>;
type Subset_ABDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABDF, 'batchUpdate'>, true>
>;
type Subset_ABDF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABDF, 'memoize'>, true>
>;
type Subset_ABDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABDF, 'memoizedUpdate'>, true>
>;
type Subset_ABDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABDF, 'clearMemoCache'>, true>
>;
type Subset_ABDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABDF, 'getCacheStats'>, true>
>;
type Subset_ABDF_has_undo = Assert<
  Equals<HasMethod<Subset_ABDF, 'undo'>, false>
>;
type Subset_ABDF_has_redo = Assert<
  Equals<HasMethod<Subset_ABDF, 'redo'>, false>
>;
type Subset_ABDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABDF, 'canUndo'>, false>
>;
type Subset_ABDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABDF, 'canRedo'>, false>
>;
type Subset_ABDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABDF, 'getHistory'>, false>
>;
type Subset_ABDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABDF, 'resetHistory'>, false>
>;
type Subset_ABDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABDF, 'jumpTo'>, false>
>;
type Subset_ABDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABDF, 'getCurrentIndex'>, false>
>;
type Subset_ABDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABDF, 'connectDevTools'>, true>
>;
type Subset_ABDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABDF, 'disconnectDevTools'>, true>
>;
type Subset_ABDF_has_entities = Assert<
  Equals<HasMethod<Subset_ABDF, 'entities'>, false>
>;
type Subset_ABDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABDF, 'updateOptimized'>, true>
>;

type Subset_CDF = TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_CDF_has_batch = Assert<
  Equals<HasMethod<Subset_CDF, 'batch'>, false>
>;
type Subset_CDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CDF, 'batchUpdate'>, false>
>;
type Subset_CDF_has_memoize = Assert<
  Equals<HasMethod<Subset_CDF, 'memoize'>, false>
>;
type Subset_CDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CDF, 'memoizedUpdate'>, false>
>;
type Subset_CDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CDF, 'clearMemoCache'>, false>
>;
type Subset_CDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CDF, 'getCacheStats'>, false>
>;
type Subset_CDF_has_undo = Assert<Equals<HasMethod<Subset_CDF, 'undo'>, true>>;
type Subset_CDF_has_redo = Assert<Equals<HasMethod<Subset_CDF, 'redo'>, true>>;
type Subset_CDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_CDF, 'canUndo'>, true>
>;
type Subset_CDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_CDF, 'canRedo'>, true>
>;
type Subset_CDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_CDF, 'getHistory'>, true>
>;
type Subset_CDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CDF, 'resetHistory'>, true>
>;
type Subset_CDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CDF, 'jumpTo'>, true>
>;
type Subset_CDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CDF, 'getCurrentIndex'>, true>
>;
type Subset_CDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CDF, 'connectDevTools'>, true>
>;
type Subset_CDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CDF, 'disconnectDevTools'>, true>
>;
type Subset_CDF_has_entities = Assert<
  Equals<HasMethod<Subset_CDF, 'entities'>, false>
>;
type Subset_CDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CDF, 'updateOptimized'>, true>
>;

type Subset_ACDF = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ACDF_has_batch = Assert<
  Equals<HasMethod<Subset_ACDF, 'batch'>, true>
>;
type Subset_ACDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACDF, 'batchUpdate'>, true>
>;
type Subset_ACDF_has_memoize = Assert<
  Equals<HasMethod<Subset_ACDF, 'memoize'>, false>
>;
type Subset_ACDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACDF, 'memoizedUpdate'>, false>
>;
type Subset_ACDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACDF, 'clearMemoCache'>, false>
>;
type Subset_ACDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACDF, 'getCacheStats'>, false>
>;
type Subset_ACDF_has_undo = Assert<
  Equals<HasMethod<Subset_ACDF, 'undo'>, true>
>;
type Subset_ACDF_has_redo = Assert<
  Equals<HasMethod<Subset_ACDF, 'redo'>, true>
>;
type Subset_ACDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACDF, 'canUndo'>, true>
>;
type Subset_ACDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACDF, 'canRedo'>, true>
>;
type Subset_ACDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACDF, 'getHistory'>, true>
>;
type Subset_ACDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACDF, 'resetHistory'>, true>
>;
type Subset_ACDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACDF, 'jumpTo'>, true>
>;
type Subset_ACDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACDF, 'getCurrentIndex'>, true>
>;
type Subset_ACDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACDF, 'connectDevTools'>, true>
>;
type Subset_ACDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACDF, 'disconnectDevTools'>, true>
>;
type Subset_ACDF_has_entities = Assert<
  Equals<HasMethod<Subset_ACDF, 'entities'>, false>
>;
type Subset_ACDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACDF, 'updateOptimized'>, true>
>;

type Subset_BCDF = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BCDF_has_batch = Assert<
  Equals<HasMethod<Subset_BCDF, 'batch'>, false>
>;
type Subset_BCDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCDF, 'batchUpdate'>, false>
>;
type Subset_BCDF_has_memoize = Assert<
  Equals<HasMethod<Subset_BCDF, 'memoize'>, true>
>;
type Subset_BCDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCDF, 'memoizedUpdate'>, true>
>;
type Subset_BCDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCDF, 'clearMemoCache'>, true>
>;
type Subset_BCDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCDF, 'getCacheStats'>, true>
>;
type Subset_BCDF_has_undo = Assert<
  Equals<HasMethod<Subset_BCDF, 'undo'>, true>
>;
type Subset_BCDF_has_redo = Assert<
  Equals<HasMethod<Subset_BCDF, 'redo'>, true>
>;
type Subset_BCDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCDF, 'canUndo'>, true>
>;
type Subset_BCDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCDF, 'canRedo'>, true>
>;
type Subset_BCDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCDF, 'getHistory'>, true>
>;
type Subset_BCDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCDF, 'resetHistory'>, true>
>;
type Subset_BCDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCDF, 'jumpTo'>, true>
>;
type Subset_BCDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCDF, 'getCurrentIndex'>, true>
>;
type Subset_BCDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCDF, 'connectDevTools'>, true>
>;
type Subset_BCDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCDF, 'disconnectDevTools'>, true>
>;
type Subset_BCDF_has_entities = Assert<
  Equals<HasMethod<Subset_BCDF, 'entities'>, false>
>;
type Subset_BCDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCDF, 'updateOptimized'>, true>
>;

type Subset_ABCDF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABCDF_has_batch = Assert<
  Equals<HasMethod<Subset_ABCDF, 'batch'>, true>
>;
type Subset_ABCDF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCDF, 'batchUpdate'>, true>
>;
type Subset_ABCDF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCDF, 'memoize'>, true>
>;
type Subset_ABCDF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCDF, 'memoizedUpdate'>, true>
>;
type Subset_ABCDF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCDF, 'clearMemoCache'>, true>
>;
type Subset_ABCDF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCDF, 'getCacheStats'>, true>
>;
type Subset_ABCDF_has_undo = Assert<
  Equals<HasMethod<Subset_ABCDF, 'undo'>, true>
>;
type Subset_ABCDF_has_redo = Assert<
  Equals<HasMethod<Subset_ABCDF, 'redo'>, true>
>;
type Subset_ABCDF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCDF, 'canUndo'>, true>
>;
type Subset_ABCDF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCDF, 'canRedo'>, true>
>;
type Subset_ABCDF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCDF, 'getHistory'>, true>
>;
type Subset_ABCDF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCDF, 'resetHistory'>, true>
>;
type Subset_ABCDF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCDF, 'jumpTo'>, true>
>;
type Subset_ABCDF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCDF, 'getCurrentIndex'>, true>
>;
type Subset_ABCDF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDF, 'connectDevTools'>, true>
>;
type Subset_ABCDF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDF, 'disconnectDevTools'>, true>
>;
type Subset_ABCDF_has_entities = Assert<
  Equals<HasMethod<Subset_ABCDF, 'entities'>, false>
>;
type Subset_ABCDF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCDF, 'updateOptimized'>, true>
>;

type Subset_EF = EntitiesMethods<Tree> & OptimizedUpdateMethods<Tree>;
type Subset_EF_has_batch = Assert<Equals<HasMethod<Subset_EF, 'batch'>, false>>;
type Subset_EF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_EF, 'batchUpdate'>, false>
>;
type Subset_EF_has_memoize = Assert<
  Equals<HasMethod<Subset_EF, 'memoize'>, false>
>;
type Subset_EF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_EF, 'memoizedUpdate'>, false>
>;
type Subset_EF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_EF, 'clearMemoCache'>, false>
>;
type Subset_EF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_EF, 'getCacheStats'>, false>
>;
type Subset_EF_has_undo = Assert<Equals<HasMethod<Subset_EF, 'undo'>, false>>;
type Subset_EF_has_redo = Assert<Equals<HasMethod<Subset_EF, 'redo'>, false>>;
type Subset_EF_has_canUndo = Assert<
  Equals<HasMethod<Subset_EF, 'canUndo'>, false>
>;
type Subset_EF_has_canRedo = Assert<
  Equals<HasMethod<Subset_EF, 'canRedo'>, false>
>;
type Subset_EF_has_getHistory = Assert<
  Equals<HasMethod<Subset_EF, 'getHistory'>, false>
>;
type Subset_EF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_EF, 'resetHistory'>, false>
>;
type Subset_EF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_EF, 'jumpTo'>, false>
>;
type Subset_EF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_EF, 'getCurrentIndex'>, false>
>;
type Subset_EF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_EF, 'connectDevTools'>, false>
>;
type Subset_EF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_EF, 'disconnectDevTools'>, false>
>;
type Subset_EF_has_entities = Assert<
  Equals<HasMethod<Subset_EF, 'entities'>, true>
>;
type Subset_EF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_EF, 'updateOptimized'>, true>
>;

type Subset_AEF = BatchingMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_AEF_has_batch = Assert<
  Equals<HasMethod<Subset_AEF, 'batch'>, true>
>;
type Subset_AEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_AEF, 'batchUpdate'>, true>
>;
type Subset_AEF_has_memoize = Assert<
  Equals<HasMethod<Subset_AEF, 'memoize'>, false>
>;
type Subset_AEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_AEF, 'memoizedUpdate'>, false>
>;
type Subset_AEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_AEF, 'clearMemoCache'>, false>
>;
type Subset_AEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_AEF, 'getCacheStats'>, false>
>;
type Subset_AEF_has_undo = Assert<Equals<HasMethod<Subset_AEF, 'undo'>, false>>;
type Subset_AEF_has_redo = Assert<Equals<HasMethod<Subset_AEF, 'redo'>, false>>;
type Subset_AEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_AEF, 'canUndo'>, false>
>;
type Subset_AEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_AEF, 'canRedo'>, false>
>;
type Subset_AEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_AEF, 'getHistory'>, false>
>;
type Subset_AEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_AEF, 'resetHistory'>, false>
>;
type Subset_AEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_AEF, 'jumpTo'>, false>
>;
type Subset_AEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_AEF, 'getCurrentIndex'>, false>
>;
type Subset_AEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_AEF, 'connectDevTools'>, false>
>;
type Subset_AEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_AEF, 'disconnectDevTools'>, false>
>;
type Subset_AEF_has_entities = Assert<
  Equals<HasMethod<Subset_AEF, 'entities'>, true>
>;
type Subset_AEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_AEF, 'updateOptimized'>, true>
>;

type Subset_BEF = MemoizationMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BEF_has_batch = Assert<
  Equals<HasMethod<Subset_BEF, 'batch'>, false>
>;
type Subset_BEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BEF, 'batchUpdate'>, false>
>;
type Subset_BEF_has_memoize = Assert<
  Equals<HasMethod<Subset_BEF, 'memoize'>, true>
>;
type Subset_BEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BEF, 'memoizedUpdate'>, true>
>;
type Subset_BEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BEF, 'clearMemoCache'>, true>
>;
type Subset_BEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BEF, 'getCacheStats'>, true>
>;
type Subset_BEF_has_undo = Assert<Equals<HasMethod<Subset_BEF, 'undo'>, false>>;
type Subset_BEF_has_redo = Assert<Equals<HasMethod<Subset_BEF, 'redo'>, false>>;
type Subset_BEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BEF, 'canUndo'>, false>
>;
type Subset_BEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BEF, 'canRedo'>, false>
>;
type Subset_BEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BEF, 'getHistory'>, false>
>;
type Subset_BEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BEF, 'resetHistory'>, false>
>;
type Subset_BEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BEF, 'jumpTo'>, false>
>;
type Subset_BEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BEF, 'getCurrentIndex'>, false>
>;
type Subset_BEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BEF, 'connectDevTools'>, false>
>;
type Subset_BEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BEF, 'disconnectDevTools'>, false>
>;
type Subset_BEF_has_entities = Assert<
  Equals<HasMethod<Subset_BEF, 'entities'>, true>
>;
type Subset_BEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BEF, 'updateOptimized'>, true>
>;

type Subset_ABEF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABEF_has_batch = Assert<
  Equals<HasMethod<Subset_ABEF, 'batch'>, true>
>;
type Subset_ABEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABEF, 'batchUpdate'>, true>
>;
type Subset_ABEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABEF, 'memoize'>, true>
>;
type Subset_ABEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABEF, 'memoizedUpdate'>, true>
>;
type Subset_ABEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABEF, 'clearMemoCache'>, true>
>;
type Subset_ABEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABEF, 'getCacheStats'>, true>
>;
type Subset_ABEF_has_undo = Assert<
  Equals<HasMethod<Subset_ABEF, 'undo'>, false>
>;
type Subset_ABEF_has_redo = Assert<
  Equals<HasMethod<Subset_ABEF, 'redo'>, false>
>;
type Subset_ABEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABEF, 'canUndo'>, false>
>;
type Subset_ABEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABEF, 'canRedo'>, false>
>;
type Subset_ABEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABEF, 'getHistory'>, false>
>;
type Subset_ABEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABEF, 'resetHistory'>, false>
>;
type Subset_ABEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABEF, 'jumpTo'>, false>
>;
type Subset_ABEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABEF, 'getCurrentIndex'>, false>
>;
type Subset_ABEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABEF, 'connectDevTools'>, false>
>;
type Subset_ABEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABEF, 'disconnectDevTools'>, false>
>;
type Subset_ABEF_has_entities = Assert<
  Equals<HasMethod<Subset_ABEF, 'entities'>, true>
>;
type Subset_ABEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABEF, 'updateOptimized'>, true>
>;

type Subset_CEF = TimeTravelMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_CEF_has_batch = Assert<
  Equals<HasMethod<Subset_CEF, 'batch'>, false>
>;
type Subset_CEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CEF, 'batchUpdate'>, false>
>;
type Subset_CEF_has_memoize = Assert<
  Equals<HasMethod<Subset_CEF, 'memoize'>, false>
>;
type Subset_CEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CEF, 'memoizedUpdate'>, false>
>;
type Subset_CEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CEF, 'clearMemoCache'>, false>
>;
type Subset_CEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CEF, 'getCacheStats'>, false>
>;
type Subset_CEF_has_undo = Assert<Equals<HasMethod<Subset_CEF, 'undo'>, true>>;
type Subset_CEF_has_redo = Assert<Equals<HasMethod<Subset_CEF, 'redo'>, true>>;
type Subset_CEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_CEF, 'canUndo'>, true>
>;
type Subset_CEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_CEF, 'canRedo'>, true>
>;
type Subset_CEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_CEF, 'getHistory'>, true>
>;
type Subset_CEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CEF, 'resetHistory'>, true>
>;
type Subset_CEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CEF, 'jumpTo'>, true>
>;
type Subset_CEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CEF, 'getCurrentIndex'>, true>
>;
type Subset_CEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CEF, 'connectDevTools'>, false>
>;
type Subset_CEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CEF, 'disconnectDevTools'>, false>
>;
type Subset_CEF_has_entities = Assert<
  Equals<HasMethod<Subset_CEF, 'entities'>, true>
>;
type Subset_CEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CEF, 'updateOptimized'>, true>
>;

type Subset_ACEF = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ACEF_has_batch = Assert<
  Equals<HasMethod<Subset_ACEF, 'batch'>, true>
>;
type Subset_ACEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACEF, 'batchUpdate'>, true>
>;
type Subset_ACEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ACEF, 'memoize'>, false>
>;
type Subset_ACEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACEF, 'memoizedUpdate'>, false>
>;
type Subset_ACEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACEF, 'clearMemoCache'>, false>
>;
type Subset_ACEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACEF, 'getCacheStats'>, false>
>;
type Subset_ACEF_has_undo = Assert<
  Equals<HasMethod<Subset_ACEF, 'undo'>, true>
>;
type Subset_ACEF_has_redo = Assert<
  Equals<HasMethod<Subset_ACEF, 'redo'>, true>
>;
type Subset_ACEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACEF, 'canUndo'>, true>
>;
type Subset_ACEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACEF, 'canRedo'>, true>
>;
type Subset_ACEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACEF, 'getHistory'>, true>
>;
type Subset_ACEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACEF, 'resetHistory'>, true>
>;
type Subset_ACEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACEF, 'jumpTo'>, true>
>;
type Subset_ACEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACEF, 'getCurrentIndex'>, true>
>;
type Subset_ACEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACEF, 'connectDevTools'>, false>
>;
type Subset_ACEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACEF, 'disconnectDevTools'>, false>
>;
type Subset_ACEF_has_entities = Assert<
  Equals<HasMethod<Subset_ACEF, 'entities'>, true>
>;
type Subset_ACEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACEF, 'updateOptimized'>, true>
>;

type Subset_BCEF = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BCEF_has_batch = Assert<
  Equals<HasMethod<Subset_BCEF, 'batch'>, false>
>;
type Subset_BCEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCEF, 'batchUpdate'>, false>
>;
type Subset_BCEF_has_memoize = Assert<
  Equals<HasMethod<Subset_BCEF, 'memoize'>, true>
>;
type Subset_BCEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCEF, 'memoizedUpdate'>, true>
>;
type Subset_BCEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCEF, 'clearMemoCache'>, true>
>;
type Subset_BCEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCEF, 'getCacheStats'>, true>
>;
type Subset_BCEF_has_undo = Assert<
  Equals<HasMethod<Subset_BCEF, 'undo'>, true>
>;
type Subset_BCEF_has_redo = Assert<
  Equals<HasMethod<Subset_BCEF, 'redo'>, true>
>;
type Subset_BCEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCEF, 'canUndo'>, true>
>;
type Subset_BCEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCEF, 'canRedo'>, true>
>;
type Subset_BCEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCEF, 'getHistory'>, true>
>;
type Subset_BCEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCEF, 'resetHistory'>, true>
>;
type Subset_BCEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCEF, 'jumpTo'>, true>
>;
type Subset_BCEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCEF, 'getCurrentIndex'>, true>
>;
type Subset_BCEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCEF, 'connectDevTools'>, false>
>;
type Subset_BCEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCEF, 'disconnectDevTools'>, false>
>;
type Subset_BCEF_has_entities = Assert<
  Equals<HasMethod<Subset_BCEF, 'entities'>, true>
>;
type Subset_BCEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCEF, 'updateOptimized'>, true>
>;

type Subset_ABCEF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABCEF_has_batch = Assert<
  Equals<HasMethod<Subset_ABCEF, 'batch'>, true>
>;
type Subset_ABCEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCEF, 'batchUpdate'>, true>
>;
type Subset_ABCEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCEF, 'memoize'>, true>
>;
type Subset_ABCEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCEF, 'memoizedUpdate'>, true>
>;
type Subset_ABCEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCEF, 'clearMemoCache'>, true>
>;
type Subset_ABCEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCEF, 'getCacheStats'>, true>
>;
type Subset_ABCEF_has_undo = Assert<
  Equals<HasMethod<Subset_ABCEF, 'undo'>, true>
>;
type Subset_ABCEF_has_redo = Assert<
  Equals<HasMethod<Subset_ABCEF, 'redo'>, true>
>;
type Subset_ABCEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCEF, 'canUndo'>, true>
>;
type Subset_ABCEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCEF, 'canRedo'>, true>
>;
type Subset_ABCEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCEF, 'getHistory'>, true>
>;
type Subset_ABCEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCEF, 'resetHistory'>, true>
>;
type Subset_ABCEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCEF, 'jumpTo'>, true>
>;
type Subset_ABCEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCEF, 'getCurrentIndex'>, true>
>;
type Subset_ABCEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCEF, 'connectDevTools'>, false>
>;
type Subset_ABCEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCEF, 'disconnectDevTools'>, false>
>;
type Subset_ABCEF_has_entities = Assert<
  Equals<HasMethod<Subset_ABCEF, 'entities'>, true>
>;
type Subset_ABCEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCEF, 'updateOptimized'>, true>
>;

type Subset_DEF = DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_DEF_has_batch = Assert<
  Equals<HasMethod<Subset_DEF, 'batch'>, false>
>;
type Subset_DEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_DEF, 'batchUpdate'>, false>
>;
type Subset_DEF_has_memoize = Assert<
  Equals<HasMethod<Subset_DEF, 'memoize'>, false>
>;
type Subset_DEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_DEF, 'memoizedUpdate'>, false>
>;
type Subset_DEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_DEF, 'clearMemoCache'>, false>
>;
type Subset_DEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_DEF, 'getCacheStats'>, false>
>;
type Subset_DEF_has_undo = Assert<Equals<HasMethod<Subset_DEF, 'undo'>, false>>;
type Subset_DEF_has_redo = Assert<Equals<HasMethod<Subset_DEF, 'redo'>, false>>;
type Subset_DEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_DEF, 'canUndo'>, false>
>;
type Subset_DEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_DEF, 'canRedo'>, false>
>;
type Subset_DEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_DEF, 'getHistory'>, false>
>;
type Subset_DEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_DEF, 'resetHistory'>, false>
>;
type Subset_DEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_DEF, 'jumpTo'>, false>
>;
type Subset_DEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_DEF, 'getCurrentIndex'>, false>
>;
type Subset_DEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_DEF, 'connectDevTools'>, true>
>;
type Subset_DEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_DEF, 'disconnectDevTools'>, true>
>;
type Subset_DEF_has_entities = Assert<
  Equals<HasMethod<Subset_DEF, 'entities'>, true>
>;
type Subset_DEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_DEF, 'updateOptimized'>, true>
>;

type Subset_ADEF = BatchingMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ADEF_has_batch = Assert<
  Equals<HasMethod<Subset_ADEF, 'batch'>, true>
>;
type Subset_ADEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ADEF, 'batchUpdate'>, true>
>;
type Subset_ADEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ADEF, 'memoize'>, false>
>;
type Subset_ADEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ADEF, 'memoizedUpdate'>, false>
>;
type Subset_ADEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ADEF, 'clearMemoCache'>, false>
>;
type Subset_ADEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ADEF, 'getCacheStats'>, false>
>;
type Subset_ADEF_has_undo = Assert<
  Equals<HasMethod<Subset_ADEF, 'undo'>, false>
>;
type Subset_ADEF_has_redo = Assert<
  Equals<HasMethod<Subset_ADEF, 'redo'>, false>
>;
type Subset_ADEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ADEF, 'canUndo'>, false>
>;
type Subset_ADEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ADEF, 'canRedo'>, false>
>;
type Subset_ADEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ADEF, 'getHistory'>, false>
>;
type Subset_ADEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ADEF, 'resetHistory'>, false>
>;
type Subset_ADEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ADEF, 'jumpTo'>, false>
>;
type Subset_ADEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ADEF, 'getCurrentIndex'>, false>
>;
type Subset_ADEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ADEF, 'connectDevTools'>, true>
>;
type Subset_ADEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ADEF, 'disconnectDevTools'>, true>
>;
type Subset_ADEF_has_entities = Assert<
  Equals<HasMethod<Subset_ADEF, 'entities'>, true>
>;
type Subset_ADEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ADEF, 'updateOptimized'>, true>
>;

type Subset_BDEF = MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BDEF_has_batch = Assert<
  Equals<HasMethod<Subset_BDEF, 'batch'>, false>
>;
type Subset_BDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BDEF, 'batchUpdate'>, false>
>;
type Subset_BDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_BDEF, 'memoize'>, true>
>;
type Subset_BDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BDEF, 'memoizedUpdate'>, true>
>;
type Subset_BDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BDEF, 'clearMemoCache'>, true>
>;
type Subset_BDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BDEF, 'getCacheStats'>, true>
>;
type Subset_BDEF_has_undo = Assert<
  Equals<HasMethod<Subset_BDEF, 'undo'>, false>
>;
type Subset_BDEF_has_redo = Assert<
  Equals<HasMethod<Subset_BDEF, 'redo'>, false>
>;
type Subset_BDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BDEF, 'canUndo'>, false>
>;
type Subset_BDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BDEF, 'canRedo'>, false>
>;
type Subset_BDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BDEF, 'getHistory'>, false>
>;
type Subset_BDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BDEF, 'resetHistory'>, false>
>;
type Subset_BDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BDEF, 'jumpTo'>, false>
>;
type Subset_BDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BDEF, 'getCurrentIndex'>, false>
>;
type Subset_BDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BDEF, 'connectDevTools'>, true>
>;
type Subset_BDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BDEF, 'disconnectDevTools'>, true>
>;
type Subset_BDEF_has_entities = Assert<
  Equals<HasMethod<Subset_BDEF, 'entities'>, true>
>;
type Subset_BDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BDEF, 'updateOptimized'>, true>
>;

type Subset_ABDEF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABDEF_has_batch = Assert<
  Equals<HasMethod<Subset_ABDEF, 'batch'>, true>
>;
type Subset_ABDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABDEF, 'batchUpdate'>, true>
>;
type Subset_ABDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABDEF, 'memoize'>, true>
>;
type Subset_ABDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABDEF, 'memoizedUpdate'>, true>
>;
type Subset_ABDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABDEF, 'clearMemoCache'>, true>
>;
type Subset_ABDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABDEF, 'getCacheStats'>, true>
>;
type Subset_ABDEF_has_undo = Assert<
  Equals<HasMethod<Subset_ABDEF, 'undo'>, false>
>;
type Subset_ABDEF_has_redo = Assert<
  Equals<HasMethod<Subset_ABDEF, 'redo'>, false>
>;
type Subset_ABDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABDEF, 'canUndo'>, false>
>;
type Subset_ABDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABDEF, 'canRedo'>, false>
>;
type Subset_ABDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABDEF, 'getHistory'>, false>
>;
type Subset_ABDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABDEF, 'resetHistory'>, false>
>;
type Subset_ABDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABDEF, 'jumpTo'>, false>
>;
type Subset_ABDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABDEF, 'getCurrentIndex'>, false>
>;
type Subset_ABDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABDEF, 'connectDevTools'>, true>
>;
type Subset_ABDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABDEF, 'disconnectDevTools'>, true>
>;
type Subset_ABDEF_has_entities = Assert<
  Equals<HasMethod<Subset_ABDEF, 'entities'>, true>
>;
type Subset_ABDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABDEF, 'updateOptimized'>, true>
>;

type Subset_CDEF = TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_CDEF_has_batch = Assert<
  Equals<HasMethod<Subset_CDEF, 'batch'>, false>
>;
type Subset_CDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_CDEF, 'batchUpdate'>, false>
>;
type Subset_CDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_CDEF, 'memoize'>, false>
>;
type Subset_CDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_CDEF, 'memoizedUpdate'>, false>
>;
type Subset_CDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_CDEF, 'clearMemoCache'>, false>
>;
type Subset_CDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_CDEF, 'getCacheStats'>, false>
>;
type Subset_CDEF_has_undo = Assert<
  Equals<HasMethod<Subset_CDEF, 'undo'>, true>
>;
type Subset_CDEF_has_redo = Assert<
  Equals<HasMethod<Subset_CDEF, 'redo'>, true>
>;
type Subset_CDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_CDEF, 'canUndo'>, true>
>;
type Subset_CDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_CDEF, 'canRedo'>, true>
>;
type Subset_CDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_CDEF, 'getHistory'>, true>
>;
type Subset_CDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_CDEF, 'resetHistory'>, true>
>;
type Subset_CDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_CDEF, 'jumpTo'>, true>
>;
type Subset_CDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_CDEF, 'getCurrentIndex'>, true>
>;
type Subset_CDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_CDEF, 'connectDevTools'>, true>
>;
type Subset_CDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_CDEF, 'disconnectDevTools'>, true>
>;
type Subset_CDEF_has_entities = Assert<
  Equals<HasMethod<Subset_CDEF, 'entities'>, true>
>;
type Subset_CDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_CDEF, 'updateOptimized'>, true>
>;

type Subset_ACDEF = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ACDEF_has_batch = Assert<
  Equals<HasMethod<Subset_ACDEF, 'batch'>, true>
>;
type Subset_ACDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ACDEF, 'batchUpdate'>, true>
>;
type Subset_ACDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ACDEF, 'memoize'>, false>
>;
type Subset_ACDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ACDEF, 'memoizedUpdate'>, false>
>;
type Subset_ACDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ACDEF, 'clearMemoCache'>, false>
>;
type Subset_ACDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ACDEF, 'getCacheStats'>, false>
>;
type Subset_ACDEF_has_undo = Assert<
  Equals<HasMethod<Subset_ACDEF, 'undo'>, true>
>;
type Subset_ACDEF_has_redo = Assert<
  Equals<HasMethod<Subset_ACDEF, 'redo'>, true>
>;
type Subset_ACDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ACDEF, 'canUndo'>, true>
>;
type Subset_ACDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ACDEF, 'canRedo'>, true>
>;
type Subset_ACDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ACDEF, 'getHistory'>, true>
>;
type Subset_ACDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ACDEF, 'resetHistory'>, true>
>;
type Subset_ACDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ACDEF, 'jumpTo'>, true>
>;
type Subset_ACDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ACDEF, 'getCurrentIndex'>, true>
>;
type Subset_ACDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ACDEF, 'connectDevTools'>, true>
>;
type Subset_ACDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ACDEF, 'disconnectDevTools'>, true>
>;
type Subset_ACDEF_has_entities = Assert<
  Equals<HasMethod<Subset_ACDEF, 'entities'>, true>
>;
type Subset_ACDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ACDEF, 'updateOptimized'>, true>
>;

type Subset_BCDEF = MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_BCDEF_has_batch = Assert<
  Equals<HasMethod<Subset_BCDEF, 'batch'>, false>
>;
type Subset_BCDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_BCDEF, 'batchUpdate'>, false>
>;
type Subset_BCDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_BCDEF, 'memoize'>, true>
>;
type Subset_BCDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_BCDEF, 'memoizedUpdate'>, true>
>;
type Subset_BCDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_BCDEF, 'clearMemoCache'>, true>
>;
type Subset_BCDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_BCDEF, 'getCacheStats'>, true>
>;
type Subset_BCDEF_has_undo = Assert<
  Equals<HasMethod<Subset_BCDEF, 'undo'>, true>
>;
type Subset_BCDEF_has_redo = Assert<
  Equals<HasMethod<Subset_BCDEF, 'redo'>, true>
>;
type Subset_BCDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_BCDEF, 'canUndo'>, true>
>;
type Subset_BCDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_BCDEF, 'canRedo'>, true>
>;
type Subset_BCDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_BCDEF, 'getHistory'>, true>
>;
type Subset_BCDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_BCDEF, 'resetHistory'>, true>
>;
type Subset_BCDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_BCDEF, 'jumpTo'>, true>
>;
type Subset_BCDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_BCDEF, 'getCurrentIndex'>, true>
>;
type Subset_BCDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_BCDEF, 'connectDevTools'>, true>
>;
type Subset_BCDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_BCDEF, 'disconnectDevTools'>, true>
>;
type Subset_BCDEF_has_entities = Assert<
  Equals<HasMethod<Subset_BCDEF, 'entities'>, true>
>;
type Subset_BCDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_BCDEF, 'updateOptimized'>, true>
>;

type Subset_ABCDEF = BatchingMethods<Tree> &
  MemoizationMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods<Tree> &
  EntitiesMethods<Tree> &
  OptimizedUpdateMethods<Tree>;
type Subset_ABCDEF_has_batch = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'batch'>, true>
>;
type Subset_ABCDEF_has_batchUpdate = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'batchUpdate'>, true>
>;
type Subset_ABCDEF_has_memoize = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'memoize'>, true>
>;
type Subset_ABCDEF_has_memoizedUpdate = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'memoizedUpdate'>, true>
>;
type Subset_ABCDEF_has_clearMemoCache = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'clearMemoCache'>, true>
>;
type Subset_ABCDEF_has_getCacheStats = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'getCacheStats'>, true>
>;
type Subset_ABCDEF_has_undo = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'undo'>, true>
>;
type Subset_ABCDEF_has_redo = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'redo'>, true>
>;
type Subset_ABCDEF_has_canUndo = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'canUndo'>, true>
>;
type Subset_ABCDEF_has_canRedo = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'canRedo'>, true>
>;
type Subset_ABCDEF_has_getHistory = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'getHistory'>, true>
>;
type Subset_ABCDEF_has_resetHistory = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'resetHistory'>, true>
>;
type Subset_ABCDEF_has_jumpTo = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'jumpTo'>, true>
>;
type Subset_ABCDEF_has_getCurrentIndex = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'getCurrentIndex'>, true>
>;
type Subset_ABCDEF_has_connectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'connectDevTools'>, true>
>;
type Subset_ABCDEF_has_disconnectDevTools = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'disconnectDevTools'>, true>
>;
type Subset_ABCDEF_has_entities = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'entities'>, true>
>;
type Subset_ABCDEF_has_updateOptimized = Assert<
  Equals<HasMethod<Subset_ABCDEF, 'updateOptimized'>, true>
>;

export {};

import { describe, it, expect } from 'vitest';
describe('typing generated subsets (runtime shim)', () => { it('compiles type-level assertions', () => { expect(true).toBe(true); }); });
