import { signalTree } from '../../../lib/signal-tree';
import { entityMap } from '../../../lib/types';
import { withEntities } from './entities';

/**
 * Integration tests for v5.0 EntitySignal + withEntities
 *
 * Tests the complete flow:
 * 1. entityMap<E>() markers in initial state
 * 2. signalTree() preserves markers
 * 3. withEntities() materializes EntitySignalImpl instances
 * 4. Full CRUD operations via tree.$.collectionName
 */

interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface Product {
  id: number;
  title: string;
  price: number;
}

describe('EntitySignal v5.0 Integration', () => {
  describe('Basic entity operations', () => {
    it('should materialize EntitySignal from entityMap marker', () => {
      const tree = signalTree({
        users: entityMap<User>(),
        count: 0,
      }).with(withEntities());

      expect(tree.$.users).toBeDefined();
      expect(typeof tree.$.users.addOne).toBe('function');
      expect(typeof tree.$.users.all).toBe('function');
    });

    it('should support CRUD operations via tree.$', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      // Add entity
      const userId = tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      expect(userId).toBe('u1');

      // Query all
      const allUsers = tree.$.users.all()();
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].name).toBe('Alice');

      // Update entity
      tree.$.users.updateOne('u1', { name: 'Alice Updated' });
      const updated = tree.$.users.all()();
      expect(updated[0].name).toBe('Alice Updated');

      // Remove entity
      tree.$.users.removeOne('u1');
      const afterRemove = tree.$.users.all()();
      expect(afterRemove).toHaveLength(0);
    });

    it('should support numeric IDs', () => {
      const tree = signalTree({
        products: entityMap<Product, number>(),
      }).with(withEntities());

      tree.$.products.addOne({
        id: 100,
        title: 'Widget',
        price: 29.99,
      });

      const products = tree.$.products.all()();
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe(100);
    });

    it('should throw on duplicate entity addition', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      expect(() => {
        tree.$.users.addOne({
          id: 'u1',
          name: 'Bob',
          email: 'bob@example.com',
          active: false,
        });
      }).toThrow('Entity with id u1 already exists');
    });
  });

  describe('Query signals', () => {
    it('should provide reactive query signals', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });
      tree.$.users.addOne({
        id: 'u2',
        name: 'Bob',
        email: 'bob@example.com',
        active: false,
      });

      // count()
      expect(tree.$.users.count()()).toBe(2);

      // ids()
      const ids = tree.$.users.ids()();
      expect(ids).toEqual(['u1', 'u2']);

      // has()
      expect(tree.$.users.has('u1')()).toBe(true);
      expect(tree.$.users.has('u3')()).toBe(false);

      // isEmpty()
      expect(tree.$.users.isEmpty()()).toBe(false);

      tree.$.users.clear();
      expect(tree.$.users.isEmpty()()).toBe(true);
    });

    it('should support where() predicate queries', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      const activeUsers = tree.$.users.where((u) => u.active)();
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers[0].name).toBe('Alice');
      expect(activeUsers[1].name).toBe('Charlie');
    });

    it('should support find() predicate queries', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
      ]);

      const bob = tree.$.users.find((u) => u.name === 'Bob')();
      expect(bob).toBeDefined();
      expect(bob?.email).toBe('bob@example.com');

      const missing = tree.$.users.find((u) => u.name === 'Nobody')();
      expect(missing).toBeUndefined();
    });
  });

  describe('Batch operations', () => {
    it('should support addMany', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      const ids = tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      expect(ids).toEqual(['u1', 'u2', 'u3']);
      expect(tree.$.users.count()()).toBe(3);
    });

    it('should support updateMany', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
      ]);

      tree.$.users.updateMany(['u1', 'u2'], { active: false });

      const users = tree.$.users.all()();
      expect(users.every((u) => !u.active)).toBe(true);
    });

    it('should support removeMany', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      tree.$.users.removeMany(['u1', 'u3']);

      const remaining = tree.$.users.all()();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('u2');
    });

    it('should support updateWhere', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      const updated = tree.$.users.updateWhere((u) => u.active, {
        active: false,
      });

      expect(updated).toBe(2);
      const users = tree.$.users.all()();
      expect(users.every((u) => !u.active)).toBe(true);
    });

    it('should support removeWhere', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      const removed = tree.$.users.removeWhere((u) => u.active);

      expect(removed).toBe(2);
      const remaining = tree.$.users.all()();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('u2');
    });
  });

  describe('Upsert operations', () => {
    it('should add new entity if not exists', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.upsertOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      expect(tree.$.users.count()()).toBe(1);
    });

    it('should update existing entity', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      tree.$.users.upsertOne({
        id: 'u1',
        name: 'Alice Updated',
        email: 'alice.new@example.com',
        active: false,
      });

      const users = tree.$.users.all()();
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Alice Updated');
      expect(users[0].email).toBe('alice.new@example.com');
    });

    it('should support upsertMany', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      tree.$.users.upsertMany([
        {
          id: 'u1',
          name: 'Alice Updated',
          email: 'alice@example.com',
          active: true,
        },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
      ]);

      const users = tree.$.users.all()();
      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Alice Updated');
    });
  });

  describe('Entity access', () => {
    it('should support bracket notation access', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      const user = tree.$.users['u1'];
      expect(user).toBeDefined();
      expect(user?.()).toBeDefined();
      expect(user?.().id).toBe('u1');
    });

    it('should support byId() method', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      const user = tree.$.users.byId('u1');
      expect(user).toBeDefined();
      expect(user?.().name).toBe('Alice');

      const missing = tree.$.users.byId('u99');
      expect(missing).toBeUndefined();
    });

    it('should support byIdOrFail() method', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      const user = tree.$.users.byIdOrFail('u1');
      expect(user().name).toBe('Alice');

      expect(() => tree.$.users.byIdOrFail('u99')).toThrow(
        'Entity with id u99 not found'
      );
    });
  });

  describe('setAll and clear operations', () => {
    it('should replace all entities with setAll', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
      ]);

      tree.$.users.setAll([
        {
          id: 'u3',
          name: 'Charlie',
          email: 'charlie@example.com',
          active: true,
        },
      ]);

      const users = tree.$.users.all()();
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe('u3');
    });

    it('should clear all entities', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addMany([
        { id: 'u1', name: 'Alice', email: 'alice@example.com', active: true },
        { id: 'u2', name: 'Bob', email: 'bob@example.com', active: false },
      ]);

      tree.$.users.clear();

      expect(tree.$.users.isEmpty()()).toBe(true);
      expect(tree.$.users.count()()).toBe(0);
    });

    it('should support removeAll alias', () => {
      const tree = signalTree({
        users: entityMap<User>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      tree.$.users.removeAll();

      expect(tree.$.users.count()()).toBe(0);
    });
  });

  describe('Custom selectId configuration', () => {
    it('should use custom selectId function', () => {
      interface CustomEntity {
        customId: string;
        value: number;
      }

      const tree = signalTree({
        items: entityMap<CustomEntity, string>({
          selectId: (entity) => entity.customId,
        }),
      }).with(withEntities());

      tree.$.items.addOne({
        customId: 'item-1',
        value: 100,
      });

      const items = tree.$.items.all()();
      expect(items).toHaveLength(1);
      expect(items[0].customId).toBe('item-1');

      const ids = tree.$.items.ids()();
      expect(ids).toEqual(['item-1']);
    });
  });

  describe('Multiple entity collections', () => {
    it('should support multiple independent collections', () => {
      const tree = signalTree({
        users: entityMap<User>(),
        products: entityMap<Product, number>(),
      }).with(withEntities());

      tree.$.users.addOne({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        active: true,
      });

      tree.$.products.addOne({
        id: 1,
        title: 'Widget',
        price: 29.99,
      });

      expect(tree.$.users.count()()).toBe(1);
      expect(tree.$.products.count()()).toBe(1);

      const user = tree.$.users.all()()[0];
      const product = tree.$.products.all()()[0];

      expect(user.name).toBe('Alice');
      expect(product.title).toBe('Widget');
    });
  });
});
