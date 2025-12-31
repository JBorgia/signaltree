// Helper types for generated tests

// Helper types for generated tests
export type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T
>() => T extends B ? 1 : 2
  ? true
  : false;
export type Assert<T extends true> = T;
