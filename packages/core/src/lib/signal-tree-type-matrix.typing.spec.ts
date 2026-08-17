/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * WHAT THIS FILE IS FOR
 *
 * `tools/api-inventory.mjs` compares symbol SETS and metadata, so it
 * structurally cannot see a type-shape change to a symbol that keeps its name —
 * the `TimeTravelMethods<T>` arity change passed the inventory clean. This file
 * is the missing dimension for the public tree type: it pins what a SignalTree
 * MEANS, as a positive statement of capability rather than the absence of an
 * error.
 *
 * WHAT IT DELIBERATELY DOES NOT PIN
 *
 * It asserts SEMANTICS, never the implementation decomposition. There is no row
 * here saying `SignalTree<T>` equals `ISignalTree<T> & TreeNode<T>`, and no row
 * asserting that `ISignalTree` is a distinct public thing. `ISignalTree` is
 * queued for internalization once the built-in enhancers migrate, so freezing
 * that decomposition would make this file contradict the release plan and would
 * have to be deleted by the slice that does the work. Assert what a consumer can
 * DO with a tree; let the type algebra behind it stay free to change.
 *
 * Rows are `Equal<>` (invariant identity) rather than assignability wherever the
 * exact type is the point. Assignability passes on a widened type; identity
 * fails on drift in either direction.
 *
 * Rule 0d — the branch-node contract is pinned here on purpose. The three call
 * forms and structural navigability of a branch are exactly what an API cleanup
 * pass is most likely to erode while every runtime test stays green.
 *
 * TWO SUBJECTS, KEPT SEPARATE ON PURPOSE
 *
 *   SECTION A   the `SignalTree<T>` ANNOTATION — what the exported type promises
 *   SECTION B   the `signalTree()` CONSTRUCTOR — what a consumer actually gets
 *
 * Characterizing only A proves "given a value already typed `SignalTree<T>`,
 * these semantics follow" — which says nothing about the real consumer path,
 * because the factory returns `SignalTreeBuilder`. Section C pins the alignment
 * between them, and that is where two live defects currently sit — including
 * one where the ANNOTATION, not the implementation, is the wrong side.
 *
 * A NOTE ON READING TYPESCRIPT ERRORS AS CAUSES
 *
 * Section C's first mismatch was initially written up as "the ONLY
 * incompatibility" on the strength of one elaborated error message. That was a
 * proxy standing in for a property it does not measure: TypeScript stops at the
 * first decisive member incompatibility, so the message names the FIRST blocker
 * and is silent about any behind it. Neutralizing that member in a one-variable
 * experiment revealed a second, unrelated mismatch. Never promote a compiler
 * diagnostic to a complete causal model without doing that experiment.
 */
import type { Signal } from '@angular/core';

import { asyncQuery, entityMap, form, signalTree, status, stored } from '../index';
import type {
  AccessibleNode,
  AsyncQuerySignal,
  CallableWritableSignal,
  EntitySignal,
  Enhancer,
  FormSignal,
  NodeAccessor,
  SignalTree,
  StatusSignal,
  StoredSignal,
  TreeNode,
} from '../index';

// --- compile-time assertion helpers -----------------------------------------
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
// `Equal` always answers `true`. It does not. Both controls are semantic: a tree
// of one state is not a tree of another, and Rule 0d's two node kinds are
// genuinely different types.
export type _HelperControls = [
  ExpectFalse<Equal<SignalTree<{ a: number }>, SignalTree<{ a: string }>>>,
  ExpectFalse<Equal<NodeAccessor<{ a: number }>, TreeNode<{ a: number }>>>
];

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

interface CounterMethods {
  increment(): void;
  readonly total: Signal<number>;
}

declare const rootTree: SignalTree<RootState>;

// ############################################################################
// SECTION A — the `SignalTree<T>` ANNOTATION
// ############################################################################

