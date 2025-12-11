#!/usr/bin/env node

/**
 * Performance Comparison: v4.2.1 (array-based entities) vs v5.0 (map-based EntitySignal)
 *
 * This script measures performance differences between the two implementations:
 * - v4.x: Tree with array-based entity helpers (tree.entities<E>(path))
 * - v5.0: Tree with marker-based EntitySignal (store.$.entities.method())
 *
 * Metrics: operation latency (ms), throughput (ops/sec), memory overhead
 */

const fs = require('fs');
const path = require('path');

// Mock v4.2.1 API (simplified array-based entity approach)
class V4EntityHelpers {
  constructor(selectId) {
    this.selectId = selectId;
    this.entities = [];
    this.index = new Map();
  }

  setAll(entities) {
    this.entities = [...entities];
    this.rebuildIndex();
  }

  addOne(entity) {
    this.entities.push(entity);
    const id = this.selectId(entity);
    this.index.set(id, entity);
  }

  updateOne(id, update) {
    const entity = this.index.get(id);
    if (entity) {
      const updated = { ...entity, ...update };
      const idx = this.entities.indexOf(entity);
      this.entities[idx] = updated;
      this.index.set(id, updated);
    }
  }

  removeOne(id) {
    const entity = this.index.get(id);
    if (entity) {
      const idx = this.entities.indexOf(entity);
      this.entities.splice(idx, 1);
      this.index.delete(id);
    }
  }

  byId(id) {
    return this.index.get(id);
  }

  count() {
    return this.entities.length;
  }

  all() {
    return [...this.entities];
  }

  rebuildIndex() {
    this.index.clear();
    this.entities.forEach((entity) => {
      this.index.set(this.selectId(entity), entity);
    });
  }
}

// Mock v5.0 API (map-based EntitySignal approach)
class V5EntitySignal {
  constructor(selectId) {
    this.selectId = selectId;
    this.entities = new Map();
  }

  setAll(entities) {
    this.entities.clear();
    entities.forEach((entity) => {
      this.entities.set(this.selectId(entity), entity);
    });
  }

  addOne(entity) {
    this.entities.set(this.selectId(entity), entity);
  }

  updateOne(id, update) {
    const entity = this.entities.get(id);
    if (entity) {
      this.entities.set(id, { ...entity, ...update });
    }
  }

  removeOne(id) {
    this.entities.delete(id);
  }

  byId(id) {
    return this.entities.get(id);
  }

  count() {
    return this.entities.size;
  }

  all() {
    return Array.from(this.entities.values());
  }

  where(predicate) {
    return Array.from(this.entities.values()).filter(predicate);
  }
}

// Performance benchmark function
function benchmarkOperation(name, fn, iterations = 10000) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    samples.push(end - start);
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const p99 = samples[Math.floor(samples.length * 0.99)];

  return {
    name,
    median,
    mean,
    p95,
    p99,
    min: samples[0],
    max: samples[samples.length - 1],
    opsPerSecond: 1000 / median,
  };
}

// Test data
function generateTestData(size = 1000) {
  const data = [];
  for (let i = 0; i < size; i++) {
    data.push({
      id: i,
      name: `Entity ${i}`,
      value: Math.random() * 1000,
      nested: { prop: `nested_${i}` },
    });
  }
  return data;
}

console.log('='.repeat(80));
console.log('Performance Comparison: v4.2.1 (Array-Based) vs v5.0 (Map-Based)');
console.log('='.repeat(80));
console.log('');

const testData = generateTestData(1000);
const results = {
  timestamp: new Date().toISOString(),
  dataSize: testData.length,
  iterations: 10000,
  scenarios: [],
};

// Scenario 1: Initial load (setAll)
console.log('📊 Scenario 1: Initial Load (setAll with 1000 items)');
console.log('-'.repeat(80));

const v4Init = benchmarkOperation(
  'v4.2.1 - setAll',
  () => {
    const store = new V4EntityHelpers((e) => e.id);
    store.setAll(testData);
  },
  1000
);

const v5Init = benchmarkOperation(
  'v5.0 - setAll',
  () => {
    const store = new V5EntitySignal((e) => e.id);
    store.setAll(testData);
  },
  1000
);

