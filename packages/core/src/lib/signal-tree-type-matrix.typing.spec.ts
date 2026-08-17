/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * WHAT THIS FILE IS FOR
 *
 * `SignalTree<T>` is the canonical public tree type. `tools/api-inventory.mjs`
 * compares symbol SETS and metadata, so it structurally cannot see a type-shape
 * change to a symbol that keeps its name — the `TimeTravelMethods<T>` arity
 * change passed the inventory clean. This file is the missing dimension for the
 * one type every consumer annotates with: it pins what `SignalTree<T>` MEANS,
 * as a positive statement of capability rather than the absence of an error.
 *
 * The rows are deliberately `Equal<>` (identity) rather than assignability.
 * Assignability would pass on a widened type; identity fails on any drift in
 * either direction.
 *
 * Rule 0d — the branch-node contract is pinned here on purpose. The three call
 * forms and structural navigability of a branch are exactly what an API cleanup
 * pass is most likely to erode while every runtime test stays green.
 */
import type { Signal } from '@angular/core';

import type {
  AccessibleNode,
  AsyncQuerySignal,
  CallableWritableSignal,
  EntitySignal,
  Enhancer,
  FormSignal,
  ISignalTree,
  NodeAccessor,
  SignalTree,
  StatusSignal,
  StoredSignal,
  TreeNode,
} from '../index';
import type { asyncQuery, entityMap, form, status, stored } from '../index';

// --- compile-time assertion helpers -----------------------------------------
// Invariant identity, not assignability: `A` and `B` must be the SAME type.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;

// ============================================================================
// SECTION 0 — the helper is not vacuous
// ============================================================================
// Without these rows, every `Expect<Equal<…>>` below could be passing because
// `Equal` always answers `true`. It does not.
export type _HelperControls = [
  ExpectFalse<Equal<SignalTree<{ a: number }>, SignalTree<{ a: string }>>>,
  ExpectFalse<Equal<SignalTree<{ a: number }>, ISignalTree<{ a: number }>>>,
  ExpectFalse<Equal<NodeAccessor<{ a: number }>, TreeNode<{ a: number }>>>
];

// SECTION 1 was the transient `SignalTreeBase<T>` falsifier. It compared the
// alias against `SignalTree<T>` at an unresolved `T` (a universal statement,
// not a sampled one) plus one instantiation per dimension below, and was proven
// able to fire by two mutations of the alias before the symbol was removed. It
// was deleted with the symbol in the same commit; everything below is permanent
// and is unchanged by that deletion.

// ============================================================================
// The state shapes the matrix is characterized over
// ============================================================================
interface User {
  id: number;
  name: string;
}

type Profile = { name: string; email: string; [k: string]: unknown };

interface RootState {
  count: number;
  name: string;
  tags: string[];
  user: { name: string; age: number; address: { city: string } };
}

interface MarkerState {
  load: ReturnType<typeof status<Error>>;
  theme: ReturnType<typeof stored<'light' | 'dark'>>;
  profile: ReturnType<typeof form<Profile>>;
  search: ReturnType<typeof asyncQuery<string, User[]>>;
  plain: number;
}

interface EntityState {
  users: ReturnType<typeof entityMap<User, number>>;
  count: number;
}

interface CounterMethods {
  increment(): void;
  readonly total: Signal<number>;
}

declare const rootTree: SignalTree<RootState>;
declare const primitiveTree: SignalTree<number>;
declare const markerTree: SignalTree<MarkerState>;
declare const entityTree: SignalTree<EntityState>;

// ============================================================================
// SECTION 2 — root object tree
// ============================================================================
// A root IS a `NodeAccessor` and carries the whole node surface (Rule 0d).
export type _RootObjectTree = [
  Expect<Equal<SignalTree<RootState>, ISignalTree<RootState> & TreeNode<RootState>>>,
  Expect<Equal<(typeof rootTree)['$'], TreeNode<RootState>>>
];

// `$` is the ONLY accessor on the public tree type. `state` is a
// `SignalTreeBuilder` member — it exists on what `signalTree()` returns, not on
// the type consumers annotate with. Pinned because the first draft of this
// matrix asserted `state` here and `tsc` refuted it.
// @ts-expect-error `state` is not part of the public SignalTree contract
export type _NoStateOnPublicTree = (typeof rootTree)['state'];

// Read returns the exact snapshot type; both write forms are callable.
export const _rootRead: RootState = rootTree();
rootTree({ count: 1 });
rootTree((current) => ({ ...current, count: current.count + 1 }));

// @ts-expect-error a root write must not accept a foreign key
rootTree({ nope: 1 });

// ============================================================================
// SECTION 3 — primitive root
// ============================================================================
// `SignalTree<T>` has NO `T extends object` constraint (only `signalTree()`
// does), so `SignalTree<number>` is expressible and must stay coherent: the
// three `NodeAccessor` call forms survive, and `TreeNode<number>` maps over the
// primitive's own keys rather than collapsing.
export type _PrimitiveRoot = [
  Expect<Equal<SignalTree<number>, ISignalTree<number> & TreeNode<number>>>,
  Expect<Equal<(typeof primitiveTree)['$'], TreeNode<number>>>
];
export const _primitiveRead: number = primitiveTree();
primitiveTree((current: number) => current + 1);

