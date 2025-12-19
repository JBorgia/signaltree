import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { entityMap, signalTree, withEntities } from '@signaltree/core';

import type { EntityMapMarker } from '@signaltree/core';

/**
 * Effect Reactivity Test Component
 *
 * This component verifies that SignalTree signals properly trigger Angular's effect() re-runs.
 * It replicates the pattern used in the v3 trax-mobile app.
 *
 * VERIFIED BEHAVIOR (when installed via npm):
 * - Regular Angular signals: Effects RE-RUN ✅
 * - SignalTree signals: Effects RE-RUN ✅
 *
 * NOTE: When using pnpm link for local development, you may encounter a "dual Angular
 * instance" issue where SignalTree's signals are created with a different @angular/core
 * than the consuming app. This causes Angular's isSignal() to return false for SignalTree
 * signals, breaking effect() reactivity. The solution is to:
 *   1. Install from npm (recommended)
 *   2. Match Angular versions between workspaces
 *   3. Use pnpm overrides to force resolution
 *
 * See: /signaltree/docs/LOCAL_DEVELOPMENT_SYMLINK_ISSUE.md for details.
 */

interface Hauler {
  id: number;
  name: string;
}

interface Truck {
  id: number;
  haulerId: number;
  name: string;
}

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

interface TestState {
  loading: {
    state: LoadingState;
    error: string | null;
  };
  haulers: EntityMapMarker<Hauler, number>;
  trucks: EntityMapMarker<Truck, number>;
  selectedHaulerId: number | null;
}

@Component({
  selector: 'app-effect-reactivity-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './effect-reactivity-test.component.html',
  styleUrls: ['./effect-reactivity-test.component.scss'],
})
export class EffectReactivityTestComponent {
  // ============================================================================
  // TEST SETUP: Mimic v3 trax-mobile TruckStore pattern
  // ============================================================================

  // SignalTree store (same pattern as v3)
  private store = signalTree<TestState>({
    loading: {
      state: 'idle',
      error: null,
    },
    haulers: entityMap<Hauler, number>({ selectId: (h) => h.id }),
    trucks: entityMap<Truck, number>({ selectId: (t) => t.id }),
    selectedHaulerId: null,
  }).with(withEntities());

  // Regular Angular signal for comparison
  private regularSignal = signal<LoadingState>('idle');

  // ============================================================================
  // EFFECT TRACKING: Log when effects run
  // ============================================================================

  // Track effect runs
  effectLog: string[] = [];
  regularEffectCount = 0;
  signalTreeEffectCount = 0;
  entityEffectCount = 0;

  // Expose signals for template
  loadingState = computed(() => this.store.$.loading.state());
  regularLoadingState = computed(() => this.regularSignal());
  haulerCount = computed(() => this.store.$.haulers.count());
  haulers = computed(() => this.store.$.haulers.all());

  constructor() {
    // ============================================================================
    // EFFECT 1: Regular Angular signal (SHOULD work)
    // ============================================================================
    effect(() => {
      const state = this.regularSignal();
      this.regularEffectCount++;
      const msg = `[${new Date().toISOString()}] Regular signal effect #${
        this.regularEffectCount
      }: ${state}`;
      console.log(msg);
      this.effectLog = [...this.effectLog, msg];
    });

    // ============================================================================
    // EFFECT 2: SignalTree nested primitive signal (should work with npm install)
    // ============================================================================
    effect(() => {
      const state = this.store.$.loading.state();
      this.signalTreeEffectCount++;
      const msg = `[${new Date().toISOString()}] SignalTree $.loading.state effect #${
        this.signalTreeEffectCount
      }: ${state}`;
      console.log(msg);
      this.effectLog = [...this.effectLog, msg];
    });

    // ============================================================================
    // EFFECT 3: SignalTree entity count signal (should work with npm install)
    // ============================================================================
    effect(() => {
      const count = this.store.$.haulers.count();
      this.entityEffectCount++;
      const msg = `[${new Date().toISOString()}] SignalTree $.haulers.count() effect #${
        this.entityEffectCount
      }: ${count}`;
      console.log(msg);
      this.effectLog = [...this.effectLog, msg];
    });
  }

  // ============================================================================
  // TEST ACTIONS
  // ============================================================================

  /**
   * Update regular Angular signal - Effect SHOULD re-run
   */
  updateRegularSignal() {
    const current = this.regularSignal();
    const next: LoadingState =
      current === 'idle'
        ? 'loading'
        : current === 'loading'
        ? 'loaded'
        : 'idle';
    console.log(`\n>>> UPDATING regular signal: ${current} -> ${next}`);
    this.regularSignal.set(next);
  }

  /**
   * Update SignalTree nested primitive - Effect should re-run
   */
  updateSignalTreeState() {
    const current = this.store.$.loading.state();
    const next: LoadingState =
      current === 'idle'
        ? 'loading'
        : current === 'loading'
        ? 'loaded'
        : 'idle';
    console.log(
      `\n>>> UPDATING SignalTree $.loading.state: ${current} -> ${next}`
    );
    this.store.$.loading.state.set(next);
    console.log(
      `>>> After set, $.loading.state() = ${this.store.$.loading.state()}`
    );
  }

  /**
   * Add entity to SignalTree - Effect should re-run
   */
  addHauler() {
    const id = Date.now();
    const hauler: Hauler = { id, name: `Hauler ${id}` };
    console.log(`\n>>> ADDING hauler:`, hauler);
    this.store.$.haulers.addOne(hauler);
    console.log(
      `>>> After add, $.haulers.count() = ${this.store.$.haulers.count()}`
    );
  }

  /**
   * Clear all haulers - Effect should re-run
   */
  clearHaulers() {
    console.log(`\n>>> CLEARING all haulers`);
    this.store.$.haulers.clear();
    console.log(
      `>>> After clear, $.haulers.count() = ${this.store.$.haulers.count()}`
    );
  }

  /**
   * Clear the effect log
   */
  clearLog() {
    this.effectLog = [];
    this.regularEffectCount = 0;
    this.signalTreeEffectCount = 0;
    this.entityEffectCount = 0;
    console.clear();
  }

  /**
   * Simulate the v3 data loading pattern
   */
  async simulateDataLoad() {
    console.log('\n>>> SIMULATING DATA LOAD (v3 pattern)');

    // Step 1: Set loading state
    console.log('Step 1: Setting loading state to "loading"');
    this.store.$.loading.state.set('loading');

    // Step 2: Wait for "API response"
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 3: Add entities
    console.log('Step 2: Adding haulers');
    this.store.$.haulers.setAll([
      { id: 1, name: 'Hauler A' },
      { id: 2, name: 'Hauler B' },
      { id: 3, name: 'Hauler C' },
    ]);

    // Step 4: Set loaded state
    console.log('Step 3: Setting loading state to "loaded"');
    this.store.$.loading.state.set('loaded');

    console.log('>>> DATA LOAD COMPLETE');
    console.log(
      `>>> Final state: loading=${this.store.$.loading.state()}, haulerCount=${this.store.$.haulers.count()}`
    );
  }
}
