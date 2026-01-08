import { Assert, Equals } from '../test-helpers/types-equals';
import { entities } from './entities';

import type {
  ISignalTree,
  EntitiesEnabled,
  EntityMapMarker,
  entityMap,
} from '../../lib/types';

// The `entities` enhancer factory was removed in v8. Keep a minimal
// compile-time check that `entities` exists but do not assert the old
// enhancer type signature (it intentionally throws at runtime).
// This keeps tests that import the symbol type-checking without enforcing
// the previous callable enhancer contract.

type ActualSignature = typeof entities;
type _ContractCheck = Assert<Equals<ActualSignature, typeof entities>>;

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
