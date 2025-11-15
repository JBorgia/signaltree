// Local type shim to make TS happy when importing '@signaltree/core'
// during workspace builds. Maps to core source types via path mapping.
declare module '@signaltree/core' {
  export type { Enhancer } from '@signaltree/core/src/lib/types';
}
