import { deepClone } from './deep-clone';

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
    // `source` is untrusted — the live path is
    // localStorage -> JSON.parse -> ng-forms hydrateInitialValues -> here.
    // `targetObj['__proto__'] = …` sets the TARGET's prototype to
    // attacker-supplied data (verified: `Object.getPrototypeOf(target)` changed,
    // and the injected keys were readable through it). Not global pollution,
    // but an attacker-chosen prototype on an object the app then trusts.
    //
    // No child index exists here — mergeDeep operates on plain data, not tree
    // nodes — so this is the accumulator shape, and the guard is a name skip.
    // `constructor`/`prototype` are not blocked: they cannot reach the chain
    // through a plain assignment, and blocking them would eat real data.
    if (key === '__proto__') continue;
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
