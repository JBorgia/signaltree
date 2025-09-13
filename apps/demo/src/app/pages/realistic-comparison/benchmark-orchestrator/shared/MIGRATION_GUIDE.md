# Benchmark Service Standardization Guide

This guide shows how to migrate existing benchmark services to use shared constants and utilities for consistency and maintainability.

## 1. Import Shared Constants

```typescript
import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
```

## 2. Replace Hardcoded Values

### Before (Inconsistent):

```typescript
// Different services had different values
const iterations = Math.min(dataSize, 1000); // Some used 1000
const iterations = Math.min(dataSize, 500); // Some used 500
const factors = Array.from({ length: 50 }, (_, i) => i + 1);
if ((i & 1023) === 0) await this.yieldToUI(); // Some used 1023
if (i % 100 === 0) await this.yieldToUI(); // Some used modulo!
```

### After (Consistent):

```typescript
// All services use same constants
const iterations = Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED);
const iterations = Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
const factors = Array.from({ length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT }, (_, i) => i + 1);
if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DEEP_NESTED) === 0) await this.yieldToUI();
if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.COMPUTED) === 0) await this.yieldToUI();
```

## 3. Standardize yieldToUI Method

### Before:

```typescript
private yieldToUI() {
  return new Promise<void>((r) => setTimeout(r));      // Some didn't specify delay
  return new Promise<void>((r) => setTimeout(r, 0));   // Some specified 0
}
```

### After:

```typescript
private yieldToUI() {
  return new Promise<void>((r) => setTimeout(r, BENCHMARK_CONSTANTS.TIMING.YIELD_DELAY_MS));
}
```

## 4. Migration Checklist

For each benchmark service, replace these patterns:

### Deep Nested Benchmarks:

- [ ] `Math.min(dataSize, 1000)` → `Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED)`
- [ ] `depth = 15` → `depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH`
- [ ] `(i & 1023) === 0` → `(i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DEEP_NESTED) === 0`

### Array Benchmarks:

- [ ] `Math.min(1000, dataSize)` → `Math.min(BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES, dataSize)`
- [ ] `(i & 255) === 0` → `(i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.ARRAY_UPDATES) === 0`

### Computed Benchmarks:

- [ ] `Math.min(dataSize, 500)` → `Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED)`
- [ ] `Array.from({ length: 50 }` → `Array.from({ length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT }`
- [ ] `(i & 1023) === 0` → `(i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.COMPUTED) === 0`

### Batch Benchmarks:

- [ ] `batches = 100` → `batches = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES`
- [ ] `batchSize = 1000` → `batchSize = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_SIZE`
- [ ] `(b & 7) === 0` → `(b & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.BATCH_UPDATES) === 0`

### Selector Benchmarks:

- [ ] `for (let i = 0; i < 1000` → `for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR`
- [ ] `(i & 63) === 0` → `(i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0`

### Memory/Scaling Benchmarks:

- [ ] Remove all `i % X === 0` patterns (these were unfair!)
- [ ] Replace with appropriate bitwise patterns from BENCHMARK_CONSTANTS.YIELD_FREQUENCY

## 5. Benefits After Migration

✅ **Consistency**: All services use identical timing and iteration patterns
✅ **Maintainability**: Single source of truth for all benchmark parameters  
✅ **Fairness**: No more accidental unfair advantages from different yielding patterns
✅ **Type Safety**: Constants are typed and validated
✅ **Documentation**: Constants are self-documenting with clear naming

## 6. Future Enhancements

Consider using shared utilities for:

- [ ] Data generation (`generateMockArray`, `createNestedStructure`)
- [ ] Performance measurement (`measurePerformance` wrapper)
- [ ] Batch processing (`processBatches` utility)
- [ ] Standard computation (`standardCompute` function)

This would further reduce duplication and ensure consistent behavior across all benchmark implementations.
