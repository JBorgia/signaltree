/**
 * Shared types for the reusable example/playground toolkit (`st-example`).
 *
 * One standard for every demo: an intro, a projected live demo, an optional
 * live-state + emissions inspector, tabbed read-only source, and an optional
 * "Edit in StackBlitz" playground.
 */

/** Languages the code viewer can highlight (mapped to highlight.js grammars). */
export type CodeLang =
  | 'typescript'
  | 'javascript'
  | 'html'
  | 'scss'
  | 'css'
  | 'json'
  | 'bash';

/** One tab in the code viewer. */
export interface CodeFile {
  /** Tab label, e.g. `component.ts`. */
  label: string;
  language: CodeLang;
  source: string;
}

/**
 * Config for the "Edit in StackBlitz" button. `files` are merged over a base
 * standalone-Angular + `@signaltree/core` template provided by
 * {@link StackblitzService}; provide at least `src/app/app.component.ts`.
 */
export interface StackblitzConfig {
  title: string;
  description?: string;
  /** Project files keyed by path, merged over the base template. */
  files: Record<string, string>;
  /** File to focus when the sandbox opens. */
  openFile?: string;
  /** Extra npm dependencies beyond the base template. */
  dependencies?: Record<string, string>;
}

/** One recorded signal emission, shown in the emission log. */
export interface EmissionEntry {
  /** Source name, e.g. `count` or `posts.filtered`. */
  label: string;
  /** Stringified emitted value. */
  value: string;
  /** Monotonic sequence number — used for `track` and the pulse animation. */
  seq: number;
}
