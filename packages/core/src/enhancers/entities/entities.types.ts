/**
 * Type-level tests for entities enhancer.
 */

import type { withEntities, entityMap } from './entities';
import type {
  SignalTreeBase,
  EntitiesEnabled,
  EntityMapMarker,
} from '../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

type ExpectedSignature = (config?: {
  idField?: string;
}) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EntitiesEnabled;

type ActualSignature = typeof withEntities;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// entityMap should produce correct marker type
interface User {
  id: string;
  name: string;
}

type UserMapMarker = ReturnType<typeof entityMap<User, string>>;
type _MarkerCheck = Assert<
  Equals<UserMapMarker, EntityMapMarker<User, string>>
>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withEntities()(tree);

// Should have __entities marker
const _marker: true = enhanced.__entities;

export {};
