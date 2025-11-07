declare module '@signaltree/core' {
  export { signalTree } from '../../../core/src/lib/signal-tree';
  export type {
    SignalTree,
    TreeConfig,
    TreeNode,
    Enhancer,
    Middleware
  } from '../../../core/src/lib/types';
  export * from '../../../core/src/index';
}
