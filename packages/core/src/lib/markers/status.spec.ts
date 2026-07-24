import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import {
  createStatusSignal,
  isStatusMarker,
  LoadingState,
  status,
  STATUS_MARKER,
} from '../markers/status';
import { signalTree } from '../signal-tree';
import { entityMap } from '../types';

describe('status() marker', () => {
  describe('marker creation', () => {
    it('should create a status marker', () => {
      const marker = status();

      expect(marker[STATUS_MARKER]).toBe(true);
      expect(marker.initialState).toBe(LoadingState.NotLoaded);
    });

    it('should accept initial state', () => {
      const marker = status(LoadingState.Loading);
      expect(marker.initialState).toBe(LoadingState.Loading);
    });

    it('should be identifiable by type guard', () => {
      const marker = status();
      expect(isStatusMarker(marker)).toBe(true);
      expect(isStatusMarker({})).toBe(false);
      expect(isStatusMarker(null)).toBe(false);
      expect(isStatusMarker('status')).toBe(false);
    });
  });

  describe('signal creation', () => {
    it('should create a StatusSignal with correct initial state', () => {
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.NotLoaded,
      });

      expect(sig.state()).toBe(LoadingState.NotLoaded);
      expect(sig.error()).toBe(null);
      expect(sig.notLoaded()).toBe(true);
      expect(sig.loading()).toBe(false);
      expect(sig.loaded()).toBe(false);
      expect(sig.hasError()).toBe(false);
    });

    it('should respect custom initial state', () => {
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.Loading,
      });

      expect(sig.state()).toBe(LoadingState.Loading);
      expect(sig.loading()).toBe(true);
      expect(sig.notLoaded()).toBe(false);
    });
  });

  describe('idle() — the "should I (re)fetch?" predicate', () => {
    const sig = () =>
      createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.NotLoaded,
      });

    it('is true initially (NotLoaded)', () => {
      expect(sig().idle()).toBe(true);
    });

    it('is false while loading', () => {
      const s = sig();
      s.setLoading();
      expect(s.idle()).toBe(false);
    });

    it('is false once loaded', () => {
      const s = sig();
      s.setLoaded();
      expect(s.idle()).toBe(false);
    });

    it('stays TRUE after setError — the footgun notLoaded() misses (retry-never)', () => {
      const s = sig();
      s.setError(new Error('boom'));
      // notLoaded() is false in the Error state — a notLoaded()-gated guard
      // would never retry. idle() is the correct guard predicate.
      expect(s.notLoaded()).toBe(false);
      expect(s.idle()).toBe(true);
    });

    it('is true again after reset / setNotLoaded', () => {
      const s = sig();
      s.setLoaded();
      s.reset();
      expect(s.idle()).toBe(true);
      s.setLoaded();
      s.setNotLoaded();
      expect(s.idle()).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should transition through loading states', () => {
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.NotLoaded,
      });

      // setLoading
      sig.setLoading();
      expect(sig.state()).toBe(LoadingState.Loading);
      expect(sig.loading()).toBe(true);
      expect(sig.error()).toBe(null);

      // setLoaded
      sig.setLoaded();
      expect(sig.state()).toBe(LoadingState.Loaded);
      expect(sig.loaded()).toBe(true);
      expect(sig.error()).toBe(null);

      // setError
      const error = new Error('Test error');
      sig.setError(error);
      expect(sig.state()).toBe(LoadingState.Error);
      expect(sig.hasError()).toBe(true);
      expect(sig.error()).toBe(error);

      // reset
      sig.reset();
      expect(sig.state()).toBe(LoadingState.NotLoaded);
      expect(sig.notLoaded()).toBe(true);
      expect(sig.error()).toBe(null);
    });

    it('should clear error when transitioning to non-error states', () => {
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.NotLoaded,
      });
      const error = new Error('Test');

      sig.setError(error);
      expect(sig.error()).toBe(error);

      sig.setLoading();
      expect(sig.error()).toBe(null);
    });

    it('should alias setNotLoaded as reset', () => {
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.Loaded,
      });

      sig.setNotLoaded();
      expect(sig.state()).toBe(LoadingState.NotLoaded);

      sig.setLoaded();
      sig.reset();
      expect(sig.state()).toBe(LoadingState.NotLoaded);
    });

    describe('Promise-vocabulary aliases (v10.2)', () => {
      it('should treat start() as setLoading()', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        sig.start();
        expect(sig.state()).toBe(LoadingState.Loading);
        expect(sig.loading()).toBe(true);
        expect(sig.error()).toBe(null);
      });

      it('should treat setSuccess() as setLoaded()', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.Loading,
        });
        sig.setSuccess();
        expect(sig.state()).toBe(LoadingState.Loaded);
        expect(sig.loaded()).toBe(true);
      });

      it('should treat succeed() as setLoaded()', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.Loading,
        });
        sig.succeed();
        expect(sig.state()).toBe(LoadingState.Loaded);
        expect(sig.loaded()).toBe(true);
      });

      it('should treat fail(err) as setError(err)', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.Loading,
        });
        const err = new Error('boom');
        sig.fail(err);
        expect(sig.state()).toBe(LoadingState.Error);
        expect(sig.hasError()).toBe(true);
        expect(sig.error()).toBe(err);
      });

      it('should clear error on start() after a fail()', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        sig.fail(new Error('boom'));
        expect(sig.error()).not.toBe(null);
        sig.start();
        expect(sig.state()).toBe(LoadingState.Loading);
        expect(sig.error()).toBe(null);
      });
    });

    describe('bare-name predicates (canonical) — match Angular FormControl shape', () => {
      it('should cache .loading — repeated access returns the same Signal instance', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        sig.setLoading();
        // Both names work
        expect(sig.loading()).toBe(true);
        expect(sig.loading()).toBe(true);
        // Same Signal instance — first access creates one cached computed
        expect(sig.loading).toBe(sig.loading);
      });

      it('should cache .loaded — repeated access returns the same Signal instance', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        sig.setLoaded();
        expect(sig.loaded()).toBe(true);
        expect(sig.loaded()).toBe(true);
        expect(sig.loaded).toBe(sig.loaded);
      });

      it('should cache .notLoaded — repeated access returns the same Signal instance', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        expect(sig.notLoaded()).toBe(true);
        expect(sig.notLoaded()).toBe(true);
        expect(sig.notLoaded).toBe(sig.notLoaded);
      });

      it('should cache .hasError — repeated access returns the same Signal instance', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        sig.setError(new Error('boom'));
        expect(sig.hasError()).toBe(true);
        expect(sig.hasError()).toBe(true);
        expect(sig.hasError).toBe(sig.hasError);
      });

      it('all four predicates stay reactive across state transitions via bare names', () => {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        expect(sig.notLoaded()).toBe(true);
        expect(sig.loading()).toBe(false);
        sig.setLoading();
        expect(sig.notLoaded()).toBe(false);
        expect(sig.loading()).toBe(true);
        sig.setLoaded();
        expect(sig.loaded()).toBe(true);
        expect(sig.loading()).toBe(false);
        sig.setError(new Error('boom'));
        expect(sig.hasError()).toBe(true);
        expect(sig.loaded()).toBe(false);
      });
    });
  });

  describe('integration with signalTree', () => {
    it('should auto-materialize status markers', () => {
      const tree = signalTree({
        data: {
          status: status(),
        },
      });

      // Access $ to finalize and materialize markers
      expect(tree.$.data.status.state()).toBe(LoadingState.NotLoaded);
      expect(tree.$.data.status.notLoaded()).toBe(true);
    });

    it('should work at top level', () => {
      const tree = signalTree({
        status: status(),
        value: 0,
      });

      expect(tree.$.status.state()).toBe(LoadingState.NotLoaded);
      tree.$.status.setLoading();
      expect(tree.$.status.loading()).toBe(true);
    });

    it('should work with nested structures', () => {
      const tree = signalTree({
        users: {
          status: status(),
          data: [] as string[],
        },
        products: {
          status: status(LoadingState.Loading),
          data: [] as string[],
        },
      });

      expect(tree.$.users.status.notLoaded()).toBe(true);
      expect(tree.$.products.status.loading()).toBe(true);
    });

    it('should work alongside entityMap', () => {
      interface User {
        id: number;
        name: string;
      }

      const tree = signalTree({
        users: {
          entities: entityMap<User, number>(),
          status: status(),
        },
      });

      // Both markers should be materialized
      expect(tree.$.users.status.notLoaded()).toBe(true);
      expect(typeof tree.$.users.entities.addOne).toBe('function');

      // Use both
      tree.$.users.status.setLoading();
      tree.$.users.entities.addOne({ id: 1, name: 'Alice' });
      tree.$.users.status.setLoaded();

      expect(tree.$.users.status.loaded()).toBe(true);
      expect(tree.$.users.entities.count()).toBe(1);
    });

    it('should work with derived state', () => {
      const tree = signalTree({
        users: {
          data: [] as string[],
          status: status(),
        },
      }).derived(($) => ({
        showSpinner: computed(() => $.users.status.loading()),
        hasData: computed(
          () => $.users.status.loaded() && $.users.data().length > 0
        ),
      }));

      expect(tree.$.showSpinner()).toBe(false);
      expect(tree.$.hasData()).toBe(false);

      tree.$.users.status.setLoading();
      expect(tree.$.showSpinner()).toBe(true);

      tree.$.users.status.setLoaded();
      tree.$.users.data.set(['item']);
      expect(tree.$.hasData()).toBe(true);
    });

    it('should work with deep merge pattern', () => {
      interface Ticket {
        id: number;
        title: string;
      }

      const tree = signalTree({
        tickets: {
          entities: entityMap<Ticket, number>(),
          status: status(),
          activeId: null as number | null,
        },
      }).derived(($) => ({
        tickets: {
          active: computed(() => {
            const id = $.tickets.activeId();
            return id != null ? $.tickets.entities.byId(id)?.() : null;
          }),
          isReady: computed(() => $.tickets.status.loaded()),
        },
      }));

      // Source state preserved
      expect(tree.$.tickets.status.notLoaded()).toBe(true);
      expect(typeof tree.$.tickets.entities.addOne).toBe('function');

      // Derived state works
      expect(tree.$.tickets.isReady()).toBe(false);

      // Update and verify
      tree.$.tickets.status.setLoaded();
      expect(tree.$.tickets.isReady()).toBe(true);
    });
  });

  describe('LoadingState enum', () => {
    it('should have correct values', () => {
      expect(LoadingState.NotLoaded).toBe('NOT_LOADED');
      expect(LoadingState.Loading).toBe('LOADING');
      expect(LoadingState.Loaded).toBe('LOADED');
      expect(LoadingState.Error).toBe('ERROR');
    });
  });

  describe('performance', () => {
    it('should initialize 100 markers in under 50ms', () => {
      const start = performance.now();

      // Create 100 individual trees with status markers
      const trees = [];
      for (let i = 0; i < 100; i++) {
        trees.push(
          signalTree({
            data: {
              status: status(),
            },
          })
        );
      }

      // Access $ to trigger finalization on all
      for (const tree of trees) {
        tree.$.data.status.state();
      }

      const elapsed = performance.now() - start;

      // Performance budget: 100 markers should initialize in < 50ms
      expect(elapsed).toBeLessThan(50);

      // Verify markers are working
      expect(trees[0].$.data.status.notLoaded()).toBe(true);
      expect(trees[99].$.data.status.notLoaded()).toBe(true);
    });

    it('should lazily create computed signals only on access', () => {
      // Create a status signal directly
      const sig = createStatusSignal({
        [STATUS_MARKER]: true,
        initialState: LoadingState.NotLoaded,
      });

      // State and error should exist immediately
      expect(sig.state()).toBe(LoadingState.NotLoaded);
      expect(sig.error()).toBe(null);

      // Accessing loading should still work (created lazily)
      expect(sig.loading()).toBe(false);

      // All derived signals should work correctly
      expect(sig.notLoaded()).toBe(true);
      expect(sig.loaded()).toBe(false);
      expect(sig.hasError()).toBe(false);
    });

    it('should have minimal overhead without accessing derived signals', () => {
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const sig = createStatusSignal({
          [STATUS_MARKER]: true,
          initialState: LoadingState.NotLoaded,
        });
        // Only access state, not derived signals
        sig.state();
        sig.setLoading();
        sig.setLoaded();
      }
      const elapsed = performance.now() - start;

      // 1000 status signals with state transitions should complete quickly
      // This tests that we're not creating computed signals eagerly
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('generic error type', () => {
    interface CustomError {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }

    it('should support custom error type via generic', () => {
      const marker = status<CustomError>();
      const sig = createStatusSignal(marker);

      const customError: CustomError = {
        code: 'ERR_001',
        message: 'Something went wrong',
        details: { field: 'name' },
      };

      sig.setError(customError);
      expect(sig.error()).toEqual(customError);
      expect(sig.error()?.code).toBe('ERR_001');
      expect(sig.hasError()).toBe(true);
    });

    it('should integrate with signalTree using custom error type', () => {
      interface Ticket {
        id: number;
        title: string;
      }

      const tree = signalTree({
        tickets: {
          entities: entityMap<Ticket, number>(),
          status: status<CustomError>(),
        },
      });

      // Verify error signal accepts custom type
      const customError: CustomError = {
        code: 'LOAD_FAILED',
        message: 'Failed to load tickets',
      };

      tree.$.tickets.status.setError(customError);
      expect(tree.$.tickets.status.error()).toEqual(customError);
      expect(tree.$.tickets.status.hasError()).toBe(true);

      // Reset clears error
      tree.$.tickets.status.reset();
      expect(tree.$.tickets.status.error()).toBe(null);
      expect(tree.$.tickets.status.notLoaded()).toBe(true);
    });

    it('should default to Error type when no generic provided', () => {
      const marker = status();
      const sig = createStatusSignal(marker);

      const jsError = new Error('Standard JS error');
      sig.setError(jsError);
      expect(sig.error()).toBe(jsError);
      expect(sig.error()?.message).toBe('Standard JS error');
    });
  });
});
