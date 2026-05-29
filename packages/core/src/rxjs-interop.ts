/**
 * @signaltree/core/rxjs-interop
 *
 * RxJS bridge for SignalTree: `rxMethod` for encapsulated async pipelines
 * with auto-cleanup, mirroring NgRx's rxMethod ergonomics.
 *
 * Use inside an Angular injection context. Subscriptions auto-clean on the
 * surrounding component or service's `DestroyRef`.
 */
export {
  rxMethod,
  type RxMethod,
  type RxMethodInput,
} from './lib/rxjs-interop';
