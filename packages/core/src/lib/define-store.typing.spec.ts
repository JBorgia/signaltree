/**
 * TYPE-TEST HARNESS — compile-time only (see marker-resolution.typing.spec.ts
 * for the harness convention this follows).
 *
 * Asserts `defineStore(factory, { expose: 'readonly' })` narrows the
 * injected type to `ReadonlyStore<T>` — no `.set`/`.update`/branch-write call
 * signature reachable — while the default (no `expose`) overload keeps the
 * factory's real return type (`SignalTreeBuilder<T, …>`, what `signalTree()`
 * actually returns) unchanged. This is a type-only narrowing (see
 * `ReadonlyStore`'s own docs); this file only checks the STATIC type, not
 * runtime behavior (runtime is covered by define-store.spec.ts).
 *
 * This exact harness caught a real bug during development: the readonly
 * overload was first constrained on `factory: () => SignalTree<T>`, but
 * `signalTree(...)` actually returns `SignalTreeBuilder<T, TreeNode<T>>` — a
 * structurally different type (no `destroyed`/`registerCleanup`/
 * `updateAndReport`) — so the constraint never matched and every real call
 * silently fell through to the untransformed generic overload, making
 * `{ expose: 'readonly' }` a silent no-op. Keep this file up to date if
 * `signalTree()`'s return type ever changes again.
 */
import { signalTree } from '../index';
import { defineStore } from './define-store';
import type { CallableWritableSignal, ReadonlyStore } from './types';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T
>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

interface CounterState {
  count: number;
}

const DefaultStore = defineStore(() => signalTree<CounterState>({ count: 0 }));
const ReadonlyCounterStore = defineStore(
  () => signalTree<CounterState>({ count: 0 }),
  { expose: 'readonly' }
);

type DefaultInjected = InstanceType<typeof DefaultStore>;
type ReadonlyInjected = InstanceType<typeof ReadonlyCounterStore>;

export type _DefineStoreTypeChecks = [
  // Default overload: unchanged — writes still reachable through `$.count.set(...)`.
  Expect<Equal<DefaultInjected['$']['count'], CallableWritableSignal<number>>>,

  // `expose: 'readonly'` overload: narrows to ReadonlyStore<T>.
  Expect<Equal<ReadonlyInjected, ReadonlyStore<CounterState>>>,
  // The readonly leaf is a plain Signal read, not a CallableWritableSignal —
  // `.set`/`.update` are not own members of its type.
  Expect<Equal<'set' extends keyof ReadonlyInjected['$']['count'] ? true : false, false>>,
  Expect<Equal<'update' extends keyof ReadonlyInjected['$']['count'] ? true : false, false>>
];