// ============================================================================
// SECTION 4 — nested object access (Rule 0d, the at-risk contract)
// ============================================================================
// A branch is a `NodeAccessor<T> & TreeNode<T>` — an `AccessibleNode`. It is NOT
// an Angular `Signal`, and it stays structurally navigable to any depth.
export type _NestedAccess = [
  Expect<Equal<(typeof rootTree)['$']['user'], AccessibleNode<RootState['user']>>>,
  Expect<
    Equal<
      (typeof rootTree)['$']['user']['address'],
      AccessibleNode<{ city: string }>
    >
  >,
  Expect<Equal<(typeof rootTree)['$']['user']['name'], CallableWritableSignal<string>>>,
  Expect<
    Equal<
      (typeof rootTree)['$']['user']['address']['city'],
      CallableWritableSignal<string>
    >
  >,
  // A leaf is a signal; a branch is not. This pair is the whole distinction.
  Expect<Equal<(typeof rootTree)['$']['count'], CallableWritableSignal<number>>>,
  Expect<Equal<(typeof rootTree)['$']['tags'], CallableWritableSignal<string[]>>>,
  ExpectFalse<
    Equal<(typeof rootTree)['$']['user'], CallableWritableSignal<RootState['user']>>
  >
];

// All three branch call forms compile, at depth.
export const _branchRead: { name: string; age: number; address: { city: string } } =
  rootTree.$.user();
rootTree.$.user({ age: 44 });
rootTree.$.user((current) => ({ ...current, age: current.age + 1 }));
rootTree.$.user.address({ city: 'Boise' });

// A branch must not gain `.set()` — that is the Rule 0d line.
// @ts-expect-error branch accessors are not Angular signals
rootTree.$.user.set({ name: 'Bob', age: 1, address: { city: 'x' } });

// ============================================================================
// SECTION 5 — marker-containing tree
// ============================================================================
// Markers resolve to their materialized signal type through `SignalTree<T>`,
// including at depth, and a plain leaf alongside them is unaffected.
export type _MarkerTree = [
  Expect<Equal<(typeof markerTree)['$']['load'], StatusSignal<Error>>>,
  Expect<Equal<(typeof markerTree)['$']['theme'], StoredSignal<'light' | 'dark'>>>,
  Expect<Equal<(typeof markerTree)['$']['profile'], FormSignal<Profile>>>,
  Expect<
    Equal<(typeof markerTree)['$']['search'], AsyncQuerySignal<string, User[]>>
  >,
  Expect<Equal<(typeof markerTree)['$']['plain'], CallableWritableSignal<number>>>
];

// ============================================================================
// SECTION 6 — entityMap-containing tree
// ============================================================================
export type _EntityTree = [
  Expect<Equal<(typeof entityTree)['$']['users'], EntitySignal<User, number>>>,
  Expect<Equal<(typeof entityTree)['$']['users']['all'], Signal<User[]>>>,
  Expect<Equal<(typeof entityTree)['$']['count'], CallableWritableSignal<number>>>
];

// ============================================================================
// SECTION 7 — enhancer accumulation (`.with` chain)
// ============================================================================
// `.with()` returns `this & TAdded`, so the state type AND every previously
// accumulated method survive the next link.
declare const counter: Enhancer<CounterMethods>;
declare const labeller: Enhancer<{ label(): string }>;

const enhancedOnce = rootTree.with(counter);
const enhancedTwice = rootTree.with(counter).with(labeller);

export type _EnhancerAccumulation = [
  Expect<Equal<typeof enhancedOnce, SignalTree<RootState> & CounterMethods>>,
  // FIRST link survives to the end of the chain, alongside the last.
  Expect<
    Equal<
      typeof enhancedTwice,
      SignalTree<RootState> & CounterMethods & { label(): string }
    >
  >
];
// The underlying state surface is untouched by enhancement.
export const _stillTyped: number = enhancedTwice.$.count();
export const _stillNavigable: string = enhancedTwice.$.user.address.city();

// ============================================================================
// SECTION 8 — bind / destroy / registerCleanup lifecycle surface
// ============================================================================
export type _LifecycleSurface = [
  Expect<Equal<(typeof rootTree)['bind'], (thisArg?: unknown) => NodeAccessor<RootState>>>,
  Expect<Equal<(typeof rootTree)['destroy'], () => void>>,
  Expect<Equal<(typeof rootTree)['destroyed'], Signal<boolean>>>,
  Expect<Equal<(typeof rootTree)['registerCleanup'], (fn: () => void) => void>>,
  Expect<
    Equal<
      (typeof rootTree)['updateAndReport'],
      (
        updates: Partial<RootState> | ((current: RootState) => Partial<RootState>)
      ) => string[]
    >
  >
];

// `bind()` yields a plain node accessor — the three call forms, no `$`.
const bound = rootTree.bind();
export const _boundRead: RootState = bound();
bound({ count: 2 });
// @ts-expect-error the bound accessor is not a tree; it has no `$`
export type _BoundHasNoAccessor = (typeof bound)['$'];

// ============================================================================
// SECTION 9 — negative assignability controls
// ============================================================================
declare const foreign: SignalTree<{ other: boolean }>;

// A tree of one state shape is not a tree of another.
// @ts-expect-error incompatible state type
export const _noCrossAssign: SignalTree<RootState> = foreign;

// `ISignalTree<T>` alone lacks the copied root properties `TreeNode<T>` adds.
declare const interfaceOnly: ISignalTree<RootState>;
// @ts-expect-error ISignalTree is not the full public tree type
export const _noNarrowedAssign: SignalTree<RootState> = interfaceOnly;

// A raw node accessor is not a tree.
declare const accessor: NodeAccessor<RootState>;
// @ts-expect-error NodeAccessor has no `$`, `with`, or lifecycle
export const _noAccessorAssign: SignalTree<RootState> = accessor;