// ============================================================================
// A1 — root object tree
// ============================================================================
// A root IS a `NodeAccessor` and exposes the tree through `$` (Rule 0d).
export type _RootAccessor = [
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
// A2 — nested object access (Rule 0d, the at-risk contract)
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
// A3 — bind / destroy / registerCleanup lifecycle surface
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
// A4 — negative controls
// ============================================================================
// These stay semantic. There is deliberately NO row asserting that `ISignalTree`
// is a distinct public type — that is decomposition, and it is scheduled to be
// internalized.
declare const foreign: SignalTree<{ other: boolean }>;
// @ts-expect-error a tree of one state shape is not a tree of another
export const _noCrossAssign: SignalTree<RootState> = foreign;

declare const accessor: NodeAccessor<RootState>;
// @ts-expect-error a raw node accessor has no `$`, `with`, or lifecycle
export const _noAccessorAssign: SignalTree<RootState> = accessor;

// ############################################################################
// SECTION B — the `signalTree()` CONSTRUCTOR, i.e. the real consumer path
// ############################################################################
// Every row above describes a value that was ASSUMED to exist. These rows
// describe what a consumer actually receives from the documented entry point.
// The repo annotates nothing with `SignalTree<T>` — every call site infers —
// so this is the path that is really in use.

const built = signalTree({
  count: 0,
  name: 'John',
  tags: ['a'] as string[],
  user: { name: 'John', age: 30, address: { city: 'Boise' } },
});

// B1 — root call forms and `$`, on the constructed value.
export const _builtRead: {
  count: number;
  name: string;
  tags: string[];
  user: { name: string; age: number; address: { city: string } };
} = built();
built({ count: 1 });
built((current) => ({ ...current, count: current.count + 1 }));
// @ts-expect-error a root write must not accept a foreign key
built({ nope: 1 });

// B2 — Rule 0d holds on the constructed value, at depth.
export const _builtBranchRead: { name: string; age: number; address: { city: string } } =
  built.$.user();
built.$.user({ age: 44 });
built.$.user((current) => ({ ...current, age: current.age + 1 }));
built.$.user.address({ city: 'Boise' });
export type _BuiltNested = [
  Expect<Equal<(typeof built)['$']['count'], CallableWritableSignal<number>>>,
  Expect<Equal<(typeof built)['$']['user']['name'], CallableWritableSignal<string>>>,
  Expect<
    Equal<
      (typeof built)['$']['user']['address']['city'],
      CallableWritableSignal<string>
    >
  >,
  ExpectFalse<
    Equal<(typeof built)['$']['user'], CallableWritableSignal<RootState['user']>>
  >
];
// @ts-expect-error branch accessors are not Angular signals
built.$.user.set({ name: 'Bob', age: 1, address: { city: 'x' } });

// B3 — markers resolve through the constructed value, including at depth.
const builtMarkers = signalTree({
  load: status<Error>(),
  theme: stored('theme', 'light' as 'light' | 'dark'),
  profile: form<Profile>({ initial: { name: '', email: '' } }),
  search: asyncQuery<string, User[]>({
    initialResult: [],
    query: () => Promise.resolve([]),
  }),
  plain: 0,
  nested: { buried: status<Error>(), deep: 0 },
});
export type _BuiltMarkers = [
  Expect<Equal<(typeof builtMarkers)['$']['load'], StatusSignal<Error>>>,
  Expect<Equal<(typeof builtMarkers)['$']['theme'], StoredSignal<'light' | 'dark'>>>,
  Expect<Equal<(typeof builtMarkers)['$']['profile'], FormSignal<Profile>>>,
  Expect<
    Equal<(typeof builtMarkers)['$']['search'], AsyncQuerySignal<string, User[]>>
  >,
  Expect<Equal<(typeof builtMarkers)['$']['plain'], CallableWritableSignal<number>>>,
  // a marker at depth still resolves — the "any depth" claim
  Expect<Equal<(typeof builtMarkers)['$']['nested']['buried'], StatusSignal<Error>>>,
  Expect<Equal<(typeof builtMarkers)['$']['nested']['deep'], CallableWritableSignal<number>>>
];

// B4 — entityMap resolves through the constructed value.
const builtEntities = signalTree({
  users: entityMap<User, number>(),
  count: 0,
});
export type _BuiltEntities = [
  Expect<Equal<(typeof builtEntities)['$']['users'], EntitySignal<User, number>>>,
  Expect<Equal<(typeof builtEntities)['$']['users']['all'], Signal<User[]>>>,
  Expect<Equal<(typeof builtEntities)['$']['count'], CallableWritableSignal<number>>>
];

// B5 — enhancer accumulation on the constructed value.
// `.with()` returns `this & TAdded`, so the state type AND every previously
// accumulated method survive the next link.
declare const counter: Enhancer<CounterMethods>;
declare const labeller: Enhancer<{ label(): string }>;

const enhancedOnce = built.with(counter);
const enhancedTwice = built.with(counter).with(labeller);

export type _EnhancerAccumulation = [
  Expect<Equal<typeof enhancedOnce, typeof built & CounterMethods>>,
  // FIRST link survives to the end of the chain, alongside the last.
  Expect<
    Equal<typeof enhancedTwice, typeof built & CounterMethods & { label(): string }>
  >
];
// The state surface is untouched by enhancement.
export const _stillTyped: number = enhancedTwice.$.count();
export const _stillNavigable: string = enhancedTwice.$.user.address.city();
enhancedTwice.increment();
export const _stillLabelled: string = enhancedTwice.label();

// B6 — the lifecycle surface exists on the constructed value.
// `destroyed`, `registerCleanup` and `updateAndReport` are each here because
// they were RUNTIME-PRESENT BUT TYPE-MISSING on the builder and had to be added
// one at a time — see the docblocks in `internals/builder-types.ts`. Each was
// caught by a different accident (an acceptance test, the skills-doc linter),
// never by a gate. These rows are that gate.
built.destroy();
built.registerCleanup(() => undefined);
export const _builtDestroyed: Signal<boolean> = built.destroyed;
export const _builtChanged: string[] = built.updateAndReport({ count: 3 });

// ############################################################################
// SECTION C — ALIGNMENT between the annotation and the constructor
// ############################################################################
// The question no other row here asks: can a consumer write the canonical
// annotation over the documented constructor?
//
//     const tree: SignalTree<MyState> = signalTree({ ... });
//
// TODAY THIS DOES NOT COMPILE. There are TWO independent mismatches, and the
// second is only visible once the first is neutralized — TypeScript stops
// elaborating at the first decisive member incompatibility, so the initial
// error is the FIRST blocker, never proof that it is the ONLY one. That was
// established by a one-variable experiment: changing `SignalTreeBuilder.bind`
// alone left the assignment red with an entirely different error.
//
//   (1) bind    SignalTreeBuilder<S, …>.bind(thisArg?) -> (value?: S) => S | void
//               ISignalTree<S>.bind(thisArg?)          -> NodeAccessor<S>
//
//               The DECLARATION is the lossy side. At runtime the builder
//               copies the base tree's `bind` verbatim (`signal-tree.ts:1802`)
//               and that function returns a `NodeAccessor<T>`
//               (`signal-tree.ts:1365`). Same runtime-present / type-missing
//               drift class that `internals/builder-types.ts` documents in its
//               own docblocks for `destroyed`, `registerCleanup` and
//               `updateAndReport`.
//
//   (2) root    `SignalTree<T>` is `ISignalTree<T> & TreeNode<T>`, so it
//       state   requires the STATE KEYS on the tree object itself —
//       keys    "missing the following properties from type 'TreeNode<RootState>':
//               count, tags, user". `SignalTreeBuilder` does not declare them.
//
//               Here the ANNOTATION is the wrong side, not the builder. At
//               runtime the root carries NO state keys: for
//               `signalTree({ count, tags, user })`, `Object.keys(tree)` is
//               `[]`, and `tree.count` is `undefined`. Only `tree.$` has them.
//               `types.ts` still explains the `& TreeNode<T>` as "properties
//               copied to the root callable ... legacy consumers rely on this";
//               that copying does not happen for state keys.
//
//               So the builder is HONEST and the canonical annotation
//               OVER-PROMISES. Making the builder satisfy `SignalTree<T>` as
//               currently written would mean inventing a root surface that the
//               design deliberately puts behind `$`.
//
// `name` is absent from the missing-property list only because a function
// already has `Function.prototype.name`. Do not read that as `name` being fine.
//
// This is a public-type DECISION (queue item 5 owns the tree-type vocabulary),
// not a local repair, so it is characterized rather than fixed here.
declare const builtForAlignment: ReturnType<typeof signalTree<RootState>>;
// @ts-expect-error KNOWN DEFECT: see (1) and (2) above. Fixing only bind leaves this red.
export const _constructorMatchesAnnotation: SignalTree<RootState> = builtForAlignment;

// The over-promise, pinned on its own because it is the more serious half and
// it compiles — nothing else in this file would catch a type that lies about
// runtime. `rootTree.count` typechecks as a writable signal; the same access on
// a real constructed tree is `undefined`.
//
// KEEP THIS ROW RED-IN-SPIRIT: it is green today ONLY because the type is
// wrong. When `SignalTree<T>` stops claiming a root state surface, this line
// starts failing to compile, and THAT is the fix landing — not a regression.
export const _annotationOverPromisesRootState: CallableWritableSignal<number> =
  rootTree.count;
