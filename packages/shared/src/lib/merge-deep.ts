import { deepClone } from './deep-clone.js';

/**
 * Deep merges a partial source object into a target object.
 * Creates new object instances for nested objects to avoid mutation.
 *
 * @param target - The target object to merge into
 * @param source - The partial source object to merge from
 * @returns The merged target object (mutated)
 */
export function mergeDeep<T>(target: T, source: Partial<T>): T {
  if (!source || typeof source !== 'object') {
    return target;
  }

  const targetObj = target as Record<string, unknown>;
  const sourceObj = source as Record<string, unknown>;

  for (const [key, value] of Object.entries(sourceObj)) {
    if (value === undefined) {
      continue;
    }
    const current = targetObj[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      targetObj[key] = mergeDeep(
        deepClone(current) as Record<string, unknown>,
        value as Record<string, unknown>
      ) as unknown;
      continue;
    }

    targetObj[key] = deepClone(value);
  }

  return target;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}
