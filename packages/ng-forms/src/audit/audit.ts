import { getChanges } from '@signaltree/shared';

import type { Middleware } from '@signaltree/core';
/**
 * Audit log entry recording form changes
 */
export interface AuditEntry<T = unknown> {
  /** Timestamp when change occurred */
  timestamp: number;
  /** Changed fields and their new values */
  changes: Partial<T>;
  /** Optional metadata about the change */
  metadata?: {
    /** User ID who made the change */
    userId?: string;
    /** Source of the change (e.g., 'ui', 'api', 'import') */
    source?: string;
    /** Human-readable description */
    description?: string;
  };
}

/**
 * Creates an audit middleware for form change tracking.
 * Automatically logs all form state changes with timestamps and optional metadata.
 *
 * @param auditLog - Array to collect audit entries
 * @param getMetadata - Optional function to provide metadata for each change
 * @returns Middleware that records form changes
 *
 * @example
 * ```typescript
 * const auditLog: AuditEntry<MyFormData>[] = [];
 *
 * const form = createFormTree(
 *   { name: '', email: '' },
 *   {
 *     middleware: [
 *       createAuditMiddleware(auditLog, () => ({
 *         userId: currentUser.id,
 *         source: 'form-editor'
 *       }))
 *     ]
 *   }
 * );
 *
 * form.$.name.set('John');
 *
 * console.log(auditLog);
 * // [{
 * //   timestamp: 1234567890,
 * //   changes: { name: 'John' },
 * //   metadata: { userId: '123', source: 'form-editor' }
 * // }]
 * ```
 */
export function createAuditMiddleware<T>(
  auditLog: AuditEntry<T>[],
  getMetadata?: () => AuditEntry<T>['metadata']
): Middleware<T> {
  return {
    id: 'audit',
    after: (_action: string, _payload: unknown, oldState: T, newState: T) => {
      const changes = getChanges(oldState, newState);
      if (Object.keys(changes).length > 0) {
        auditLog.push({
          timestamp: Date.now(),
          changes,
          metadata: getMetadata?.(),
        });
      }
    },
  };
}
