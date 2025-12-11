#!/usr/bin/env node
/**
 * 🧪 SignalTree Entity CRUD Performance Benchmarks
 *
 * Measures performance of v5.0 entity operations:
 * - addOne/addMany
 * - updateOne/updateMany/updateWhere
 * - removeOne/removeMany/removeWhere
 * - Query operations (all, byId, where, find)
 * - Map transformations
 */

const {
  signalTree,
  entityMap,
  withEntities,
} = require('../../dist/packages/core');

console.log('🧪 SignalTree Entity CRUD Performance Benchmarks\n');

class EntityPerformanceAnalyzer {
  constructor() {
    this.results = {};
  }

  createTestEntity(id) {
    return {
      id,
      name: `Entity-${id}`,
      status: 'active',
      createdAt: Date.now(),
      metadata: { tags: ['test', 'benchmark'], priority: id % 5 },
    };
  }

  measureOperation(name, operation, iterations = 1000) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      operation(i);
      times.push(performance.now() - start);
    }

    const sorted = times.sort((a, b) => a - b);
    const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
    const stddev = Math.sqrt(
      times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length
    );

    return {
      name,
      iterations,
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stddev,
    };
  }

  // Test addOne operation
  testAddOne() {
    console.log('📝 Testing addOne()...');

    const result = this.measureOperation(
      'addOne',
      (i) => {
        const tree = signalTree({
          entities: entityMap({ selectId: (e) => e.id }),
        }).with(withEntities());

        tree.$.entities.addOne(this.createTestEntity(i));
      },
      1000
    );

    this.results.addOne = result;
    console.log(
      `  Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms\n`
    );
    return result;
  }

  // Test addMany operation
  testAddMany() {
    console.log('📝 Testing addMany() with 100 entities...');

    const result = this.measureOperation(
      'addMany',
      (i) => {
        const tree = signalTree({
          entities: entityMap({ selectId: (e) => e.id }),
        }).with(withEntities());

        const entities = Array.from({ length: 100 }, (_, idx) =>
          this.createTestEntity(i * 100 + idx)
        );
        tree.$.entities.addMany(entities);
      },
      200
    );

    this.results.addMany = result;
    console.log(
      `  Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms\n`
    );
    return result;
  }

  // Test updateOne operation
  testUpdateOne() {
    console.log('📝 Testing updateOne()...');

    const tree = signalTree({
      entities: entityMap({ selectId: (e) => e.id }),
    }).with(withEntities());

    // Pre-populate with entities
    const entities = Array.from({ length: 1000 }, (_, i) =>
      this.createTestEntity(i)
    );
    tree.$.entities.addMany(entities);

    const result = this.measureOperation(
      'updateOne',
      (i) => {
        const id = i % 1000;
        tree.$.entities.updateOne(id, {
          status: 'updated',
          name: `Updated-${i}`,
        });
      },
      1000
    );

    this.results.updateOne = result;
    console.log(
      `  Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms\n`
    );
    return result;
  }

  // Test updateWhere operation
  testUpdateWhere() {
    console.log('📝 Testing updateWhere()...');

    const tree = signalTree({
      entities: entityMap({ selectId: (e) => e.id }),
    }).with(withEntities());

    // Pre-populate with entities
    const entities = Array.from({ length: 1000 }, (_, i) =>
      this.createTestEntity(i)
    );
    tree.$.entities.addMany(entities);

    const result = this.measureOperation(
      'updateWhere',
      (i) => {
        tree.$.entities.updateWhere((e) => e.metadata.priority === i % 5, {
          status: 'batch-updated',
        });
      },
      500
    );

    this.results.updateWhere = result;
    console.log(
      `  Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms\n`
    );
    return result;
  }

  // Test removeOne operation
  testRemoveOne() {
    console.log('📝 Testing removeOne()...');

    const result = this.measureOperation(
      'removeOne',
      (i) => {
        const tree = signalTree({
          entities: entityMap({ selectId: (e) => e.id }),
        }).with(withEntities());

        // Add entities
        const entities = Array.from({ length: 100 }, (_, idx) =>
          this.createTestEntity(idx)
        );
        tree.$.entities.addMany(entities);

        // Remove one
        tree.$.entities.removeOne(i % 100);
      },
      500
    );

    this.results.removeOne = result;
    console.log(
      `  Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms\n`
    );
    return result;
  }

  // Test query operations
  testQueries() {
    console.log('📝 Testing query operations...');

    const tree = signalTree({
      entities: entityMap({ selectId: (e) => e.id }),
    }).with(withEntities());

    // Pre-populate with entities
    const entities = Array.from({ length: 1000 }, (_, i) =>
      this.createTestEntity(i)
    );
    tree.$.entities.addMany(entities);

    // Test all()
    const allResult = this.measureOperation(
      'all()',
      () => {
        tree.$.entities.all()();
      },
      1000
    );
    this.results.queryAll = allResult;
    console.log(
      `  all(): ${allResult.mean.toFixed(4)}ms, P95: ${allResult.p95.toFixed(
        4
      )}ms`
    );

    // Test byId()
    const byIdResult = this.measureOperation(
      'byId()',
      (i) => {
        tree.$.entities.byId(i % 1000);
      },
      1000
    );
    this.results.queryById = byIdResult;
    console.log(
      `  byId(): ${byIdResult.mean.toFixed(4)}ms, P95: ${byIdResult.p95.toFixed(
        4
      )}ms`
    );

    // Test where()
    const whereResult = this.measureOperation(
      'where()',
      (i) => {
        tree.$.entities.where((e) => e.metadata.priority === i % 5)();
      },
      500
    );
    this.results.queryWhere = whereResult;
    console.log(
      `  where(): ${whereResult.mean.toFixed(
        4
      )}ms, P95: ${whereResult.p95.toFixed(4)}ms`
    );

    // Test find()
    const findResult = this.measureOperation(
      'find()',
      (i) => {
        tree.$.entities.find((e) => e.id === i % 1000)();
      },
      500
    );
    this.results.queryFind = findResult;
    console.log(
      `  find(): ${findResult.mean.toFixed(4)}ms, P95: ${findResult.p95.toFixed(
        4
      )}ms\n`
    );
  }

  // Test with large datasets
  testLargeDataset() {
    console.log('📝 Testing with large dataset (10,000 entities)...');

    const tree = signalTree({
      entities: entityMap({ selectId: (e) => e.id }),
    }).with(withEntities());

    // Add 10k entities
    const startAdd = performance.now();
    const entities = Array.from({ length: 10000 }, (_, i) =>
      this.createTestEntity(i)
    );
    tree.$.entities.addMany(entities);
    const addTime = performance.now() - startAdd;

    // Query all
    const startQuery = performance.now();
    tree.$.entities.all()();
    const queryTime = performance.now() - startQuery;

    // Update batch
    const startUpdate = performance.now();
    tree.$.entities.updateWhere((e) => e.id % 10 === 0, { status: 'special' });
    const updateTime = performance.now() - startUpdate;

    // Remove batch
    const startRemove = performance.now();
    tree.$.entities.removeWhere((e) => e.id > 9000);
    const removeTime = performance.now() - startRemove;

    this.results.largeDataset = {
      size: 10000,
      addTime,
      queryTime,
      updateTime,
      removeTime,
      finalSize: tree.$.entities.count()(),
    };

    console.log(`  Add 10k: ${addTime.toFixed(2)}ms`);
    console.log(`  Query all: ${queryTime.toFixed(2)}ms`);
    console.log(`  Update 1k: ${updateTime.toFixed(2)}ms`);
    console.log(`  Remove 1k: ${removeTime.toFixed(2)}ms`);
    console.log(`  Final count: ${tree.$.entities.count()()}\n`);
  }

  // Test reactivity overhead
  testReactivity() {
    console.log('📝 Testing reactivity overhead...');

    const tree = signalTree({
      entities: entityMap({ selectId: (e) => e.id }),
    }).with(withEntities());

    // Add some entities
    const entities = Array.from({ length: 100 }, (_, i) =>
      this.createTestEntity(i)
    );
    tree.$.entities.addMany(entities);

    const start = performance.now();

    // Perform operations that trigger reactivity
    // We'll measure the time it takes to update and read the signal
    for (let i = 0; i < 100; i++) {
      tree.$.entities.updateOne(i, { status: `iteration-${i}` });
      // Force signal computation to measure reactivity overhead
      tree.$.entities.count()();
    }

    const time = performance.now() - start;

    this.results.reactivity = {
      operations: 100,
      totalTime: time,
      avgTime: time / 100,
    };

    console.log(
      `  100 updates with signal reads: ${time.toFixed(2)}ms (${(
        time / 100
      ).toFixed(4)}ms avg)\n`
    );
  }

  async runAll() {
    console.log('🚀 Starting Entity CRUD Performance Analysis\n');
    console.log('==========================================\n');

    try {
      this.testAddOne();
      this.testAddMany();
      this.testUpdateOne();
      this.testUpdateWhere();
      this.testRemoveOne();
      this.testQueries();
      this.testLargeDataset();
      this.testReactivity();

      console.log('==========================================\n');
      console.log('📊 Summary Report\n');

      console.log('Single Operations (mean/p95):');
      console.log(
        `  addOne:      ${this.results.addOne.mean.toFixed(
          4
        )}ms / ${this.results.addOne.p95.toFixed(4)}ms`
      );
      console.log(
        `  updateOne:   ${this.results.updateOne.mean.toFixed(
          4
        )}ms / ${this.results.updateOne.p95.toFixed(4)}ms`
      );
      console.log(
        `  removeOne:   ${this.results.removeOne.mean.toFixed(
          4
        )}ms / ${this.results.removeOne.p95.toFixed(4)}ms`
      );

      console.log('\nBatch Operations (mean/p95):');
      console.log(
        `  addMany:     ${this.results.addMany.mean.toFixed(
          4
        )}ms / ${this.results.addMany.p95.toFixed(4)}ms`
      );
      console.log(
        `  updateWhere: ${this.results.updateWhere.mean.toFixed(
          4
        )}ms / ${this.results.updateWhere.p95.toFixed(4)}ms`
      );

      console.log('\nQuery Operations (mean/p95):');
      console.log(
        `  all():       ${this.results.queryAll.mean.toFixed(
          4
        )}ms / ${this.results.queryAll.p95.toFixed(4)}ms`
      );
      console.log(
        `  byId():      ${this.results.queryById.mean.toFixed(
          4
        )}ms / ${this.results.queryById.p95.toFixed(4)}ms`
      );
      console.log(
        `  where():     ${this.results.queryWhere.mean.toFixed(
          4
        )}ms / ${this.results.queryWhere.p95.toFixed(4)}ms`
      );
      console.log(
        `  find():      ${this.results.queryFind.mean.toFixed(
          4
        )}ms / ${this.results.queryFind.p95.toFixed(4)}ms`
      );

      console.log('\nLarge Dataset (10k entities):');
      console.log(
        `  Add all:     ${this.results.largeDataset.addTime.toFixed(2)}ms`
      );
      console.log(
        `  Query all:   ${this.results.largeDataset.queryTime.toFixed(2)}ms`
      );
      console.log(
        `  Batch update: ${this.results.largeDataset.updateTime.toFixed(2)}ms`
      );
      console.log(
        `  Batch remove: ${this.results.largeDataset.removeTime.toFixed(2)}ms`
      );

      console.log('\n✅ All entity performance tests completed!\n');

      return this.results;
    } catch (error) {
      console.error('\n❌ Error running benchmarks:', error);
      throw error;
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const analyzer = new EntityPerformanceAnalyzer();
  analyzer
    .runAll()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { EntityPerformanceAnalyzer };
