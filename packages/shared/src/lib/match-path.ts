/**
 * Matches a path pattern against an actual path.
 * Supports wildcard matching with '*' for any segment.
 *
 * @param pattern - The pattern to match (e.g., 'user.*.name')
 * @param path - The actual path to test (e.g., 'user.123.name')
 * @returns True if the path matches the pattern
 *
 * @example
 * ```typescript
 * matchPath('user.*.name', 'user.123.name') // true
 * matchPath('user.*.email', 'user.123.name') // false
 * matchPath('user', 'user') // true
 * ```
 */
export function matchPath(pattern: string, path: string): boolean {
  if (pattern === path) {
    return true;
  }

  const patternSegments = pattern.split('.');
  const pathSegments = path.split('.');

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  return patternSegments.every(
    (segment, index) => segment === '*' || segment === pathSegments[index]
  );
}

/**
 * True when `key` is a wildcard PATTERN rather than a literal path.
 *
 * Segment-based, matching {@link matchPath}: only a whole segment equal to `*`
 * is a wildcard. A substring test (`key.includes('*')`) is wrong — it also
 * catches a field genuinely named `weird*name`, which `matchPath` treats as a
 * literal that matches only itself.
 *
 * @example
 * isGlobKey('phones.*.value'); // true
 * isGlobKey('*');              // true
 * isGlobKey('weird*name');     // false — a literal field name
 */
export function isGlobKey(key: string): boolean {
  return key.split('.').includes('*');
}
