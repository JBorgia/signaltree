// Polyfill structuredClone for test environment
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = <T>(obj: T): T => {
    // Handle primitives and null
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Handle Date objects
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
      return obj.map((item) => global.structuredClone(item)) as T;
    }

    // Handle Objects
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = global.structuredClone(obj[key]);
      }
    }

    return cloned;
  };
}

// Mock performance.memory if not available
if (!('memory' in performance)) {
  Object.defineProperty(performance, 'memory', {
    value: { usedJSHeapSize: 1000000 },
    writable: false,
  });
}
