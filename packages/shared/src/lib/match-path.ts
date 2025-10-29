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