console.log(
  `v4.2.1 - setAll: ${v4Init.median.toFixed(
    3
  )}ms median, ${v4Init.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `v5.0 - setAll:   ${v5Init.median.toFixed(
    3
  )}ms median, ${v5Init.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `Improvement: ${(
    ((v4Init.median - v5Init.median) / v4Init.median) *
    100
  ).toFixed(1)}% ${v4Init.median > v5Init.median ? 'faster' : 'slower'}`
);
console.log('');

results.scenarios.push({
  name: 'initial-load',
  v4: v4Init,
  v5: v5Init,
  improvement: (
    ((v4Init.median - v5Init.median) / v4Init.median) *
    100
  ).toFixed(1),
});

// Scenario 2: Single add operation
console.log('📊 Scenario 2: Single Add (addOne)');
console.log('-'.repeat(80));

const v4Store = new V4EntityHelpers((e) => e.id);
v4Store.setAll(testData);

const v5Store = new V5EntitySignal((e) => e.id);
v5Store.setAll(testData);

let id = 10000;
const v4Add = benchmarkOperation(
  'v4.2.1 - addOne',
  () => {
    const newEntity = { id: id++, name: `Entity ${id}`, value: Math.random() };
    v4Store.addOne(newEntity);
  },
  10000
);

id = 10000;
const v5Add = benchmarkOperation(
  'v5.0 - addOne',
  () => {
    const newEntity = { id: id++, name: `Entity ${id}`, value: Math.random() };
    v5Store.addOne(newEntity);
  },
  10000
);

console.log(
  `v4.2.1 - addOne: ${v4Add.median.toFixed(
    3
  )}ms median, ${v4Add.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `v5.0 - addOne:   ${v5Add.median.toFixed(
    3
  )}ms median, ${v5Add.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `Improvement: ${(
    ((v4Add.median - v5Add.median) / v4Add.median) *
    100
  ).toFixed(1)}% ${v4Add.median > v5Add.median ? 'faster' : 'slower'}`
);
console.log('');

results.scenarios.push({
  name: 'add-one',
  v4: v4Add,
  v5: v5Add,
  improvement: (((v4Add.median - v5Add.median) / v4Add.median) * 100).toFixed(
    1
  ),
});

// Scenario 3: Lookup by ID
console.log('📊 Scenario 3: Lookup by ID (byId)');
console.log('-'.repeat(80));

const v4Lookup = benchmarkOperation(
  'v4.2.1 - byId',
  () => {
    const randomId = Math.floor(Math.random() * 1000);
    v4Store.byId(randomId);
  },
  100000
);

const v5Lookup = benchmarkOperation(
  'v5.0 - byId',
  () => {
    const randomId = Math.floor(Math.random() * 1000);
    v5Store.byId(randomId);
  },
  100000
);

console.log(
  `v4.2.1 - byId: ${v4Lookup.median.toFixed(
    4
  )}ms median, ${v4Lookup.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `v5.0 - byId:   ${v5Lookup.median.toFixed(
    4
  )}ms median, ${v5Lookup.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `Improvement: ${(
    ((v4Lookup.median - v5Lookup.median) / v4Lookup.median) *
    100
  ).toFixed(1)}% ${v4Lookup.median > v5Lookup.median ? 'faster' : 'slower'}`
);
console.log('');

results.scenarios.push({
  name: 'lookup-by-id',
  v4: v4Lookup,
  v5: v5Lookup,
  improvement: (
    ((v4Lookup.median - v5Lookup.median) / v4Lookup.median) *
    100
  ).toFixed(1),
});

// Scenario 4: Update operation
console.log('📊 Scenario 4: Update (updateOne)');
console.log('-'.repeat(80));

const v4Update = benchmarkOperation(
  'v4.2.1 - updateOne',
  () => {
    const randomId = Math.floor(Math.random() * 1000);
    v4Store.updateOne(randomId, { value: Math.random() * 1000 });
  },
  10000
);

const v5Update = benchmarkOperation(
  'v5.0 - updateOne',
  () => {
    const randomId = Math.floor(Math.random() * 1000);
    v5Store.updateOne(randomId, { value: Math.random() * 1000 });
  },
  10000
);

console.log(
  `v4.2.1 - updateOne: ${v4Update.median.toFixed(
    3
  )}ms median, ${v4Update.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `v5.0 - updateOne:   ${v5Update.median.toFixed(
    3
  )}ms median, ${v5Update.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `Improvement: ${(
    ((v4Update.median - v5Update.median) / v4Update.median) *
    100
  ).toFixed(1)}% ${v4Update.median > v5Update.median ? 'faster' : 'slower'}`
);
console.log('');

results.scenarios.push({
  name: 'update-one',
  v4: v4Update,
  v5: v5Update,
  improvement: (
    ((v4Update.median - v5Update.median) / v4Update.median) *
    100
  ).toFixed(1),
});

// Scenario 5: Remove operation
console.log('📊 Scenario 5: Remove (removeOne)');
console.log('-'.repeat(80));

let removeId = 1000;
const v4Remove = benchmarkOperation(
  'v4.2.1 - removeOne',
  () => {
    v4Store.removeOne(removeId++);
    if (removeId > 1500) removeId = 1000;
  },
  10000
);

removeId = 1000;
const v5Remove = benchmarkOperation(
  'v5.0 - removeOne',
  () => {
    v5Store.removeOne(removeId++);
    if (removeId > 1500) removeId = 1000;
  },
  10000
);

console.log(
  `v4.2.1 - removeOne: ${v4Remove.median.toFixed(
    3
  )}ms median, ${v4Remove.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `v5.0 - removeOne:   ${v5Remove.median.toFixed(
    3
  )}ms median, ${v5Remove.opsPerSecond.toFixed(0)} ops/sec`
);
console.log(
  `Improvement: ${(
    ((v4Remove.median - v5Remove.median) / v4Remove.median) *
    100
  ).toFixed(1)}% ${v4Remove.median > v5Remove.median ? 'faster' : 'slower'}`
);
console.log('');

results.scenarios.push({
  name: 'remove-one',
  v4: v4Remove,
  v5: v5Remove,
  improvement: (
    ((v4Remove.median - v5Remove.median) / v4Remove.median) *
    100
  ).toFixed(1),
});

// Summary
console.log('='.repeat(80));
console.log('📈 Summary');
console.log('='.repeat(80));
console.log('');
console.log('| Operation    | v4.2.1 (ms) | v5.0 (ms) | Improvement |');
console.log('|---|---|---|---|');
results.scenarios.forEach((scenario) => {
  const improvement = parseFloat(scenario.improvement);
  const direction = improvement > 0 ? '✓ faster' : '✗ slower';
  console.log(
    `| ${scenario.name.padEnd(12)} | ${scenario.v4.median
      .toFixed(3)
      .padStart(11)} | ${scenario.v5.median
      .toFixed(3)
      .padStart(9)} | ${improvement.toFixed(1)}% ${direction} |`
  );
});
console.log('');

// Write results to file
const resultsPath = path.join(
  __dirname,
  '..',
  '..',
  'artifacts',
  'v4-vs-v5-comparison.json'
);
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(`✅ Results saved to ${resultsPath}`);
