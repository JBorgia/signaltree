// GENERATED FILE - do not edit by hand
// Comprehensive type-level checks for enhancer subsets
import type { Equals, Assert } from './helpers-types';
import type { SignalTree } from '../../lib/types';
type Tree = { count: number };
import type { BatchingMethods, TimeTravelMethods, DevToolsMethods } from '../../lib/types';

// Helper to detect method presence
type HasMethod<T, K extends string> = K extends keyof T ? true : false;

type Subset_A = BatchingMethods;
type Subset_A_has_batch = Assert<Equals<HasMethod<Subset_A, 'batch'>, true>>;
type Subset_A_has_coalesce = Assert<Equals<HasMethod<Subset_A, 'coalesce'>, true>>;
type Subset_A_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_A, 'hasPendingNotifications'>, true>>;
type Subset_A_has_flushNotifications = Assert<Equals<HasMethod<Subset_A, 'flushNotifications'>, true>>;
type Subset_A_has_undo = Assert<Equals<HasMethod<Subset_A, 'undo'>, false>>;
type Subset_A_has_redo = Assert<Equals<HasMethod<Subset_A, 'redo'>, false>>;
type Subset_A_has_canUndo = Assert<Equals<HasMethod<Subset_A, 'canUndo'>, false>>;
type Subset_A_has_canRedo = Assert<Equals<HasMethod<Subset_A, 'canRedo'>, false>>;
type Subset_A_has_getHistory = Assert<Equals<HasMethod<Subset_A, 'getHistory'>, false>>;
type Subset_A_has_resetHistory = Assert<Equals<HasMethod<Subset_A, 'resetHistory'>, false>>;
type Subset_A_has_jumpTo = Assert<Equals<HasMethod<Subset_A, 'jumpTo'>, false>>;
type Subset_A_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_A, 'getCurrentIndex'>, false>>;
type Subset_A_has_connectDevTools = Assert<Equals<HasMethod<Subset_A, 'connectDevTools'>, false>>;
type Subset_A_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_A, 'disconnectDevTools'>, false>>;

type Subset_C = TimeTravelMethods<Tree>;
type Subset_C_has_batch = Assert<Equals<HasMethod<Subset_C, 'batch'>, false>>;
type Subset_C_has_coalesce = Assert<Equals<HasMethod<Subset_C, 'coalesce'>, false>>;
type Subset_C_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_C, 'hasPendingNotifications'>, false>>;
type Subset_C_has_flushNotifications = Assert<Equals<HasMethod<Subset_C, 'flushNotifications'>, false>>;
type Subset_C_has_undo = Assert<Equals<HasMethod<Subset_C, 'undo'>, true>>;
type Subset_C_has_redo = Assert<Equals<HasMethod<Subset_C, 'redo'>, true>>;
type Subset_C_has_canUndo = Assert<Equals<HasMethod<Subset_C, 'canUndo'>, true>>;
type Subset_C_has_canRedo = Assert<Equals<HasMethod<Subset_C, 'canRedo'>, true>>;
type Subset_C_has_getHistory = Assert<Equals<HasMethod<Subset_C, 'getHistory'>, true>>;
type Subset_C_has_resetHistory = Assert<Equals<HasMethod<Subset_C, 'resetHistory'>, true>>;
type Subset_C_has_jumpTo = Assert<Equals<HasMethod<Subset_C, 'jumpTo'>, true>>;
type Subset_C_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_C, 'getCurrentIndex'>, true>>;
type Subset_C_has_connectDevTools = Assert<Equals<HasMethod<Subset_C, 'connectDevTools'>, false>>;
type Subset_C_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_C, 'disconnectDevTools'>, false>>;

