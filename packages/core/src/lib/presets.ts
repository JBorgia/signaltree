import { withBatching } from './enhancers/batching';
import { withDevTools } from './enhancers/devtools';
import { withEffects } from './enhancers/effects';
import { withEntities } from './enhancers/entities';
import { withMemoization } from './enhancers/memoization';
import { withTimeTravel } from './enhancers/time-travel';
import { signalTree } from './signal-tree';

import type { TreeConfig, SignalTree as SignalTreeV5 } from './types';

export type FullSignalTree<T> = SignalTreeV5<T>;
export type ProdSignalTree<T> = SignalTreeV5<T>;
export type MinimalSignalTree<T> = SignalTreeV5<T>;

export interface DevTreeConfig extends TreeConfig {
  effects?: Parameters<typeof withEffects>[0];
  batching?: Parameters<typeof withBatching>[0];
  memoization?: Parameters<typeof withMemoization>[0];
  timeTravel?: Parameters<typeof withTimeTravel>[0];
  devTools?: Parameters<typeof withDevTools>[0];
  entities?: Parameters<typeof withEntities>[0];
}

export interface ProdTreeConfig extends TreeConfig {
  effects?: Parameters<typeof withEffects>[0];
  batching?: Parameters<typeof withBatching>[0];
  memoization?: Parameters<typeof withMemoization>[0];
  entities?: Parameters<typeof withEntities>[0];
}

export interface MinimalTreeConfig extends TreeConfig {
  effects?: Parameters<typeof withEffects>[0];
}

export function createDevTree<T extends object>(
  initialState: T,
  config: DevTreeConfig = {}
): FullSignalTree<T> {
  return signalTree(initialState, config).with(
    withEffects(config.effects),
    withBatching(config.batching),
    withMemoization(config.memoization),
    withEntities(config.entities),
    withTimeTravel(config.timeTravel),
    withDevTools(config.devTools)
  ) as unknown as FullSignalTree<T>;
}

export function createProdTree<T extends object>(
  initialState: T,
  config: ProdTreeConfig = {}
): ProdSignalTree<T> {
  return signalTree(initialState, config).with(
    withEffects(config.effects),
    withBatching(config.batching),
    withMemoization(config.memoization),
    withEntities(config.entities)
  ) as unknown as ProdSignalTree<T>;
}

export function createMinimalTree<T extends object>(
  initialState: T,
  config: MinimalTreeConfig = {}
): MinimalSignalTree<T> {
  return signalTree(initialState, config).with(
    withEffects(config.effects)
  ) as unknown as MinimalSignalTree<T>;
}
