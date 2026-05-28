import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Translate a StandardSchema `Issue.path` into a dotted leaf path relative to
 * the schema's root path.
 *
 * `Issue.path` is `ReadonlyArray<PropertyKey | { key: PropertyKey }>`. Both
 * forms appear in the wild (Zod uses the bare-key form, Valibot uses the
 * object form).
 *
 * @internal
 */
export function issueToLeafPath(
  rootPath: string,
  issue: StandardSchemaV1.Issue
): string {
  const path = issue.path;
  if (!path || path.length === 0) return rootPath;

  const segs: string[] = [];
  for (const p of path) {
    if (typeof p === 'object' && p !== null && 'key' in p) {
      segs.push(String((p as { key: PropertyKey }).key));
    } else {
      segs.push(String(p));
    }
  }
  if (segs.length === 0) return rootPath;
  return rootPath ? `${rootPath}.${segs.join('.')}` : segs.join('.');
}

/**
 * Default issue formatter — surfaces `issue.message`.
 */
export function defaultFormatIssue(
  issue: StandardSchemaV1.Issue
): string {
  return issue.message;
}

/**
 * Reduce a StandardSchema validate result to a single string message for the
 * leaf path. v1 surfaces the first issue only (matching `form()` convention).
 *
 * Returns `null` if the result is valid.
 */
export function resultToMessage(
  result: StandardSchemaV1.Result<unknown>,
  path: string,
  formatIssue: (issue: StandardSchemaV1.Issue, path: string) => string
): string | null {
  if (!('issues' in result) || !result.issues || result.issues.length === 0) {
    return null;
  }
  return formatIssue(result.issues[0], path);
}
