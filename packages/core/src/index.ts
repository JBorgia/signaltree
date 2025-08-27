export * from './lib/signal-tree';
export * from './lib/types';
// Internal utilities, scheduler, and devtools removed from public barrel to trim surface
// Re-export adapter layer so downstream packages don't import '@angular/core' directly
export * from './lib/adapter';
// Expose the experimental vanilla engine via the public barrel so subpath imports
// can use the package scope instead of relative project paths.
export { vanillaEngine } from './lib/vanilla-engine';
