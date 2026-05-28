import { isSignal } from '@angular/core';

import type { SchemaEntry, PatternSegment, Registry } from './state';
import { WILDCARD, addBoundPath } from './state';

/**
 * Compile a dotted pattern string into matcher segments.
 *
 * @example compilePattern('user.email') === ['user', 'email']
 * @example compilePattern('users.*.email') === ['users', WILDCARD, 'email']
 */
export function compilePattern(pattern: string): PatternSegment[] {
  return pattern.split('.').map((seg) => (seg === '*' ? WILDCARD : seg));
}

/**
 * Score how well a pattern matches a leaf path. Returns -1 if it doesn't match.
 *
 * Specificity rules:
 *   - A non-match returns -1.
 *   - For equal-length patterns, count literal (non-wildcard) segment matches.
 *     Specific schemas (`users.42.email`) outscore wildcard (`users.*.email`).
 *   - Ancestor schemas (shorter than `segs`) always score lower than
 *     equal-length matches — implemented by multiplying same-length scores by
 *     a large factor and using literal-count as a secondary key for ancestors.
 *
 * @internal
 */
export function matchSpecificity(
  pattern: ReadonlyArray<PatternSegment>,
  segs: ReadonlyArray<string>
): number {
  // Length check: pattern must be ≤ leaf length (it's either exact or prefix).
  if (pattern.length > segs.length) return -1;

  let literalCount = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ps = pattern[i];
    if (ps === WILDCARD) continue;
    if (ps !== segs[i]) return -1;
    literalCount++;
  }

  // Boost exact-length matches above ancestor (shorter-than-leaf) matches.
  const exactLength = pattern.length === segs.length;
  return literalCount * 2 + (exactLength ? 10_000 : 0);
}

/**
 * Returns true iff `pattern` matches `segs` as a strict prefix (length < segs).
 */
function isStrictPrefixMatch(
  pattern: ReadonlyArray<PatternSegment>,
  segs: ReadonlyArray<string>
): boolean {
  if (pattern.length >= segs.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const ps = pattern[i];
    if (ps === WILDCARD) continue;
    if (ps !== segs[i]) return false;
  }
  return true;
}

/**
 * Lazy match-on-write (D7). For a given leaf path, find the owning schema
 * entry per D4 precedence — specific > wildcard > ancestor. Caches the
 * winner in `registry.leafOwner` and registers the path in `boundPaths`.
 *
 * Returns `undefined` if no entry matches.
 */
