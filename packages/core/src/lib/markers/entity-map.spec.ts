import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { entityMap, isEntityMapMarker } from './entity-map';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user' | 'guest';
  active: boolean;
  score: number;
}

describe('entityMap() marker', () => {
  describe('basic marker creation', () => {
    it('should create an entity map marker', () => {
      const marker = entityMap<User, number>();
      expect(marker.__isEntityMap).toBe(true);
      expect(isEntityMapMarker(marker)).toBe(true);
    });

    it('should store custom config', () => {
      const selectId = (u: User) => u.id;
      const marker = entityMap<User, number>({ selectId });
      expect(marker.__entityMapConfig?.selectId).toBe(selectId);
    });
  });

  describe('computed slices', () => {
    it('should create marker with computed slices', () => {
      const marker = entityMap<User, number>()
        .computed('admins', (all) => all.filter((u) => u.role === 'admin'))
        .computed('activeUsers', (all) => all.filter((u) => u.active));

      expect(marker.__isEntityMap).toBe(true);
      expect(marker.__computedSlices).toBeDefined();
      // __computedSlices is an object, not array
      expect(Object.keys(marker.__computedSlices ?? {}).length).toBe(2);
    });

    it('should chain multiple computed slices', () => {
      const marker = entityMap<User, number>()
        .computed('admins', (all) => all.filter((u) => u.role === 'admin'))
        .computed('guests', (all) => all.filter((u) => u.role === 'guest'))
        .computed('highScorers', (all) => all.filter((u) => u.score > 100));

      expect(Object.keys(marker.__computedSlices ?? {}).length).toBe(3);
    });
  });

  describe('integration with signalTree', () => {
    it('should materialize computed slices in tree', () => {
      const tree = signalTree({
        users: entityMap<User, number>()
          .computed('admins', (all) => all.filter((u) => u.role === 'admin'))
          .computed('activeUsers', (all) => all.filter((u) => u.active)),
      });

      // Add some users
      tree.$.users.addMany([
        { id: 1, name: 'Alice', role: 'admin', active: true, score: 150 },
        { id: 2, name: 'Bob', role: 'user', active: true, score: 80 },
        { id: 3, name: 'Charlie', role: 'admin', active: false, score: 200 },
        { id: 4, name: 'Diana', role: 'guest', active: true, score: 50 },
      ]);

      // Access computed slices
      const admins = (tree.$.users as any).admins();
      const activeUsers = (tree.$.users as any).activeUsers();

      expect(admins).toHaveLength(2);
      expect(admins.map((u: User) => u.name)).toContain('Alice');
      expect(admins.map((u: User) => u.name)).toContain('Charlie');

      expect(activeUsers).toHaveLength(3);
      expect(activeUsers.map((u: User) => u.name)).not.toContain('Charlie');
    });

    it('should update computed slices when entities change', () => {
      const tree = signalTree({
        users: entityMap<User, number>().computed('active', (all) =>
          all.filter((u) => u.active)
        ),
      });

      tree.$.users.addMany([
        { id: 1, name: 'Alice', role: 'user', active: true, score: 100 },
        { id: 2, name: 'Bob', role: 'user', active: false, score: 100 },
      ]);

      expect((tree.$.users as any).active()).toHaveLength(1);

      // Update Bob to be active
      tree.$.users.updateOne(2, { active: true });

      expect((tree.$.users as any).active()).toHaveLength(2);
    });

    it('should work with complex filter functions', () => {
      const tree = signalTree({
        users: entityMap<User, number>().computed('topActiveAdmins', (all) =>
          all
            .filter((u) => u.role === 'admin' && u.active && u.score > 100)
            .sort((a, b) => b.score - a.score)
        ),
      });

      tree.$.users.addMany([
        { id: 1, name: 'Alice', role: 'admin', active: true, score: 150 },
        { id: 2, name: 'Bob', role: 'admin', active: true, score: 80 },
        { id: 3, name: 'Charlie', role: 'admin', active: false, score: 200 },
        { id: 4, name: 'Diana', role: 'admin', active: true, score: 300 },
      ]);

      const topActiveAdmins = (tree.$.users as any).topActiveAdmins();

      expect(topActiveAdmins).toHaveLength(2);
      expect(topActiveAdmins[0].name).toBe('Diana'); // Highest score
      expect(topActiveAdmins[1].name).toBe('Alice');
    });

    it('should allow returning transformed data', () => {
      const tree = signalTree({
        users: entityMap<User, number>()
          .computed('userNames', (all) => all.map((u) => u.name))
          .computed('totalScore', (all) =>
            all.reduce((sum, u) => sum + u.score, 0)
          ),
      });

      tree.$.users.addMany([
        { id: 1, name: 'Alice', role: 'user', active: true, score: 100 },
        { id: 2, name: 'Bob', role: 'user', active: true, score: 200 },
      ]);

      const names = (tree.$.users as any).userNames();
      const total = (tree.$.users as any).totalScore();

      expect(names).toEqual(['Alice', 'Bob']);
      expect(total).toBe(300);
    });

    it('should preserve existing entityMap methods', () => {
      const tree = signalTree({
        users: entityMap<User, number>().computed('active', (all) =>
          all.filter((u) => u.active)
        ),
      });

      // All standard methods should still work
      tree.$.users.addOne({
        id: 1,
        name: 'Test',
        role: 'user',
        active: true,
        score: 50,
      });
      expect(tree.$.users.all()).toHaveLength(1);
      expect(tree.$.users.byId(1)?.()).toBeDefined();
      expect(tree.$.users.count()).toBe(1);

      tree.$.users.updateOne(1, { name: 'Updated' });
      expect(tree.$.users.byId(1)?.().name).toBe('Updated');

      tree.$.users.removeOne(1);
      expect(tree.$.users.all()).toHaveLength(0);
    });
  });
});
