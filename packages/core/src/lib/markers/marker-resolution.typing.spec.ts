/**
 * TYPE-TEST HARNESS (F0) — compile-time only.
 *
 * Asserts that every marker resolves to its materialized signal type on the
 * public tree accessor (`tree.$`, i.e. `TreeNode<T>`). This is the regression
 * net the asyncStream type bug proved we need: the vitest run goes through
 * esbuild, which strips types without checking, so a wrong-but-valid marker
 * type ships silently. This file is checked by `tsc` (`npm run typecheck`) and
 * is EXCLUDED from vitest (filename matches the `*typing*.spec.ts` ignore).
 *
 * Add a row here for every new marker. A missing/incorrect resolution fails
 * `tsc`, not just review.
 *
 * NOTE: only `TreeNode` is part of the public barrel. The internal
 * `EntityAwareTreeNode` / `DeepEntityAwareTreeNode` variants (used by the
 * unexported `TypedSignalTree`) are not consumer-reachable, but they ARE asserted
 * here — including `.computed()` slice resolution. Leaving them unchecked is how
 * they drifted out of sync with `TreeNode` in the first place.
 */
import type { Signal } from '@angular/core';

import type {
  AsyncQuerySignal,
  AsyncSourceSignal,
  CallableWritableSignal,
  EntitySignal,
  FormSignal,
  StatusSignal,
  StoredSignal,
} from '../../index';
import {
  asyncQuery,
  asyncSource,
  entityMap,
  form,
  loader,
  signalTree,
  status,
  stored,
} from '../../index';
// asyncStream is EXPERIMENTAL and not barrel-exported (RFC 0001 §5); import it
// relatively so the harness still gates its internal type resolution.
import { asyncStream, type AsyncStreamSignal } from './async-stream';
// Internal (not barrel-exported) tree-node variants — imported relatively so the
// harness can gate their marker resolution too.
import type {
  DeepEntityAwareTreeNode,
  EntityAwareTreeNode,
} from '../types';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T
>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

interface User {
  id: number;
  name: string;
}
// form<T> constrains T to Record<string, unknown>; a bare interface lacks the
// index signature (a real ergonomic wart — interface-typed forms need it).
type Profile = { name: string; email: string; [k: string]: unknown };

const tree = signalTree({
  users: entityMap<User, number>(),
  load: status<Error>(),
  theme: stored('theme', 'light' as 'light' | 'dark'),
  profile: form<Profile>({ initial: { name: '', email: '' } }),
  reports: asyncSource<User[]>({ initial: [], load: () => Promise.resolve([]) }),
  search: asyncQuery<string, User[]>({
    initialResult: [],
    query: () => Promise.resolve([]),
  }),
  reply: asyncStream<string, string>({ initial: '', accumulate: (a, b) => a + b }),
  selectedId: null as number | null, // union leaf
  count: 0, // plain leaf
  nested: {
    stream: asyncStream<string, string>({
      initial: '',
      accumulate: (a, b) => a + b,
    }),
  },
});
type $ = typeof tree.$;

// Every marker resolves to its materialized signal type on `tree.$`.
export type _MarkerResolutionChecks = [
  Expect<Equal<$['users'], EntitySignal<User, number>>>,
  Expect<Equal<$['load'], StatusSignal<Error>>>,
  Expect<Equal<$['theme'], StoredSignal<'light' | 'dark'>>>,
  Expect<Equal<$['profile'], FormSignal<Profile>>>,
  Expect<Equal<$['reports'], AsyncSourceSignal<User[]>>>,
  Expect<Equal<$['search'], AsyncQuerySignal<string, User[]>>>,
  Expect<Equal<$['reply'], AsyncStreamSignal<string, string>>>,
  // marker nested at depth resolves too (the "any depth" differentiator)
  Expect<Equal<$['nested']['stream'], AsyncStreamSignal<string, string>>>,
  // plain + union leaves stay callable writable signals
  Expect<Equal<$['count'], CallableWritableSignal<number>>>,
  Expect<Equal<$['selectedId'], CallableWritableSignal<number | null>>>
];