type Subset_AC = BatchingMethods & TimeTravelMethods<Tree>;
type Subset_AC_has_batch = Assert<Equals<HasMethod<Subset_AC, 'batch'>, true>>;
type Subset_AC_has_coalesce = Assert<Equals<HasMethod<Subset_AC, 'coalesce'>, true>>;
type Subset_AC_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_AC, 'hasPendingNotifications'>, true>>;
type Subset_AC_has_flushNotifications = Assert<Equals<HasMethod<Subset_AC, 'flushNotifications'>, true>>;
type Subset_AC_has_undo = Assert<Equals<HasMethod<Subset_AC, 'undo'>, true>>;
type Subset_AC_has_redo = Assert<Equals<HasMethod<Subset_AC, 'redo'>, true>>;
type Subset_AC_has_canUndo = Assert<Equals<HasMethod<Subset_AC, 'canUndo'>, true>>;
type Subset_AC_has_canRedo = Assert<Equals<HasMethod<Subset_AC, 'canRedo'>, true>>;
type Subset_AC_has_getHistory = Assert<Equals<HasMethod<Subset_AC, 'getHistory'>, true>>;
type Subset_AC_has_resetHistory = Assert<Equals<HasMethod<Subset_AC, 'resetHistory'>, true>>;
type Subset_AC_has_jumpTo = Assert<Equals<HasMethod<Subset_AC, 'jumpTo'>, true>>;
type Subset_AC_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_AC, 'getCurrentIndex'>, true>>;
type Subset_AC_has_connectDevTools = Assert<Equals<HasMethod<Subset_AC, 'connectDevTools'>, false>>;
type Subset_AC_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_AC, 'disconnectDevTools'>, false>>;

type Subset_D = DevToolsMethods;
type Subset_D_has_batch = Assert<Equals<HasMethod<Subset_D, 'batch'>, false>>;
type Subset_D_has_coalesce = Assert<Equals<HasMethod<Subset_D, 'coalesce'>, false>>;
type Subset_D_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_D, 'hasPendingNotifications'>, false>>;
type Subset_D_has_flushNotifications = Assert<Equals<HasMethod<Subset_D, 'flushNotifications'>, false>>;
type Subset_D_has_undo = Assert<Equals<HasMethod<Subset_D, 'undo'>, false>>;
type Subset_D_has_redo = Assert<Equals<HasMethod<Subset_D, 'redo'>, false>>;
type Subset_D_has_canUndo = Assert<Equals<HasMethod<Subset_D, 'canUndo'>, false>>;
type Subset_D_has_canRedo = Assert<Equals<HasMethod<Subset_D, 'canRedo'>, false>>;
type Subset_D_has_getHistory = Assert<Equals<HasMethod<Subset_D, 'getHistory'>, false>>;
type Subset_D_has_resetHistory = Assert<Equals<HasMethod<Subset_D, 'resetHistory'>, false>>;
type Subset_D_has_jumpTo = Assert<Equals<HasMethod<Subset_D, 'jumpTo'>, false>>;
type Subset_D_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_D, 'getCurrentIndex'>, false>>;
type Subset_D_has_connectDevTools = Assert<Equals<HasMethod<Subset_D, 'connectDevTools'>, true>>;
type Subset_D_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_D, 'disconnectDevTools'>, true>>;

type Subset_AD = BatchingMethods & DevToolsMethods;
type Subset_AD_has_batch = Assert<Equals<HasMethod<Subset_AD, 'batch'>, true>>;
type Subset_AD_has_coalesce = Assert<Equals<HasMethod<Subset_AD, 'coalesce'>, true>>;
type Subset_AD_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_AD, 'hasPendingNotifications'>, true>>;
type Subset_AD_has_flushNotifications = Assert<Equals<HasMethod<Subset_AD, 'flushNotifications'>, true>>;
type Subset_AD_has_undo = Assert<Equals<HasMethod<Subset_AD, 'undo'>, false>>;
type Subset_AD_has_redo = Assert<Equals<HasMethod<Subset_AD, 'redo'>, false>>;
type Subset_AD_has_canUndo = Assert<Equals<HasMethod<Subset_AD, 'canUndo'>, false>>;
type Subset_AD_has_canRedo = Assert<Equals<HasMethod<Subset_AD, 'canRedo'>, false>>;
type Subset_AD_has_getHistory = Assert<Equals<HasMethod<Subset_AD, 'getHistory'>, false>>;
type Subset_AD_has_resetHistory = Assert<Equals<HasMethod<Subset_AD, 'resetHistory'>, false>>;
type Subset_AD_has_jumpTo = Assert<Equals<HasMethod<Subset_AD, 'jumpTo'>, false>>;
type Subset_AD_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_AD, 'getCurrentIndex'>, false>>;
type Subset_AD_has_connectDevTools = Assert<Equals<HasMethod<Subset_AD, 'connectDevTools'>, true>>;
type Subset_AD_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_AD, 'disconnectDevTools'>, true>>;