export function matchLeaf(
  registry: Registry,
  leafPath: string
): SchemaEntry | undefined {
  const cached = registry.leafOwner.get(leafPath);
  if (cached) return cached;

  const segs = leafPath.split('.');
  let best: SchemaEntry | undefined;
  let bestScore = -1;

  for (const entry of registry.entries) {
    const score = matchSpecificity(entry.segments, segs);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  if (best) {
    registry.leafOwner.set(leafPath, best);
    addBoundPath(registry, leafPath);
  }
  return best;
}

/**
 * Yield each ancestor entry whose pattern is a strict prefix of `leafPath`'s
 * segments, in declaration order. Returns the entry + the concrete ancestor
 * path (the prefix of `leafPath` that aligns with the pattern's length).
 *
 * Example: pattern `user` matching write at `user.email` yields
 *   `{ entry: <user schema>, ancestorPath: 'user' }`.
 *
 * @internal
 */
export function matchAncestors(
  registry: Registry,
  leafPath: string
): Array<{ entry: SchemaEntry; ancestorPath: string }> {
  const segs = leafPath.split('.');
  const matches: Array<{ entry: SchemaEntry; ancestorPath: string }> = [];

  for (const entry of registry.entries) {
    if (!isStrictPrefixMatch(entry.segments, segs)) continue;
    const ancestorPath = segs.slice(0, entry.segments.length).join('.');
    matches.push({ entry, ancestorPath });
  }

  return matches;
}

/**
 * Walk a tree-root and yield every leaf path under `rootPath`. Used by
 * ancestor schema runs to enumerate the leaves they own at dispatch time.
 *
 * Leaf detection: a value is a leaf if it isn't a plain object, or it's a
 * built-in (Date/Map/Set) or array, or it's empty.
 *
 * @internal
 */
export function enumerateLeafPaths(
  value: unknown,
  rootPath: string
): string[] {
  const out: string[] = [];
  walk(value, rootPath, out);
  return out;
}

function walk(value: unknown, prefix: string, out: string[]): void {
  if (value === null || value === undefined) {
    out.push(prefix);
    return;
  }
  if (typeof value !== 'object') {
    out.push(prefix);
    return;
  }
  if (Array.isArray(value) || value instanceof Date || value instanceof Map || value instanceof Set) {
    // Treat arrays/built-ins as leaves under this rootPath.
    out.push(prefix);
    return;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) {
    out.push(prefix);
    return;
  }
  for (const k of keys) {
    const child = (value as Record<string, unknown>)[k];
    walk(child, prefix ? `${prefix}.${k}` : k, out);
  }
}

/**
 * True iff `value` is an Angular signal AND has `.set`/`.update` methods.
 *
 * Tightened in v9.3 to use Angular's `isSignal()` brand check first — this
 * rules out SignalTree's NodeAccessors (which are callable but aren't
 * Angular signals) and user-state shaped like `{ set: fn, update: fn }`
 * (which structurally matches the old check but isn't a signal).
 *
 * Entity collections are also writable signals but with `.add`/`.remove`;
 * we still treat them as leaves for snapshot purposes (their internal state
 * is opaque to validation).
 *
 * @internal
 */
function isLeafSignal(value: unknown): boolean {
  if (typeof value !== 'function') return false;
  if (!isSignal(value)) return false;
  const v = value as { set?: unknown; update?: unknown };
  return typeof v.set === 'function' && typeof v.update === 'function';
}

/**
 * Take a plain-data snapshot of a tree node (NodeAccessor or sub-accessor)
 * by walking its enumerable keys and unwrapping signal leaves.
 *
 * Mirrors `@signaltree/core`'s internal `snapshotState` without taking a
 * dependency on that non-public symbol.
 *
 * @internal
 */
export function snapshotTreeNode(node: unknown): unknown {
  if (node === null || node === undefined) return node;

  // Leaf signal: call to unwrap.
  if (isLeafSignal(node)) {
    try { return (node as () => unknown)(); } catch { return undefined; }
  }

  if (typeof node !== 'object' && typeof node !== 'function') return node;
  // Built-ins are leaves — return as-is.
  if (Array.isArray(node) || node instanceof Date || node instanceof Map || node instanceof Set) {
    return node;
  }

  const out: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = Object.keys(node as object);
  } catch {
    return node;
  }
  for (const key of keys) {
    const child = (node as Record<string, unknown>)[key];
    out[key] = snapshotTreeNode(child);
  }
  return out;
}

/**
 * Read a value out of `treeRoot` by dotted path. Returns `undefined` if any
 * segment is missing.
 *
 * For path == '': returns a full snapshot of `treeRoot`.
 * For a path that resolves to a leaf signal: returns the signal's unwrapped value.
 * For a path that resolves to a subtree: returns a plain-data snapshot of the subtree.
 *
 * @internal
 */
export function readTreeAtPath(
  treeRoot: unknown,
  path: string
): unknown {
  if (path === '') return snapshotTreeNode(treeRoot);

  const segs = path.split('.');
  let cur: unknown = treeRoot;
  for (const seg of segs) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object' && typeof cur !== 'function') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return snapshotTreeNode(cur);
}

/**
 * For an ancestor schema entry rooted at `ancestorPath`, walk the tree value
 * at that path and return every leaf path the schema owns under D4 precedence.
 *
 * A leaf is "owned" if `matchLeaf` for that leaf resolves back to this entry.
 * In other words, the ancestor only owns leaves that no more-specific schema
 * claims.
 *
 * @internal
 */
export function collectOwnedLeaves(
  registry: Registry,
  ancestorEntry: SchemaEntry,
  ancestorPath: string,
  ancestorValue: unknown
): string[] {
  const allLeaves = enumerateLeafPaths(ancestorValue, ancestorPath);
  const owned: string[] = [];
  for (const leaf of allLeaves) {
    const owner = matchLeaf(registry, leaf);
    if (owner === ancestorEntry) owned.push(leaf);
  }
  return owned;
}