// --- `.computed()` slice names are typed on `tree.$` (no `as any`) -----------
// The runtime has always attached slices to the materialized entity signal;
// these rows gate that the TYPES survive materialization. Before
// `ApplyComputedSlices`, `$.plants.byUrl` did not exist on the static type and
// every read needed `(tree.$.plants as any).byUrl()`.
const sliceTree = signalTree({
  plants: entityMap<User, number>().computed('byId2', (all) =>
    Object.fromEntries(all.map((u) => [u.id, u]))
  ),
  chained: entityMap<User, number>()
    .computed('names', (all) => all.map((u) => u.name))
    .computed('total', (all) => all.length),
});
type Slice$ = typeof sliceTree.$;

export type _ComputedSliceChecks = [
  // a slice resolves to Signal<R> with R inferred from the compute fn
  Expect<
    Equal<Slice$['plants']['byId2'], Signal<{ [k: string]: User }>>
  >,
  // the base EntitySignal surface survives alongside the slice
  Expect<Equal<Slice$['plants']['all'], Signal<User[]>>>,
  // chained slices accumulate — both names present, independently typed
  Expect<Equal<Slice$['chained']['names'], Signal<string[]>>>,
  Expect<Equal<Slice$['chained']['total'], Signal<number>>>,
  // REGRESSION: a slice-free collection stays EXACTLY EntitySignal — the
  // `Record<string, never>` default must not graft an index signature on
  Expect<Equal<$['users'], EntitySignal<User, number>>>
];

// Slices on a LOADER-BACKED collection resolve too (the loading branch of
// TreeNode is a separate arm — `LoadingEntitySignal`, not `EntitySignal`).
const loadingSliceTree = signalTree({
  remote: entityMap<User, number>({
    load: loader(() => Promise.resolve([] as User[])),
  }).computed('names', (all) => all.map((u) => u.name)),
});
type Loading$ = typeof loadingSliceTree.$;

// The two INTERNAL tree-node variants resolve slices as well. Previously only
// `TreeNode` did, so `TypedSignalTree` (which builds on these) would have silently
// dropped slice names — the same class of gap the 13.2 fix closed for `tree.$`.
type SliceState = {
  stock: ReturnType<typeof entityMap<User, number>> & {
    __sliceTypes?: { names: string[] };
  };
};
export type _InternalVariantSliceChecks = [
  Expect<Equal<EntityAwareTreeNode<SliceState>['stock']['names'], Signal<string[]>>>,
  Expect<
    Equal<DeepEntityAwareTreeNode<SliceState>['stock']['names'], Signal<string[]>>
  >
];

export type _LoadingSliceChecks = [
  Expect<Equal<Loading$['remote']['names'], Signal<string[]>>>,
  // the loader surface survives alongside the slice
  Expect<Equal<Loading$['remote']['loading'], Signal<boolean>>>
];

// Internal (unexported) variants — imported relatively so they're gated too.
// These were missing every non-entityMap marker; now covered.
type MarkerState = {
  users: ReturnType<typeof entityMap<User, number>>;
  reply: ReturnType<typeof asyncStream<string, string>>;
  search: ReturnType<typeof asyncQuery<string, User[]>>;
};
export type _InternalVariantChecks = [
  Expect<
    Equal<EntityAwareTreeNode<MarkerState>['users'], EntitySignal<User, number>>
  >,
  Expect<
    Equal<
      EntityAwareTreeNode<MarkerState>['reply'],
      AsyncStreamSignal<string, string>
    >
  >,
  Expect<
    Equal<
      DeepEntityAwareTreeNode<MarkerState>['reply'],
      AsyncStreamSignal<string, string>
    >
  >,
  Expect<
    Equal<
      DeepEntityAwareTreeNode<MarkerState>['search'],
      AsyncQuerySignal<string, User[]>
    >
  >
];
