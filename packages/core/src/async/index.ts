// Core async enhancer re-export shim - instructs users to install @signaltree/async
export function withAsync(): never {
  throw new Error(
    'withAsync() moved to @signaltree/async. Install that package and import from there.'
  );
}
