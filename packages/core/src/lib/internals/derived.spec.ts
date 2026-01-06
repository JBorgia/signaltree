describe('derived() marker pattern', () => {
  describe('basic derived state', () => {
    it('should create derived computed signals from source state', () => {
      interface CounterState {
        count: number;
      }

      const tree = signalTree<CounterState>({ count: 5 }).derived(($) => ({
        doubled: computed(() => $.count() * 2),
        tripled: computed(() => $.count() * 3),
      }));

      // Access $ to finalize
      expect(tree.$.doubled()).toBe(10);
import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entities } from '../../enhancers/entities/entities';
import { signalTree } from '../signal-tree';
import { entityMap } from '../types';

      expect(tree.$.tripled()).toBe(15);

      // Update source state
      tree.$.count.set(10);

      // Derived should update
      expect(tree.$.doubled()).toBe(20);
      expect(tree.$.tripled()).toBe(30);
    });

    it('should work with nested source state', () => {
      interface AppState {
        user: {
          firstName: string;
          lastName: string;
        };
      }

      const tree = signalTree<AppState>({
        user: {
          firstName: 'John',
          lastName: 'Doe',
        },
      }).derived(($) => ({
        fullName: computed(() => `${$.user.firstName()} ${$.user.lastName()}`),
      }));

      expect(tree.$.fullName()).toBe('John Doe');

      // Update nested state
      tree.$.user.firstName.set('Jane');
      expect(tree.$.fullName()).toBe('Jane Doe');
    });
  });

  describe('chained derived layers', () => {
    it('should support derived-of-derived', () => {
      const tree = signalTree({ value: 2 })
        .derived(($) => ({
          doubled: computed(() => $.value() * 2),
        }))
        .derived(($) => ({
          quadrupled: computed(() => $.doubled() * 2),
        }));

      expect(tree.$.doubled()).toBe(4);
      expect(tree.$.quadrupled()).toBe(8);

      // Update source
      tree.$.value.set(5);
      expect(tree.$.doubled()).toBe(10);
      expect(tree.$.quadrupled()).toBe(20);
    });

    it('should maintain correct dependency tracking', () => {
      let computeCount = 0;

      const tree = signalTree({ a: 1, b: 2 })
        .derived(($) => ({
          sum: computed(() => {
            computeCount++;
            return $.a() + $.b();
          }),
        }))
        .derived(($) => ({
          doubleSum: computed(() => $.sum() * 2),
        }));

      // Initial access
      expect(tree.$.sum()).toBe(3);
      expect(tree.$.doubleSum()).toBe(6);
      const initialCount = computeCount;

      // Update a - should recompute sum
      tree.$.a.set(10);
      expect(tree.$.sum()).toBe(12);
      expect(tree.$.doubleSum()).toBe(24);
      expect(computeCount).toBeGreaterThan(initialCount);
    });
  });

  describe('derived with nested objects', () => {
    it('should support nested derived definitions', () => {
      const tree = signalTree({
        items: [1, 2, 3],
      }).derived(($) => ({
        stats: {
          count: computed(() => $.items().length),
          sum: computed(() =>
            $.items().reduce((a: number, b: number) => a + b, 0)
          ),
        },
      }));

      expect(tree.$.stats.count()).toBe(3);
      expect(tree.$.stats.sum()).toBe(6);

      tree.$.items.set([1, 2, 3, 4, 5]);
      expect(tree.$.stats.count()).toBe(5);
      expect(tree.$.stats.sum()).toBe(15);
    });

    it('should deep-merge derived namespace into source namespace preserving all properties', () => {
      // This test verifies the deep merge behavior:
      // When a derived layer defines a nested object at the same path as a source object,
      // the source properties should be preserved and the derived properties added.
      interface TicketEntity {
        id: number;
        status: string;
      }

      const tree = signalTree({
        tickets: {
          entities: entityMap<TicketEntity, number>(),
          activeId: null as number | null,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      })
        .with(entities())
        .derived(($) => ({
          // Derived namespace with same path as source
          tickets: {
            // Add derived signals
            active: computed(() => {
              const id = $.tickets.activeId();
              return id != null
                ? $.tickets.entities.byId(id)?.() ?? null
                : null;
            }),
            all: computed(() => $.tickets.entities.all()),
          },
        }));

      // Verify derived signals work
      expect(tree.$.tickets.active()).toBe(null);
      expect(tree.$.tickets.all()).toEqual([]);

      // CRITICAL: Verify source properties are preserved (deep merge)
      // These should NOT be undefined after the derived merge
      expect(tree.$.tickets.entities).toBeDefined();
      expect(typeof tree.$.tickets.entities.addOne).toBe('function');
      expect(typeof tree.$.tickets.entities.byId).toBe('function');
      expect(tree.$.tickets.activeId).toBeDefined();
      expect(tree.$.tickets.startDate).toBeDefined();
      expect(tree.$.tickets.endDate).toBeDefined();

      // Verify mutations still work through source properties
      tree.$.tickets.entities.addOne({ id: 1, status: 'pending' });
      tree.$.tickets.activeId.set(1);

      // Verify derived signals reflect the mutations
      expect(tree.$.tickets.all().length).toBe(1);
      expect(tree.$.tickets.active()?.id).toBe(1);
      expect(tree.$.tickets.active()?.status).toBe('pending');

      // Verify source signal mutations work
      tree.$.tickets.startDate.set(new Date('2024-06-01'));
      expect(tree.$.tickets.startDate()).toEqual(new Date('2024-06-01'));
    });

    it('should preserve entityMap methods when adding derived signals to same namespace', () => {
      // Specifically tests that entityMap API is preserved
      interface Item {
        id: number;
        name: string;
      }

      const tree = signalTree({
        items: {
          entities: entityMap<Item, number>(),
          selectedId: null as number | null,
        },
      })
        .with(entities())
        .derived(($) => ({
          items: {
            selected: computed(() => {
              const id = $.items.selectedId();
              return id != null ? $.items.entities.byId(id)?.() ?? null : null;
            }),
            count: computed(() => $.items.entities.count()),
          },
        }));

      // EntityMap methods should be preserved
      expect(tree.$.items.entities.addOne).toBeDefined();
      expect(tree.$.items.entities.addMany).toBeDefined();
      expect(tree.$.items.entities.updateOne).toBeDefined();
      expect(tree.$.items.entities.removeOne).toBeDefined();
      expect(tree.$.items.entities.setAll).toBeDefined();
      expect(tree.$.items.entities.upsertOne).toBeDefined();
      expect(tree.$.items.entities.byId).toBeDefined();
      expect(tree.$.items.entities.all).toBeDefined();

      // Use the preserved methods
      tree.$.items.entities.upsertOne({ id: 1, name: 'First' });
      tree.$.items.entities.upsertOne({ id: 2, name: 'Second' });

      // Derived signals should work
      expect(tree.$.items.count()).toBe(2);
      expect(tree.$.items.selected()).toBe(null);

      // Select and verify
      tree.$.items.selectedId.set(1);
      expect(tree.$.items.selected()?.name).toBe('First');
    });
  });

  describe('backward compatibility', () => {
    it('should remain callable like the original signalTree', () => {
      const tree = signalTree({ count: 0 });

      // tree() should return the unwrapped state
      expect(tree()).toEqual({ count: 0 });

      // tree(newValue) should update
      tree({ count: 5 });
      expect(tree()).toEqual({ count: 5 });
    });

    it('should preserve state and $ accessors', () => {
      const tree = signalTree({ name: 'test' }).derived(($) => ({
        upper: computed(() => $.name().toUpperCase()),
      }));

      // Both accessors should work
      expect(tree.$.name()).toBe('test');
      expect(tree.state.name()).toBe('test');
    });

    it('should preserve with() enhancer chaining', () => {
      const tree = signalTree({ count: 0 }).derived(($) => ({
        doubled: computed(() => $.count() * 2),
      }));

      // with() should still be available
      expect(typeof tree.with).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should throw if derived() called after $ access', () => {
      const tree = signalTree({ count: 0 });

      // Access $ to finalize
      tree.$.count();

      // Now derived() should throw
      expect(() => {
        tree.derived(($) => ({
          doubled: computed(() => $.count() * 2),
        }));
      }).toThrow(/Cannot add derived\(\) after tree\.\$ has been accessed/);
    });
  });

  describe('mixed derived and computed', () => {
    it('should work alongside regular computed signals', () => {
      const tree = signalTree({ value: 10 }).derived(($) => ({
        // derived() marker
        markerDerived: computed(() => $.value() + 1),
        // Regular computed (should also work)
        regularComputed: computed(() => $.value() + 2),
      }));

      expect(tree.$.markerDerived()).toBe(11);
      expect(tree.$.regularComputed()).toBe(12);
    });
  });

  describe('second-argument syntax', () => {
    it('should accept derived factory as second argument', () => {
      const tree = signalTree({ count: 5 }, ($) => ({
        doubled: computed(() => $.count() * 2),
        tripled: computed(() => $.count() * 3),
      }));

      expect(tree.$.doubled()).toBe(10);
      expect(tree.$.tripled()).toBe(15);

      tree.$.count.set(10);
      expect(tree.$.doubled()).toBe(20);
    });

    it('should be equivalent to .derived() chaining', () => {
      const tree1 = signalTree({ value: 2 }).derived(($) => ({
        squared: computed(() => $.value() ** 2),
      }));

      const tree2 = signalTree({ value: 2 }, ($) => ({
        squared: computed(() => $.value() ** 2),
      }));

      expect(tree1.$.squared()).toBe(tree2.$.squared());
      expect(tree1.$.squared()).toBe(4);
    });

    it('should allow further .derived() chaining after second-argument', () => {
      const tree = signalTree({ base: 2 }, ($) => ({
        doubled: computed(() => $.base() * 2),
      })).derived(($) => ({
        quadrupled: computed(() => $.doubled() * 2),
      }));

      expect(tree.$.doubled()).toBe(4);
      expect(tree.$.quadrupled()).toBe(8);
    });

    it('should work with nested derived definitions', () => {
      const tree = signalTree({ items: [1, 2, 3, 4, 5] }, ($) => ({
        stats: {
          count: computed(() => $.items().length),
          sum: computed(() =>
            $.items().reduce((a: number, b: number) => a + b, 0)
          ),
        },
      }));

      expect(tree.$.stats.count()).toBe(5);
      expect(tree.$.stats.sum()).toBe(15);
    });
  });

  describe('TruckTrax migration pattern', () => {
    // Simulating the AppStore computed pattern from TruckTrax
    interface DriverDto {
      id: number;
      name: string;
      isExternal: boolean;
      url: string;
    }

    interface TruckDto {
      id: number;
      name: string;
      haulerIds: number[];
      primaryProductLine: string;
    }

    interface HaulerDto {
      id: number;
      name: string;
    }

    it('should migrate AppStore computed signals to derived()', () => {
      // Before: AppStore had separate computed() calls
      // After: Using derived() in the tree definition

      const tree = signalTree({
        driver: {
          current: null as DriverDto | null,
        },
        selected: {
          haulerId: null as number | null,
          truckId: null as number | null,
        },
        trucks: [
          {
            id: 1,
            name: 'Truck A',
            haulerIds: [10],
            primaryProductLine: 'Concrete',
          },
          {
            id: 2,
            name: 'Truck B',
            haulerIds: [10, 20],
            primaryProductLine: 'Asphalt',
          },
        ] as TruckDto[],
        haulers: [
          { id: 10, name: 'Hauler X' },
          { id: 20, name: 'Hauler Y' },
        ] as HaulerDto[],
      }).derived(($) => ({
        // Migrated from AppStore.isExternalDriver
        isExternalDriver: computed(
          () => $.driver.current()?.isExternal ?? true
        ),

        // Migrated from AppStore.isDriverLoaded
        isDriverLoaded: computed(() => $.driver.current() != null),

        // Migrated from AppStore.driverUrl
        driverUrl: computed(() => $.driver.current()?.url ?? ''),

        // Migrated from AppStore.selectedTruck
        selectedTruck: computed(() => {
          const id = $.selected.truckId();
          return id != null
            ? $.trucks().find((t) => t.id === id) ?? null
            : null;
        }),

        // Migrated from AppStore.selectedProductLine
        selectedProductLine: computed(() => {
          const id = $.selected.truckId();
          const truck = id != null ? $.trucks().find((t) => t.id === id) : null;
          return truck?.primaryProductLine ?? null;
        }),

        // Migrated from AppStore.selectableTrucks
        selectableTrucks: computed(() => {
          const driver = $.driver.current();
          if (!driver) return [];
          if (!driver.isExternal) return $.trucks();

          const haulerId = $.selected.haulerId();
          if (haulerId == null) return [];

          return $.trucks().filter((truck) =>
            truck.haulerIds.includes(haulerId)
          );
        }),

        // Migrated from AppStore.areHaulerAndTruckSelected
        areHaulerAndTruckSelected: computed(() => {
          const driver = $.driver.current();
          if (!driver) return false;
          if (!driver.isExternal) return $.selected.truckId() != null;
          return $.selected.haulerId() != null && $.selected.truckId() != null;
        }),
      }));

      // Test initial state (no driver)
      expect(tree.$.isExternalDriver()).toBe(true);
      expect(tree.$.isDriverLoaded()).toBe(false);
      expect(tree.$.driverUrl()).toBe('');
      expect(tree.$.selectedTruck()).toBe(null);
      expect(tree.$.selectableTrucks()).toEqual([]);
      expect(tree.$.areHaulerAndTruckSelected()).toBe(false);

      // Set an internal driver
      tree.$.driver.current.set({
        id: 1,
        name: 'John',
        isExternal: false,
        url: '/drivers/1',
      });

      expect(tree.$.isExternalDriver()).toBe(false);
      expect(tree.$.isDriverLoaded()).toBe(true);
      expect(tree.$.driverUrl()).toBe('/drivers/1');
      expect(tree.$.selectableTrucks().length).toBe(2); // All trucks for internal driver

      // Select a truck
      tree.$.selected.truckId.set(1);
      expect(tree.$.selectedTruck()?.name).toBe('Truck A');
      expect(tree.$.selectedProductLine()).toBe('Concrete');
      expect(tree.$.areHaulerAndTruckSelected()).toBe(true);

      // Switch to external driver
      tree.$.driver.current.set({
        id: 2,
        name: 'Jane',
        isExternal: true,
        url: '/drivers/2',
      });
      tree.$.selected.truckId.set(null);

      expect(tree.$.isExternalDriver()).toBe(true);
      expect(tree.$.selectableTrucks()).toEqual([]); // No hauler selected
      expect(tree.$.areHaulerAndTruckSelected()).toBe(false);

      // Select hauler for external driver
      tree.$.selected.haulerId.set(10);
      expect(tree.$.selectableTrucks().length).toBe(2); // Both trucks have hauler 10

      // Select specific truck
      tree.$.selected.truckId.set(2);
      expect(tree.$.selectedTruck()?.name).toBe('Truck B');
      expect(tree.$.areHaulerAndTruckSelected()).toBe(true);
    });

    it('should support derived-of-derived for complex computations', () => {
      // Simulating AppStore.ticketWorkflow which depends on activeProductLine
      const tree = signalTree({
        selected: { truckId: null as number | null },
        trucks: [
          { id: 1, productLine: 'Concrete' },
          { id: 2, productLine: 'Asphalt' },
        ],
      })
        .derived(($) => ({
          // First layer: selectedTruck
          selectedTruck: computed(() => {
            const id = $.selected.truckId();
            return $.trucks().find((t) => t.id === id) ?? null;
          }),
        }))
        .derived(($) => ({
          // Second layer: depends on selectedTruck
          activeProductLine: computed(
            () => $.selectedTruck()?.productLine ?? null
          ),
        }))
        .derived(($) => ({
          // Third layer: depends on activeProductLine
          ticketWorkflow: computed(() => {
            const productLine = $.activeProductLine();
            if (productLine === 'Concrete') {
              return [
                'Batching',
                'Loading',
                'InTransit',
                'Pouring',
                'Complete',
              ];
            }
            if (productLine === 'Asphalt') {
              return ['Loading', 'InTransit', 'Dumping', 'Complete'];
            }
            return ['Loading', 'Complete'];
          }),
        }));

      // No truck selected
      expect(tree.$.activeProductLine()).toBe(null);
      expect(tree.$.ticketWorkflow()).toEqual(['Loading', 'Complete']);

      // Select concrete truck
      tree.$.selected.truckId.set(1);
      expect(tree.$.activeProductLine()).toBe('Concrete');
      expect(tree.$.ticketWorkflow()).toEqual([
        'Batching',
        'Loading',
        'InTransit',
        'Pouring',
        'Complete',
      ]);

      // Switch to asphalt truck
      tree.$.selected.truckId.set(2);
      expect(tree.$.activeProductLine()).toBe('Asphalt');
      expect(tree.$.ticketWorkflow()).toEqual([
        'Loading',
        'InTransit',
        'Dumping',
        'Complete',
      ]);
    });
  });

  describe('entityMap integration', () => {
    interface UserEntity {
      id: number;
      name: string;
      email: string;
      role: 'admin' | 'user';
      active: boolean;
    }

    it('should work with entityMap queries in derived()', () => {
      const tree = signalTree({
        users: entityMap<UserEntity, number>(),
        selectedUserId: null as number | null,
      })
        .with(entities())
        .derived(($) => ({
          // Derived from entityMap.byId()
          selectedUser: computed(() => {
            const id = $.selectedUserId();
            return id != null ? $.users.byId(id)?.() ?? null : null;
          }),

          // Derived from entityMap.all()
          activeUsers: computed(() =>
            $.users.all().filter((u: UserEntity) => u.active)
          ),

          // Derived from entityMap.count
          userCount: computed(() => $.users.count()),

          // Derived from entityMap.where()
          adminUsers: computed(() =>
            $.users.all().filter((u: UserEntity) => u.role === 'admin')
          ),
        }));

      // Initial state - no users
      expect(tree.$.selectedUser()).toBe(null);
      expect(tree.$.activeUsers()).toEqual([]);
      expect(tree.$.userCount()).toBe(0);
      expect(tree.$.adminUsers()).toEqual([]);

      // Add some users
      tree.$.users.addMany([
        {
          id: 1,
          name: 'Alice',
          email: 'alice@test.com',
          role: 'admin',
          active: true,
        },
        {
          id: 2,
          name: 'Bob',
          email: 'bob@test.com',
          role: 'user',
          active: true,
        },
        {
          id: 3,
          name: 'Charlie',
          email: 'charlie@test.com',
          role: 'user',
          active: false,
        },
      ]);

      expect(tree.$.userCount()).toBe(3);
      expect(tree.$.activeUsers().length).toBe(2);
      expect(tree.$.adminUsers().length).toBe(1);
      expect(tree.$.adminUsers()[0].name).toBe('Alice');

      // Select a user
      tree.$.selectedUserId.set(2);
      expect(tree.$.selectedUser()?.name).toBe('Bob');

      // Update user status
      tree.$.users.updateOne(3, { active: true });
      expect(tree.$.activeUsers().length).toBe(3);

      // Select non-existent user
      tree.$.selectedUserId.set(999);
      expect(tree.$.selectedUser()).toBe(null);
    });

    it('should support complex queries with multiple entityMaps', () => {
      interface OrderEntity {
        id: number;
        userId: number;
        total: number;
        status: 'pending' | 'shipped' | 'delivered';
      }

      const tree = signalTree({
        users: entityMap<UserEntity, number>(),
        orders: entityMap<OrderEntity, number>(),
        selectedUserId: null as number | null,
      })
        .with(entities())
        .derived(($) => ({
          selectedUser: computed(() => {
            const id = $.selectedUserId();
            return id != null ? $.users.byId(id)?.() ?? null : null;
          }),

          // Cross-entity derived: orders for selected user
          selectedUserOrders: computed(() => {
            const userId = $.selectedUserId();
            if (userId == null) return [];
            return $.orders
              .all()
              .filter((o: OrderEntity) => o.userId === userId);
          }),

          // Aggregation: total revenue per user status
          totalPendingRevenue: computed(() =>
            $.orders
              .all()
              .filter((o: OrderEntity) => o.status === 'pending')
              .reduce((sum: number, o: OrderEntity) => sum + o.total, 0)
          ),
        }))
        .derived(($) => ({
          // Second layer: depends on selectedUserOrders
          selectedUserOrderCount: computed(() => $.selectedUserOrders().length),

          selectedUserTotalSpent: computed(() =>
            $.selectedUserOrders().reduce(
              (sum: number, o: OrderEntity) => sum + o.total,
              0
            )
          ),
        }));

      // Setup data
      tree.$.users.addMany([
        { id: 1, name: 'Alice', email: 'a@t.com', role: 'admin', active: true },
        { id: 2, name: 'Bob', email: 'b@t.com', role: 'user', active: true },
      ]);

      tree.$.orders.addMany([
        { id: 101, userId: 1, total: 100, status: 'pending' },
        { id: 102, userId: 1, total: 200, status: 'shipped' },
        { id: 103, userId: 2, total: 50, status: 'pending' },
        { id: 104, userId: 2, total: 75, status: 'delivered' },
      ]);

      // Check totals
      expect(tree.$.totalPendingRevenue()).toBe(150); // 100 + 50

      // Select Alice
      tree.$.selectedUserId.set(1);
      expect(tree.$.selectedUserOrders().length).toBe(2);
      expect(tree.$.selectedUserOrderCount()).toBe(2);
      expect(tree.$.selectedUserTotalSpent()).toBe(300);

      // Select Bob
      tree.$.selectedUserId.set(2);
      expect(tree.$.selectedUserOrders().length).toBe(2);
      expect(tree.$.selectedUserOrderCount()).toBe(2);
      expect(tree.$.selectedUserTotalSpent()).toBe(125);

      // Update order status
      tree.$.orders.updateOne(103, { status: 'shipped' });
      expect(tree.$.totalPendingRevenue()).toBe(100); // Only Alice's pending order
    });

    it('should handle entity mutations reactively', () => {
      const tree = signalTree({
        items: entityMap<{ id: number; value: number }, number>(),
      })
        .with(entities())
        .derived(($) => ({
          sum: computed(() =>
            $.items
              .all()
              .reduce(
                (acc: number, item: { value: number }) => acc + item.value,
                0
              )
          ),
          average: computed(() => {
            const all = $.items.all();
            if (all.length === 0) return 0;
            const sum = all.reduce(
              (acc: number, item: { value: number }) => acc + item.value,
              0
            );
            return sum / all.length;
          }),
        }));

      expect(tree.$.sum()).toBe(0);
      expect(tree.$.average()).toBe(0);

      tree.$.items.addOne({ id: 1, value: 10 });
      expect(tree.$.sum()).toBe(10);
      expect(tree.$.average()).toBe(10);

      tree.$.items.addOne({ id: 2, value: 20 });
      expect(tree.$.sum()).toBe(30);
      expect(tree.$.average()).toBe(15);

      tree.$.items.updateOne(1, { value: 30 });
      expect(tree.$.sum()).toBe(50);
      expect(tree.$.average()).toBe(25);

      tree.$.items.removeOne(2);
      expect(tree.$.sum()).toBe(30);
      expect(tree.$.average()).toBe(30);
    });
  });

  describe('performance characteristics', () => {
    it('should not add significant overhead to tree creation', () => {
      const iterations = 1000;

      // Measure tree creation with derived()
      const startWithDerived = performance.now();
      for (let i = 0; i < iterations; i++) {
        const tree = signalTree({ count: i }).derived(($) => ({
          doubled: computed(() => $.count() * 2),
        }));
        // Access $ to finalize (this is the typical usage pattern)
        void tree.$.doubled();
      }
      const endWithDerived = performance.now();
      const timeWithDerived = endWithDerived - startWithDerived;

      // Measure tree creation without derived() for comparison
      const startWithout = performance.now();
      for (let i = 0; i < iterations; i++) {
        const tree = signalTree({ count: i });
        // Access $ similarly
        void tree.$.count();
      }
      const endWithout = performance.now();
      const timeWithout = endWithout - startWithout;

      // derived() should add less than 5x overhead (generous margin for CI variance)
      // In practice, it's typically <2x on warm runs
      const ratio = timeWithDerived / timeWithout;
      console.log(
        `Performance: ${iterations} iterations - with derived: ${timeWithDerived.toFixed(
          2
        )}ms, without: ${timeWithout.toFixed(2)}ms, ratio: ${ratio.toFixed(2)}x`
      );
      expect(ratio).toBeLessThan(5);
    });

    it('should not recalculate derived values on unrelated state changes', () => {
      let derivedCallCount = 0;

      const tree = signalTree({
        relatedValue: 1,
        unrelatedValue: 'hello',
      }).derived(($) => ({
        doubledRelated: computed(() => {
          derivedCallCount++;
          return $.relatedValue() * 2;
        }),
      }));

      // Initial access
      expect(tree.$.doubledRelated()).toBe(2);
      const initialCallCount = derivedCallCount;

      // Change unrelated value - should NOT trigger recalculation
      tree.$.unrelatedValue.set('world');
      // Access derived again - should use cached value
      expect(tree.$.doubledRelated()).toBe(2);
      expect(derivedCallCount).toBe(initialCallCount); // No new call

      // Change related value - SHOULD trigger recalculation
      tree.$.relatedValue.set(5);
      expect(tree.$.doubledRelated()).toBe(10);
      expect(derivedCallCount).toBe(initialCallCount + 1); // One new call
    });

    it('should handle deep chaining without exponential overhead', () => {
      const chainDepth = 10;
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        let builder = signalTree({ base: i });
        for (let d = 0; d < chainDepth; d++) {
          builder = builder.derived(($) => {
            // Cast needed because computed property keys create index signature
            const accessor = $ as Record<string, () => number>;
            return {
              [`level${d}`]: computed(() => accessor['base']() + d),
            };
          }) as typeof builder;
        }
        // Access the final derived value
        void (builder.$ as Record<string, () => number>)[
          `level${chainDepth - 1}`
        ]();
      }
      const end = performance.now();
      const totalTime = end - start;

      console.log(
        `Deep chaining: ${iterations} trees with ${chainDepth} derived layers each: ${totalTime.toFixed(
          2
        )}ms`
      );

      // Should complete reasonably fast (less than 500ms for 100 iterations with 10 layers)
      expect(totalTime).toBeLessThan(500);
    });
  });
});
