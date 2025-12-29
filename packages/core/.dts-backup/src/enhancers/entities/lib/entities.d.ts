import type {
  EntitySignal,
  SignalTree,
  EntityAwareTreeNode,
} from '../../../lib/types';
interface EntitiesEnhancerConfig {
  enabled?: boolean;
}
export declare function withEntities(config?: EntitiesEnhancerConfig): <T>(
  tree: SignalTree<T>
) => Omit<SignalTree<T>, 'state' | '$'> & {
  state: EntityAwareTreeNode<T>;
  $: EntityAwareTreeNode<T>;
};
export declare function enableEntities(): <T>(tree: SignalTree<T>) => Omit<
  SignalTree<T>,
  'state' | '$'
> & {
  state: EntityAwareTreeNode<T>;
  $: EntityAwareTreeNode<T>;
};
export declare function withHighPerformanceEntities(): <T>(
  tree: SignalTree<T>
) => Omit<SignalTree<T>, 'state' | '$'> & {
  state: EntityAwareTreeNode<T>;
  $: EntityAwareTreeNode<T>;
};
export {};
