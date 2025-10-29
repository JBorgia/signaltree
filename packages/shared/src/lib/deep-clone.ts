type StructuredCloneFn = <T>(value: T) => T;

const globalStructuredClone: StructuredCloneFn | undefined =
  typeof globalThis === 'object' && globalThis !== null
    ? (globalThis as { structuredClone?: StructuredCloneFn }).structuredClone
    : undefined;

/**
 * Deeply clones the provided value while preserving complex object types.
 * Falls back to manual cloning logic when the platform does not support
 * `structuredClone` or when the runtime throws for unsupported inputs.
 */
export function deepClone<T>(value: T): T {
  if (globalStructuredClone) {
    try {
      return globalStructuredClone(value);
    } catch {
      // Fall through to manual implementation if structuredClone fails.
    }
  }

  return cloneValue(value, new WeakMap<object, unknown>());
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Functions are treated as opaque references.
  if (typeof value === 'function') {
    return value;
  }

  const existing = seen.get(value as object);
  if (existing) {
    return existing as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof Map) {
    const result = new Map();
    seen.set(value as object, result);
    for (const [key, entryValue] of value) {
      result.set(cloneValue(key, seen), cloneValue(entryValue, seen));
    }
    return result as T;
  }

  if (value instanceof Set) {
    const result = new Set();
    seen.set(value as object, result);
    for (const entry of value) {
      result.add(cloneValue(entry, seen));
    }
    return result as T;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = new Array(value.length);
    seen.set(value as object, result);
    for (let i = 0; i < value.length; i++) {
      result[i] = cloneValue(value[i], seen);
    }
    return result as T;
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const bufferClone = cloneValue(value.buffer, seen) as ArrayBuffer;
      return new DataView(bufferClone, value.byteOffset, value.byteLength) as T;
    }

    const viewWithSlice = value as unknown as { slice?: () => unknown };
    if (typeof viewWithSlice.slice === 'function') {
      return viewWithSlice.slice() as T;
    }

    const bufferClone = cloneValue(
      (value as { buffer: ArrayBufferLike }).buffer,
      seen
    ) as ArrayBufferLike;
    return new (value.constructor as {
      new (buffer: ArrayBufferLike, byteOffset: number, length?: number): T;
    })(
      bufferClone,
      (value as { byteOffset: number }).byteOffset,
      (value as { length?: number }).length
    );
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }

  const proto = Object.getPrototypeOf(value);
  const result = proto ? Object.create(proto) : {};
  seen.set(value as object, result);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;

    if ('value' in descriptor) {
      descriptor.value = cloneValue(descriptor.value, seen);
    }

    Object.defineProperty(result, key, descriptor);
  }

  return result as T;
}
