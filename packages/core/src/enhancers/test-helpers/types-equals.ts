// Shared type-level test helpers for enhancer .types.ts files

/**
 * Type-level equality check for types A and B.
 * Returns true if types are equal, false otherwise.
 */
export type Equals<A, B> = 
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true 
    : false;

/**
 * Compile-time assertion that T is true.
 * Usage: type _Check = Assert<Equals<A, B>>;
 */
export type Assert<T extends true> = T;
