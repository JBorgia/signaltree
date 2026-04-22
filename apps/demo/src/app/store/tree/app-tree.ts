import {
  batching,
  devTools,
  memoization,
  signalTree,
  WithDerived,
} from '@signaltree/core';

import { tier1Derived, tier2Derived, tier3Derived } from './derived';
import { postsState, uiState, usersState } from './state';

/**
 * Application Tree Assembly
 *
 * Mirrors the v3 trax-mobile canonical pattern:
 *   - State definitions live in `./state/*.state.ts`
 *   - Derived tiers live in `./derived/tier-*.derived.ts`
 *   - Operations live in `../ops/*.ops.ts`
 *   - The thin `AppStore` facade in `../app-store.ts` composes ops by domain.
 *
 * Each tier extends `$` with new computed signals; later tiers may reference
 * the computeds added by earlier tiers thanks to deep-merge in `.derived()`.
 */

export const STORE_NAME = 'DemoAppTree';

// ─── Type exports ───────────────────────────────────────────────────────────

/** Final tree type after every tier has been applied. */
export type AppTree = ReturnType<typeof createAppTree>;

/** Base tree type (before any derived tier) — used to type tier 1. */
export type AppTreeBase = ReturnType<
  typeof signalTree<ReturnType<typeof createBaseState>>
>;

/** Tree type after tier 1 (entity resolution) — used to type tier 2. */
export type AppTreeWithEntityResolution = WithDerived<
  AppTreeBase,
  typeof tier1Derived
>;

/** Tree type after tier 2 (filters/aggregates) — used to type tier 3. */
export type AppTreeWithFilters = WithDerived<
  AppTreeWithEntityResolution,
  typeof tier2Derived
>;

// ─── Base state factory ─────────────────────────────────────────────────────

function createBaseState() {
  return {
    users: usersState(),
    posts: postsState(),
    ui: uiState(),
  };
}

// ─── Tree creation ──────────────────────────────────────────────────────────

/**
 * Creates the demo application tree with all enhancers and derived tiers.
 *
 * @example
 * ```ts
 * const tree = createAppTree();
 *
 * // Read base state
 * tree.$.users.entities.all();
 *
 * // Read derived (tier 1)
 * tree.$.users.selected();
 *
 * // Read derived (tier 3)
 * tree.$.ui.totals();
 * ```
 */
export function createAppTree() {
  return signalTree(createBaseState())
    .with(devTools({ treeName: STORE_NAME }))
    .with(batching())
    .with(memoization())
    .derived(tier1Derived)
    .derived(tier2Derived)
    .derived(tier3Derived);
}
