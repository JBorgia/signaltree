#!/usr/bin/env node
/**
 * 🔍 Recursion Depth Performance Diagnostic
 *
 * Detailed analysis of why extreme/unlimited depth tests are slower
 */

console.log('🔍 Recursion Depth Performance Diagnostic\n');

class RecursionDiagnostic {
  measureDeepOperations(depth, iterations = 100) {
    const timings = {
      creation: [],
      access: [],
      update: [],
      total: [],
    };

    for (let i = 0; i < iterations; i++) {
      const totalStart = performance.now();

      // Measure creation
      const createStart = performance.now();
      const obj = { $: {} };
      let current = obj.$;

      for (let level = 1; level <= depth; level++) {
        current[`l${level}`] = {
          value: `level-${level}-${i}`,
        };
        if (level < depth) {
          current[`l${level}`].next = {};
          current = current[`l${level}`].next;
        }
      }
      timings.creation.push(performance.now() - createStart);

      // Measure access
      const accessStart = performance.now();
      let accessor = obj.$;
      for (let level = 1; level <= depth; level++) {
        if (accessor[`l${level}`]) {
          const value = accessor[`l${level}`].value;
          accessor[`l${level}`].value = `updated-${value}`;
          if (accessor[`l${level}`].next) {
            accessor = accessor[`l${level}`].next;
          }
        }
      }
      timings.access.push(performance.now() - accessStart);

      timings.total.push(performance.now() - totalStart);
    }

    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const max = (arr) => Math.max(...arr);
    const min = (arr) => Math.min(...arr);

    return {
      depth,
      iterations,
      creation: {
        avg: avg(timings.creation),
        min: min(timings.creation),
        max: max(timings.creation),
      },
      access: {
        avg: avg(timings.access),
        min: min(timings.access),
        max: max(timings.access),
      },
      total: {
        avg: avg(timings.total),
        min: min(timings.total),
        max: max(timings.total),
      },
    };
  }

  testMemoryPressure(depth) {
    const before = process.memoryUsage();

    // Create many deep structures
    const structures = [];
    for (let i = 0; i < 1000; i++) {
      const obj = { $: {} };
      let current = obj.$;
      for (let level = 1; level <= depth; level++) {
        current[`l${level}`] = { value: `level-${level}-${i}` };
        if (level < depth) {
          current[`l${level}`].next = {};
          current = current[`l${level}`].next;
        }
      }
      structures.push(obj);
    }

    const after = process.memoryUsage();
    const heapUsed = (after.heapUsed - before.heapUsed) / 1024 / 1024;

    return {
      depth,
      structures: structures.length,
      heapUsedMB: heapUsed,
      avgPerStructure: heapUsed / structures.length,
    };
  }

  testGarbageCollection(depth, iterations = 100) {
    // Force GC if available
    if (global.gc) global.gc();

    const before = process.memoryUsage();
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const obj = { $: {} };
      let current = obj.$;
      for (let level = 1; level <= depth; level++) {
        current[`l${level}`] = { value: `level-${level}-${i}` };
        if (level < depth) {
          current[`l${level}`].next = {};
          current = current[`l${level}`].next;
        }
      }
      // Let it be garbage collected
    }

    const elapsed = performance.now() - start;

    if (global.gc) global.gc();
    const after = process.memoryUsage();

    return {
      depth,
      elapsed,
      avgPerOp: elapsed / iterations,
      heapBefore: before.heapUsed / 1024 / 1024,
      heapAfter: after.heapUsed / 1024 / 1024,
      heapDelta: (after.heapUsed - before.heapUsed) / 1024 / 1024,
    };
  }

  runDiagnostic() {
    console.log('📊 Detailed Timing Analysis\n');
    console.log('==========================================\n');

    const depths = [5, 10, 15, 20];

    for (const depth of depths) {
      console.log(`🔬 Depth ${depth}:`);
      const result = this.measureDeepOperations(depth, 500);
      console.log(
        `  Creation: ${result.creation.avg.toFixed(
          4
        )}ms avg (${result.creation.min.toFixed(
          4
        )} - ${result.creation.max.toFixed(4)}ms)`
      );
      console.log(
        `  Access:   ${result.access.avg.toFixed(
          4
        )}ms avg (${result.access.min.toFixed(4)} - ${result.access.max.toFixed(
          4
        )}ms)`
      );
      console.log(
        `  Total:    ${result.total.avg.toFixed(
          4
        )}ms avg (${result.total.min.toFixed(4)} - ${result.total.max.toFixed(
          4
        )}ms)`
      );
      console.log('');
    }

    console.log('==========================================\n');
    console.log('📊 Memory Pressure Analysis\n');

    for (const depth of depths) {
      const result = this.testMemoryPressure(depth);
      console.log(
        `Depth ${depth}: ${result.heapUsedMB.toFixed(2)}MB total, ${(
          result.avgPerStructure * 1024
        ).toFixed(2)}KB per structure`
      );
    }

    console.log('\n==========================================\n');
    console.log('📊 Garbage Collection Impact\n');

    for (const depth of depths) {
      const result = this.testGarbageCollection(depth, 200);
      console.log(
        `Depth ${depth}: ${result.avgPerOp.toFixed(
          4
        )}ms avg, heap: ${result.heapBefore.toFixed(
          2
        )}MB → ${result.heapAfter.toFixed(2)}MB (Δ${result.heapDelta.toFixed(
          2
        )}MB)`
      );
    }

    console.log('\n==========================================\n');
    console.log('💡 Performance Insights:\n');

    const basic = this.measureDeepOperations(5, 500);
    const extreme = this.measureDeepOperations(15, 500);
    const unlimited = this.measureDeepOperations(20, 500);

    const extremeVsBasic =
      ((extreme.total.avg - basic.total.avg) / basic.total.avg) * 100;
    const unlimitedVsBasic =
      ((unlimited.total.avg - basic.total.avg) / basic.total.avg) * 100;

    console.log(
      `  Extreme (15) vs Basic (5):   +${extremeVsBasic.toFixed(1)}% slower`
    );
    console.log(
      `  Unlimited (20) vs Basic (5): +${unlimitedVsBasic.toFixed(1)}% slower`
    );
    console.log('');
    console.log('  Analysis:');
    if (extreme.creation.avg / extreme.total.avg > 0.6) {
      console.log('  - Most time spent in structure creation');
      console.log('  - Deep nesting creates object allocation overhead');
    }
    if (extreme.access.avg / extreme.total.avg > 0.6) {
      console.log('  - Most time spent in property access');
      console.log('  - Deep chains cause property lookup overhead');
    }

    const creationRatio = extreme.creation.avg / basic.creation.avg;
    const accessRatio = extreme.access.avg / basic.access.avg;

    if (creationRatio > accessRatio) {
      console.log(
        `  - Creation scales worse than access (${creationRatio.toFixed(
          1
        )}x vs ${accessRatio.toFixed(1)}x)`
      );
    } else {
      console.log(
        `  - Access scales worse than creation (${accessRatio.toFixed(
          1
        )}x vs ${creationRatio.toFixed(1)}x)`
      );
    }

    console.log('\n✅ Diagnostic complete!\n');
  }
}

// Run diagnostic
const diagnostic = new RecursionDiagnostic();
diagnostic.runDiagnostic();
