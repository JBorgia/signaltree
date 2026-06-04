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
 * unexported `TypedSignalTree`) are not consumer-reachable; their marker-
 * resolution gap is tracked as an internal-only finding, not asserted here.
 */
import type {
  AsyncQuerySignal,
  AsyncSourceSignal,
  AsyncStreamSignal,
  CallableWritableSignal,
  EntitySignal,
  FormSignal,
  StatusSignal,
  StoredSignal,
} from '../../index';
import {
  asyncQuery,
  asyncSource,
  asyncStream,
  entityMap,
  form,
  signalTree,
  status,
  stored,
} from '../../index';
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