type Subset_CD = TimeTravelMethods<Tree> & DevToolsMethods;
type Subset_CD_has_batch = Assert<Equals<HasMethod<Subset_CD, 'batch'>, false>>;
type Subset_CD_has_coalesce = Assert<Equals<HasMethod<Subset_CD, 'coalesce'>, false>>;
type Subset_CD_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_CD, 'hasPendingNotifications'>, false>>;
type Subset_CD_has_flushNotifications = Assert<Equals<HasMethod<Subset_CD, 'flushNotifications'>, false>>;
type Subset_CD_has_undo = Assert<Equals<HasMethod<Subset_CD, 'undo'>, true>>;
type Subset_CD_has_redo = Assert<Equals<HasMethod<Subset_CD, 'redo'>, true>>;
type Subset_CD_has_canUndo = Assert<Equals<HasMethod<Subset_CD, 'canUndo'>, true>>;
type Subset_CD_has_canRedo = Assert<Equals<HasMethod<Subset_CD, 'canRedo'>, true>>;
type Subset_CD_has_getHistory = Assert<Equals<HasMethod<Subset_CD, 'getHistory'>, true>>;
type Subset_CD_has_resetHistory = Assert<Equals<HasMethod<Subset_CD, 'resetHistory'>, true>>;
type Subset_CD_has_jumpTo = Assert<Equals<HasMethod<Subset_CD, 'jumpTo'>, true>>;
type Subset_CD_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_CD, 'getCurrentIndex'>, true>>;
type Subset_CD_has_connectDevTools = Assert<Equals<HasMethod<Subset_CD, 'connectDevTools'>, true>>;
type Subset_CD_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_CD, 'disconnectDevTools'>, true>>;

type Subset_ACD = BatchingMethods & TimeTravelMethods<Tree> & DevToolsMethods;
type Subset_ACD_has_batch = Assert<Equals<HasMethod<Subset_ACD, 'batch'>, true>>;
type Subset_ACD_has_coalesce = Assert<Equals<HasMethod<Subset_ACD, 'coalesce'>, true>>;
type Subset_ACD_has_hasPendingNotifications = Assert<Equals<HasMethod<Subset_ACD, 'hasPendingNotifications'>, true>>;
type Subset_ACD_has_flushNotifications = Assert<Equals<HasMethod<Subset_ACD, 'flushNotifications'>, true>>;
type Subset_ACD_has_undo = Assert<Equals<HasMethod<Subset_ACD, 'undo'>, true>>;
type Subset_ACD_has_redo = Assert<Equals<HasMethod<Subset_ACD, 'redo'>, true>>;
type Subset_ACD_has_canUndo = Assert<Equals<HasMethod<Subset_ACD, 'canUndo'>, true>>;
type Subset_ACD_has_canRedo = Assert<Equals<HasMethod<Subset_ACD, 'canRedo'>, true>>;
type Subset_ACD_has_getHistory = Assert<Equals<HasMethod<Subset_ACD, 'getHistory'>, true>>;
type Subset_ACD_has_resetHistory = Assert<Equals<HasMethod<Subset_ACD, 'resetHistory'>, true>>;
type Subset_ACD_has_jumpTo = Assert<Equals<HasMethod<Subset_ACD, 'jumpTo'>, true>>;
type Subset_ACD_has_getCurrentIndex = Assert<Equals<HasMethod<Subset_ACD, 'getCurrentIndex'>, true>>;
type Subset_ACD_has_connectDevTools = Assert<Equals<HasMethod<Subset_ACD, 'connectDevTools'>, true>>;
type Subset_ACD_has_disconnectDevTools = Assert<Equals<HasMethod<Subset_ACD, 'disconnectDevTools'>, true>>;


export {};
