/**
 * TYPE-TEST HARNESS — compile-time only (see marker-resolution.typing.spec.ts
 * for the harness convention: checked by `tsc` via `npm run typecheck`,
 * EXCLUDED from vitest by the `*typing*.spec.ts` ignore).
 *
 * PARITY FIXTURE for the readonly view (RFC 0004 §4 step 2). The
 * `ReadonlyView` dispatch is structural (the accumulated `$` type carries
 * materialized signal surfaces, not brandable markers), so a future marker
 * missing its dispatch row degrades SILENTLY — this fixture is the maintained
 * guard. Add a marker to the fixture tree + an Equal row below for every new
 * marker, mirroring marker-resolution.typing.spec.ts.
 *
 * Asserts, over `asReadonly(tree)`:
 *  (a) derived computeds SURVIVE readonly exposure (RFC 0004 F1) and
 *      `linked()` WritableSignals narrow to `Signal`;
 *  (b) leaf `.set`/`.update` and branch write call signatures are not
 *      reachable;
 *  (c) entity mutators (`upsertOne`, …) and loader triggers (`load`,
 *      `refresh`, `invalidate`) are not reachable; `byId` is re-signed to a
 *      read-only entity node;
 *  (e) status / form / stored / async reader members remain readable, with
 *      `WritableSignal` readers (`status.state`, `asyncQuery.input`) demoted
 *      to plain `Signal`s.
 * ((d) — plain-object factory with `expose: 'readonly'` is a compile error —
 * lives in define-store.typing.spec.ts next to the overloads it gates.)
 */
import { computed, type Signal } from '@angular/core';

import {
  asyncQuery,
  asyncSource,
  entityMap,
  form,
  linked,
  signalTree,
  status,
  stored,
  type LoadingState,
} from '../index';
import { loader } from './markers/loader';
// asyncStream is EXPERIMENTAL and not barrel-exported (RFC 0001 §5); import it
// relatively so the parity fixture still gates its readonly dispatch row.
import { asyncStream } from './markers/async-stream';
import type {
  ReadonlyAsyncStreamSignal,
  ReadonlyEntityNode,
  ReadonlyEntitySignal,
  ReadonlyFormWizard,
  ReadonlyLoadingEntitySignal,
} from './readonly';
import { asReadonly } from './readonly';
import type { ISignalTree } from './types';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T
>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
/** True iff K is not a member of T — "this write is not offered". */
type NotOffered<T, K extends PropertyKey> = K extends keyof T ? false : true;

interface User {
  id: number;
  name: string;
  address: { city: string };
  tags: string[];
}
// form<T> constrains T to Record<string, unknown> (see
// marker-resolution.typing.spec.ts for the same fixture note).
type Profile = { name: string; email: string; [k: string]: unknown };

const tree = signalTree({
  count: 0,
  selectedId: null as number | null,
  branch: { leaf: 'x', deep: { n: 1 } },
  users: entityMap<User, number>(),
  cached: entityMap<User, number>({ load: loader(() => Promise.resolve([] as User[])) }),
  // M3 fixture shape: loading entityMap that a later .derived() merges INTO.
  plants: entityMap<User, number>({ load: loader(() => Promise.resolve([] as User[])) }),
  load: status<Error>(),
  theme: stored('theme', 'light' as 'light' | 'dark'),
  profile: form<Profile>({ initial: { name: '', email: '' } }),
  reports: asyncSource<User[]>({ initial: [], load: () => Promise.resolve([]) }),
  search: asyncQuery<string, User[]>({
    initialResult: [],
    query: () => Promise.resolve([]),
  }),
  reply: asyncStream<string, string>({ initial: '', accumulate: (a, b) => a + b }),
}).derived(($) => ({
  doubled: computed(() => $.count() * 2),
  draft: linked(() => $.count()),
  group: { total: computed(() => $.count() + 1) },
  // Derived deep-merged INTO a marker node (the readonly×merged-derived gap):
  // the marker dispatch row must preserve this beyond its Pick allowlist.
  plants: { total: computed(() => $.plants.count()) },
}));

const ro = asReadonly(tree);
type RO = typeof ro;
type RO$ = RO['$'];

// Runtime-reachable member types used in assertions below.
type ROUsers = RO$['users'];
type ROCached = RO$['cached'];
type ROPlants = RO$['plants'];
type ROStatus = RO$['load'];
type ROForm = RO$['profile'];
type ROStored = RO$['theme'];
type ROSource = RO$['reports'];
type ROQuery = RO$['search'];
type ROStream = RO$['reply'];
type ROEntityNode = NonNullable<ReturnType<ROUsers['byId']>>;

