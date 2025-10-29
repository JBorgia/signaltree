export function isBuiltInObject(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  if (
    value instanceof Date ||
    value instanceof RegExp ||
    typeof value === 'function' ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof ArrayBuffer ||
    value instanceof DataView ||
    value instanceof Error ||
    value instanceof Promise
  ) {
    return true;
  }

  if (
    value instanceof Int8Array ||
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof BigInt64Array ||
    value instanceof BigUint64Array
  ) {
    return true;
  }

  if (typeof window !== 'undefined') {
    if (
      value instanceof URL ||
      value instanceof URLSearchParams ||
      value instanceof FormData ||
      value instanceof Blob ||
      (typeof File !== 'undefined' && value instanceof File) ||
      (typeof FileList !== 'undefined' && value instanceof FileList) ||
      (typeof Headers !== 'undefined' && value instanceof Headers) ||
      (typeof Request !== 'undefined' && value instanceof Request) ||
      (typeof Response !== 'undefined' && value instanceof Response) ||
      (typeof AbortController !== 'undefined' &&
        value instanceof AbortController) ||
      (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal)
    ) {
      return true;
    }
  }

  try {
    const NodeBuffer = (globalThis as { Buffer?: unknown })?.Buffer;
    if (
      NodeBuffer &&
      value instanceof (NodeBuffer as new (...args: unknown[]) => unknown)
    ) {
      return true;
    }
  } catch {
    // Ignore environment detection issues
  }

  return false;
}
