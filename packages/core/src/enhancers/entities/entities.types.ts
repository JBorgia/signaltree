import { Assert, Equals } from '../test-helpers/types-equals';
import { EntitiesEnhancerConfig, withEntities } from './entities';

import type {
  SignalTreeBase,
  EntitiesEnabled,
  EntityMapMarker,
  entityMap,
} from '../../lib/types';

type ExpectedSignature = (
  config?: EntitiesEnhancerConfig
) => <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & EntitiesEnabled;

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

// Should have __entitiesEnabled marker
const _marker: true | undefined = enhanced.__entitiesEnabled;

export {};
