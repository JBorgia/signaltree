/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for entities enhancer (assert intended public contract)
import type { withEntities } from './entities';
import type { Enhancer, EntitiesMethods } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WEN = typeof withEntities;
type Expected = <T = any>() => Enhancer<EntitiesMethods<T>>;
type _entities_signature = Assert<Equals<WEN, Expected>>;

export {};
