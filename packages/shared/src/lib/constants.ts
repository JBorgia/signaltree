export const SHARED_DEFAULTS = Object.freeze({
  /** Maximum number of cached path lookups retained by parsePath */
  PATH_CACHE_SIZE: 1000,
} as const);

export const DEFAULT_PATH_CACHE_SIZE = SHARED_DEFAULTS.PATH_CACHE_SIZE;
