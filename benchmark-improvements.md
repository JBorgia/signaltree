# SignalTree Benchmark Improvements

## Issues Addressed

### 1. Memory Measurement Problems

- **Removed unreliable `performance.memory` API usage** - Chrome-only, affected by GC timing
- **Replaced heap measurements with operational performance** - focuses on actual work done
- **Added honest disclaimers** about memory measurement limitations

### 2. Architectural Framing Improvements

- **Changed from "winner/loser" to "trade-offs"** - helps developers understand when each approach excels
- **Added specific use cases** for each architecture pattern
- **Emphasized frequency considerations** - real-world usage patterns matter more than raw speed

### 3. Better Context for Results

- **Added frequency weighting insights** - noted that operation frequency matters more than raw performance
- **Explained architectural costs** - memory vs performance, developer experience vs speed
- **Real-world applicability** - connected benchmarks to actual development scenarios

## Key Changes Made

1. **Updated header documentation** to focus on architectural trade-offs rather than performance comparisons
2. **Removed problematic memory API usage** and the unused `PerfWithMemory` type
3. **Improved benchmark comments** to explain use cases and architectural decisions
4. **Added frequency considerations** to help developers understand real-world implications

## Philosophy Shift

From: "Which library is fastest?"
To: "Which architecture fits your specific needs?"

This positions the benchmarks as educational tools for understanding state management patterns rather than simplistic performance competitions.
