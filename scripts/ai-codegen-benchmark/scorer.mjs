/**
 * scorer.mjs — Static analysis scorers that augment the idiomatic-pattern
 * score with two cheaper, more diagnostic signals:
 *
 *   1. import-resolution: does every import from a non-relative module
 *      resolve to a real, published package?
 *   2. marker-method usage: when the file uses SignalTree markers, do the
 *      methods it calls actually exist on those markers' API surface?
 *
 * These are stand-ins for full compile + behavior testing. They are
 * inexpensive (no compiler invocation), deterministic, and target the
 * dominant failure mode observed in cold-run AI codegen: hallucinated
 * package names and hallucinated method names from neighboring libraries.
 */

// Packages that real Angular projects can legitimately import from.
// Anything else (e.g. `signal-tree`, `signaltree` unscoped, `@signaltree/data`)
// is a hallucination.
const VALID_PACKAGES = new Set([
  // SignalTree
  '@signaltree/core',
  '@signaltree/events',
  '@signaltree/ng-forms',
  '@signaltree/realtime',
  '@signaltree/callable-syntax',
  '@signaltree/enterprise',
  '@signaltree/guardrails',
  '@signaltree/schema',
  '@signaltree/shared',
  // Angular
  '@angular/core',
  '@angular/common',
  '@angular/common/http',
  '@angular/forms',
  '@angular/router',
  '@angular/animations',
  '@angular/platform-browser',
  '@angular/core/rxjs-interop',
  // RxJS
  'rxjs',
  'rxjs/operators',
  // NgRx
  '@ngrx/signals',
  '@ngrx/signals/entities',
  '@ngrx/signals/rxjs-interop',
  '@ngrx/store',
  '@ngrx/effects',
  '@ngrx/operators',
  '@ngrx/store-devtools',
  '@ngrx/component-store',
  '@ngrx/router-store',
  // Akita
  '@datorama/akita',
  '@datorama/akita-ng-router-store',
  '@datorama/akita-ngdevtools',
  // Elf
  '@ngneat/elf',
  '@ngneat/elf-entities',
  '@ngneat/elf-requests',
  '@ngneat/elf-devtools',
  '@ngneat/elf-pagination',
  // Standard browser/Node
  'zone.js',
]);

// Catalog of marker APIs. When a file uses a marker and calls a method on it,
// the method MUST appear in this catalog. Anything else is a hallucination.
const SIGNALTREE_MARKER_METHODS = {
  status: new Set([
    // Canonical (pre-v10.2)
    'setLoading', 'setLoaded', 'setError', 'setNotLoaded', 'reset',
    'state', 'error',
    'isLoading', 'isLoaded', 'isError', 'isNotLoaded',
    // v10.2 Promise-vocab aliases
    'start', 'setSuccess', 'succeed', 'fail',
  ]),
  entityMap: new Set([
    'all', 'byId', 'where', 'find', 'count', 'has', 'ids', 'size', 'isEmpty',
    'setAll', 'addOne', 'addMany', 'upsertOne', 'upsertMany',
    'removeOne', 'removeMany', 'removeWhere', 'clear',
    'updateOne', 'updateMany', 'updateWhere',
  ]),
  asyncSource: new Set([
    'data', 'loading', 'error', 'refresh', 'set', 'reset',
  ]),
  asyncQuery: new Set([
    'input', 'results', 'data', 'loading', 'error', 'rerun',
  ]),
  stored: new Set([
    'set', 'update', 'reset', 'clear',
  ]),
  form: new Set([
    'valid', 'invalid', 'dirty', 'pristine', 'touched', 'untouched',
    'errors', 'value', 'set', 'reset', 'patch',
  ]),
};

const IMPORT_RE = /import\s+(?:type\s+)?(?:\*\s+as\s+\w+|\{[^}]+\}|\w+)(?:\s*,\s*(?:\{[^}]+\}|\w+))?\s+from\s+['"]([^'"]+)['"]/g;

export function scoreImports(code) {
  const seen = [];
  let m;
  while ((m = IMPORT_RE.exec(code)) !== null) {
    const spec = m[1];
    if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) continue;
    // Strip subpath beyond the package — for scoped pkgs that's @scope/name + optional /sub,
    // for unscoped it's name + optional /sub. We just check membership of common forms.
    const valid =
      VALID_PACKAGES.has(spec) ||
      Array.from(VALID_PACKAGES).some((p) => spec === p || spec.startsWith(p + '/'));
    seen.push({ spec, valid });
  }
  if (seen.length === 0) return { score: null, total: 0, valid: 0, invalid: [] };
  const validCount = seen.filter((s) => s.valid).length;
  return {
    score: Math.round((validCount / seen.length) * 100),
    total: seen.length,
    valid: validCount,
    invalid: seen.filter((s) => !s.valid).map((s) => s.spec),
  };
}

const MARKER_DECL_RE =
  /\b(\w+)\s*:\s*(status|entityMap|asyncSource|asyncQuery|stored|form)\s*[<(]/g;

const METHOD_CALL_RE = /(?:\.\$\.|\$\.|\.)(\w+)\.(\w+)\s*\(/g;

export function scoreMarkerMethods(code, library) {
  if (library !== 'signaltree') {
    // Method-name validation is SignalTree-specific. For other libraries this
    // would need each library's own catalog. Skip rather than mis-score.
    return { score: null, applicable: false };
  }

  // Pass 1: collect declared markers — `users: entityMap<User, number>()` →
  // remember that the path key `users` is bound to the `entityMap` API surface.
  const declared = {};
  let dm;
  while ((dm = MARKER_DECL_RE.exec(code)) !== null) {
    declared[dm[1]] = dm[2];
  }
  if (Object.keys(declared).length === 0) {
    return { score: null, applicable: false, reason: 'no markers declared' };
  }

  // Pass 2: find `.<pathKey>.<method>(` calls. Validate that method exists on
  // the bound marker's API surface.
  const validCalls = [];
  const invalidCalls = [];
  let cm;
  while ((cm = METHOD_CALL_RE.exec(code)) !== null) {
    const pathKey = cm[1];
    const method = cm[2];
    if (!declared[pathKey]) continue; // not a marker path — skip
    const markerType = declared[pathKey];
    const surface = SIGNALTREE_MARKER_METHODS[markerType];
    if (!surface) continue;
    const call = { pathKey, method, markerType };
    if (surface.has(method)) {
      validCalls.push(call);
    } else {
      invalidCalls.push(call);
    }
  }

  const total = validCalls.length + invalidCalls.length;
  if (total === 0) {
    return { score: null, applicable: false, reason: 'no marker method calls' };
  }
  return {
    score: Math.round((validCalls.length / total) * 100),
    applicable: true,
    valid: validCalls.length,
    total,
    invalid: invalidCalls.map((c) => `${c.pathKey} (${c.markerType}).${c.method}()`),
  };
}

export function combinedScore({ idiomaticScore, importScore, methodScore }) {
  // Equal-weight average of available scores. Idiomatic always present;
  // imports always present (null when no imports — should rarely happen);
  // method only when SignalTree code with markers.
  const available = [idiomaticScore, importScore, methodScore].filter(
    (s) => typeof s === 'number',
  );
  if (available.length === 0) return null;
  return Math.round(available.reduce((a, b) => a + b, 0) / available.length);
}