export type _ReadonlyViewChecks = [
  // ---------------------------------------------------------------------------
  // (a) derived layers survive; linked() narrows
  // ---------------------------------------------------------------------------
  Expect<Equal<RO$['doubled'], Signal<number>>>,
  Expect<Equal<RO$['draft'], Signal<number>>>, // linked() WritableSignal → Signal
  Expect<Equal<RO$['group']['total'], Signal<number>>>, // derived-only group recurses

  // ---------------------------------------------------------------------------
  // (b) leaves and branches: reads only
  // ---------------------------------------------------------------------------
  Expect<Equal<RO$['count'], Signal<number>>>,
  Expect<Equal<RO$['selectedId'], Signal<number | null>>>,
  Expect<NotOffered<RO$['count'], 'set'>>,
  Expect<NotOffered<RO$['count'], 'update'>>,
  // Branch accessor keeps only the zero-arg read call signature…
  Expect<Equal<Parameters<RO$['branch']>, []>>,
  Expect<Equal<ReturnType<RO$['branch']>, { leaf: string; deep: { n: number } }>>,
  // …and its children recurse into the readonly view.
  Expect<Equal<RO$['branch']['leaf'], Signal<string>>>,
  Expect<Equal<RO$['branch']['deep']['n'], Signal<number>>>,
  // Root snapshot read stays; write overloads are gone.
  Expect<Equal<Parameters<RO>, []>>,
  // No write-adjacent tree API on the readonly store.
  Expect<NotOffered<RO, 'with'>>,
  Expect<NotOffered<RO, 'bind'>>,
  Expect<NotOffered<RO, 'updateAndReport'>>,
  Expect<NotOffered<RO, 'registerCleanup'>>,
  Expect<Equal<RO['destroyed'], Signal<boolean>>>,

  // ---------------------------------------------------------------------------
  // (c) entityMap: queries readable, mutators not offered, byId re-signed
  // ---------------------------------------------------------------------------
  Expect<Equal<ROUsers, ReadonlyEntitySignal<User, number>>>,
  Expect<Equal<ROUsers['all'], Signal<User[]>>>,
  Expect<Equal<ROUsers['empty'], Signal<boolean>>>,
  Expect<NotOffered<ROUsers, 'addOne'>>,
  Expect<NotOffered<ROUsers, 'upsertOne'>>,
  Expect<NotOffered<ROUsers, 'updateWhere'>>,
  Expect<NotOffered<ROUsers, 'removeAll'>>,
  Expect<NotOffered<ROUsers, 'setAll'>>,
  Expect<NotOffered<ROUsers, 'clear'>>,
  Expect<NotOffered<ROUsers, 'tap'>>,
  Expect<NotOffered<ROUsers, 'intercept'>>,
  // byId: same node at runtime, re-signed without write reachability.
  Expect<Equal<ReturnType<ROUsers['byId']>, ReadonlyEntityNode<User> | undefined>>,
  Expect<Equal<ROEntityNode['name'], Signal<string>>>,
  Expect<Equal<ROEntityNode['tags'], Signal<string[]>>>, // arrays stay atomic
  Expect<Equal<ROEntityNode['address']['city'], Signal<string>>>,
  Expect<Equal<Parameters<ROEntityNode>, []>>, // write call overloads gone
  Expect<NotOffered<ROEntityNode['name'], 'set'>>,

  // cached entityMap({ load }): loader status readable, triggers not offered
  Expect<Equal<ROCached, ReadonlyLoadingEntitySignal<User, number, void>>>,
  Expect<Equal<ROCached['loading'], Signal<boolean>>>,
  Expect<Equal<ROCached['lastLoadedAt'], Signal<number | null>>>,
  Expect<NotOffered<ROCached, 'load'>>,
  Expect<NotOffered<ROCached, 'loadOrThrow'>>,
  Expect<NotOffered<ROCached, 'refresh'>>,
  Expect<NotOffered<ROCached, 'invalidate'>>,

  // derived merged INTO a marker node survives the readonly view
  // (readonly×merged-derived gap, M3): the extra key is kept as a Signal…
  Expect<Equal<ROPlants['total'], Signal<number>>>,
  // …the marker's own readers remain readable…
  Expect<Equal<ROPlants['all'], Signal<User[]>>>,
  Expect<Equal<ROPlants['loading'], Signal<boolean>>>,
  // …and the mutators/triggers are still not offered.
  Expect<NotOffered<ROPlants, 'upsertOne'>>,
  Expect<NotOffered<ROPlants, 'setAll'>>,
  Expect<NotOffered<ROPlants, 'load'>>,
  Expect<NotOffered<ROPlants, 'refresh'>>,

  // ---------------------------------------------------------------------------
  // (e) status / form / stored / async readers remain readable
  // ---------------------------------------------------------------------------
  Expect<Equal<ROStatus['loading'], Signal<boolean>>>,
  Expect<Equal<ROStatus['hasError'], Signal<boolean>>>,
  Expect<Equal<ROStatus['idle'], Signal<boolean>>>,
  Expect<Equal<ROStatus['settled'], Signal<boolean>>>,
  // Source WritableSignals demoted to plain Signal reads.
  Expect<Equal<ROStatus['state'], Signal<LoadingState>>>,
  Expect<Equal<ROStatus['error'], Signal<Error | null>>>,
  Expect<NotOffered<ROStatus, 'setLoading'>>,
  Expect<NotOffered<ROStatus, 'setError'>>,
  Expect<NotOffered<ROStatus, 'reset'>>,
  Expect<NotOffered<ROStatus, 'fail'>>,

  Expect<Equal<ReturnType<ROForm['data']>, Profile>>,
  Expect<Equal<ReturnType<ROForm>, Profile>>, // callable read kept
  Expect<Equal<ROForm['valid'], Signal<boolean>>>,
  Expect<Equal<ROForm['errors'], Signal<Partial<Record<keyof Profile, string | null>>>>>,
  Expect<NotOffered<ROForm, 'set'>>,
  Expect<NotOffered<ROForm, 'patch'>>,
  Expect<NotOffered<ROForm, 'submit'>>,
  Expect<NotOffered<ROForm, 'validate'>>,
  Expect<NotOffered<ROForm, 'touch'>>,
  Expect<NotOffered<ROForm, '$'>>, // deep-writable field accessors not offered
  // wizard: re-signed to progress reads (optional, mirroring FormSignal);
  // navigation mutators not offered.
  Expect<Equal<ROForm['wizard'], ReadonlyFormWizard | undefined>>,
  Expect<Equal<NonNullable<ROForm['wizard']>['currentStep'], Signal<number>>>,
  Expect<Equal<NonNullable<ROForm['wizard']>['canNext'], Signal<boolean>>>,
  Expect<NotOffered<NonNullable<ROForm['wizard']>, 'next'>>,
  Expect<NotOffered<NonNullable<ROForm['wizard']>, 'prev'>>,
  Expect<NotOffered<NonNullable<ROForm['wizard']>, 'goTo'>>,
  Expect<NotOffered<NonNullable<ROForm['wizard']>, 'reset'>>,

  Expect<Equal<ReturnType<ROStored>, 'light' | 'dark'>>,
  Expect<Equal<ROStored['key'], string>>,
  Expect<NotOffered<ROStored, 'set'>>,
  Expect<NotOffered<ROStored, 'clear'>>,

  Expect<Equal<ROSource['data'], Signal<User[] | undefined>>>,
  Expect<Equal<ReturnType<ROSource>, User[] | undefined>>,
  Expect<NotOffered<ROSource, 'set'>>,
  Expect<NotOffered<ROSource, 'refresh'>>,
  Expect<NotOffered<ROSource, 'reset'>>,

  Expect<Equal<ROQuery['results'], Signal<User[] | undefined>>>,
  // input is a WritableSignal on the full surface — demoted here.
  Expect<Equal<ROQuery['input'], Signal<string | undefined>>>,
  Expect<NotOffered<ROQuery, 'rerun'>>,
  Expect<NotOffered<ROQuery, 'reset'>>,

  Expect<Equal<ROStream, ReadonlyAsyncStreamSignal<string, string>>>,
  Expect<Equal<ROStream['data'], Signal<string>>>,
  Expect<Equal<ROStream['done'], Signal<boolean>>>,
  Expect<NotOffered<ROStream, 'start'>>,
  Expect<NotOffered<ROStream, 'cancel'>>,
  Expect<NotOffered<ROStream, 'refresh'>>,
  Expect<NotOffered<ROStream, 'regenerate'>>,
  Expect<NotOffered<ROStream, 'reset'>>
];

// `asReadonly` also accepts the minimal `ISignalTree`/`SignalTree` shape
// (second overload) so service code holding the wide type can narrow too.
declare const minimal: ISignalTree<{ n: number }>;
const roMinimal = asReadonly(minimal);
export type _ReadonlyMinimalChecks = [
  Expect<Equal<(typeof roMinimal)['$']['n'], Signal<number>>>,
  Expect<NotOffered<(typeof roMinimal)['$']['n'], 'set'>>
];
