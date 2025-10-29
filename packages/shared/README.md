# @signaltree/shared

Internal utility primitives shared across SignalTree packages.

- `deepEqual` – structural equality used by the core update engine
- `isBuiltInObject` – guards against traversing browser/Node built-ins
- `LRUCache` – lightweight cache used by path parsing and future tooling
- `parsePath` – cached dot-path splitter reused by batching and forms

## Scripts

- `nx build shared` – compile the utilities
- `nx test shared` – run unit tests for the shared helpers
