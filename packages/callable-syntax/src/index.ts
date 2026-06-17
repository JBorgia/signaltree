// The `.` entry is RUNTIME-SAFE: it exposes only the (type-only) augmentation,
// so `import '@signaltree/callable-syntax'` adds zero runtime bytes.
//
// The build-time AST transform + Vite/Webpack plugins (which depend on @babel,
// ~196KB) are NOT re-exported here — importing the `.` entry in app code used
// to drag @babel into the application bundle. Use the documented build-config
// subpaths instead:
//   - '@signaltree/callable-syntax/vite'         (Vite plugin)
//   - '@signaltree/callable-syntax/webpack'      (Webpack plugin)
//   - '@signaltree/callable-syntax/augmentation' (explicit type augmentation)
export * from './augmentation';

// Build-time transform API — re-export TYPES only (erased at compile time, no
// runtime/@babel cost). The runtime `transformCode` lives at the plugin subpaths.
export type { TransformOptions, TransformResult } from './lib/ast-transform';
