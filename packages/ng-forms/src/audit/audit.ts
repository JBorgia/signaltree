/**
 * Audit tracking — MOVED to `@signaltree/core` in v13 (RFC 0007).
 *
 * The audit tracker is framework-agnostic (it depends only on `getChanges` and
 * the core tree type, never on `@angular/forms`), so it now lives in core as a
 * within-tree mechanic. These re-exports are a back-compat shim.
 *
 * @deprecated Since v13. Import from `@signaltree/core` instead:
 * `import { createAuditTracker, createAuditCallback } from '@signaltree/core'`.
 * This shim will be removed in a future major.
 *
 * @packageDocumentation
 */

export {
  createAuditTracker,
  createAuditCallback,
  type AuditEntry,
  type AuditMetadata,
  type AuditTrackerConfig,
} from '@signaltree/core';
