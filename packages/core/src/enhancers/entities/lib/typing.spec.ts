// Type-level tests for entities enhancer
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import type { withEntities } from './entities';
import type { Enhancer } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WEN = typeof withEntities;
type Expected = <T = any>() => Enhancer;
type _entities_signature = Assert<Equals<WEN, Expected>>;

export {};
