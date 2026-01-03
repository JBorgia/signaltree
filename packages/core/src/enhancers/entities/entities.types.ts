import { Assert, Equals } from '../test-helpers/types-equals';
import { entities, EntitiesEnhancerConfig } from './entities';

import type {
  ISignalTree,
  EntitiesEnabled,
  EntityMapMarker,
  entityMap,
} from '../../lib/types';

type ExpectedSignature = (
  config?: EntitiesEnhancerConfig
) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled;

type ActualSignature = typeof entities;

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

// Note: Direct calls like `entities()(tree)` don't infer types correctly
// with the two-type-parameter pattern. In practice, enhancers are always
// used via .with() which properly infers and preserves types.

export {};
