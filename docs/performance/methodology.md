# Performance Methodology

## What We Measure

### signalTree vs raw signal()

`signalTree()` adds overhead on top of Angular's `signal()` primitive. We measure this honestly:

- **Creation cost**: Time to create a signalTree vs creating equivalent individual signals
- **Read cost**: Time to read a value through `tree.$.path()` vs `mySignal()`
- **Write cost**: Time to write through `tree.$.path.set()` vs `mySignal.set()`
- **Deep access**: How overhead scales with nesting depth

### Enhancer overhead

Each enhancer adds cost. We measure:

- **Disabled enhancer cost**: Even `enabled: false` has a code path. Should be near-zero.
- **Batching overhead**: Time added per write when batching is active
- **Memoization overhead**: Time added per read when memoization is active
- **DevTools overhead (disabled)**: Cost of the disabled codepath

## Measurement Rules

1. **Warm up**: Run 100 iterations before measuring
2. **Statistical**: Report median, not mean (avoids GC outlier skew)
3. **Cold vs warm**: Test both first-access and cached-access patterns
4. **Realistic sizes**: Use 5-50 top-level keys (real app range), not micro-benchmarks
5. **Context**: Always state what we're comparing against

## What We Don't Claim

- We don't claim to be "faster than NgRx". They solve different problems differently.
- We don't assign numerical scores to competing libraries.
- Bundle size comparisons must be apples-to-apples (same features enabled).
