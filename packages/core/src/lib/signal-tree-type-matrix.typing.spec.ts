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
 * because the factory returns `SignalTreeBuilder`. Section C is the join: it
 * asserts POSITIVELY that the constructor's return satisfies the canonical
 * annotation. Adding it exposed two real defects, one on each side, both now
 * fixed; the history is kept in section C because the method that found the
 * second one generalizes.
 *
 * A NOTE ON READING TYPESCRIPT ERRORS AS CAUSES
 *
 * One of those mismatches was nearly written up as "the ONLY incompatibility"
 * on the strength of a single elaborated error. That is a proxy standing in for
 * a property it does not measure: TypeScript stops at the first decisive member
 * incompatibility, so the message names the FIRST blocker and is silent about
 * anything behind it. Neutralizing that member in a one-variable experiment
 * revealed a second, unrelated mismatch. Never promote a compiler diagnostic to
 * a complete causal model without neutralizing the reported cause and
 * re-measuring.
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

// FROZEN GRAMMAR — state is addressed through `$`, and ONLY through `$`.
//
// `SignalTree<T>` used to be `ISignalTree<T> & TreeNode<T>`, which typed the
// state keys on the root object as well. That was a type describing a
// different API grammar from the runtime: `Object.keys(signalTree({count:0}))`
// is `[]` and `tree.count` is `undefined`, yet `tree.count` typechecked green
// as a writable signal. These rows are the permanent guard against the root
// surface being reintroduced — by a re-added `& TreeNode<T>`, by runtime
// property copying, or by any other route. Two ways to address one node is the
// duplicate grammar this API deliberately does not have.
// @ts-expect-error state lives under `$`, never on the root
export type _NoRootLeaf = (typeof rootTree)['count'];
// @ts-expect-error state lives under `$`, never on the root
export type _NoRootBranch = (typeof rootTree)['user'];
// The supported grammar, green:
export const _viaAccessor: number = rootTree.$.count();
export const _viaAccessorBranch: RootState['user'] = rootTree.$.user();

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
// THE POSITIVE ENDPOINT. A consumer can write the canonical annotation over the
// documented constructor, with no cast and no expected error:
//
//     const tree: SignalTree<MyState> = signalTree({ ... });
//
// This row is the whole reason section B exists. Section A alone could only ever
// prove "given a value already typed `SignalTree<T>`, these semantics follow",
// which says nothing about what `signalTree()` actually hands back.
//
// Getting here took TWO independent repairs pointing in OPPOSITE directions, and
// they must not be collapsed into "the tree types were wrong":
//
//   (1) root state keys — the ANNOTATION OVER-PROMISED.
//       `SignalTree<T>` was `ISignalTree<T> & TreeNode<T>`, requiring the state
//       keys on the tree object itself. The runtime root has none of them:
//       `Object.keys(tree)` is `[]` and `tree.count` is `undefined`, while
//       `tree.$` carries the keys. The type encoded a different API grammar
//       from the runtime. Fixed by dropping `& TreeNode<T>`; section A1 now
//       guards against the root surface returning.
//
//   (2) bind — the BUILDER DECLARATION UNDER-PROMISED.
//       `SignalTreeBuilder.bind()` was declared `(value?: S) => S | void`,
//       collapsing `NodeAccessor<S>`'s three overloads into one lossy signature.
//       The runtime already returned a `NodeAccessor<S>`. Same
//       runtime-present / type-missing drift `internals/builder-types.ts`
//       records for `destroyed`, `registerCleanup` and `updateAndReport` —
//       each of which was caught by an accident rather than by a gate.
//
// HOW THE SECOND ONE WAS FOUND, because the method matters more than the bug:
// the first elaborated error named `bind` and it was nearly written up as "the
// only incompatibility". TypeScript stops elaborating at the first decisive
// member incompatibility, so its message names the FIRST blocker and is silent
// about anything behind it. Neutralizing `bind` alone in a one-variable
// experiment left the assignment red with a completely unrelated error, which
// is how (1) surfaced. Never promote a compiler diagnostic to a complete causal
// model without neutralizing the reported cause and re-measuring.
//
// `name` never appeared in the missing-property list at any point, because a
// function already has `Function.prototype.name`. Not evidence `name` was fine.
const builtForAlignment = signalTree<RootState>({
  count: 0,
  name: 'John',
  tags: ['a'] as string[],
  user: { name: 'John', age: 30, address: { city: 'Boise' } },
});
export const _constructorMatchesAnnotation: SignalTree<RootState> =
  builtForAlignment;

// The aligned `bind()` is usable through the canonical annotation, with the
// read form returning `RootState` rather than `RootState | void`.
export const _boundThroughAnnotation: RootState =
  _constructorMatchesAnnotation.bind()();
