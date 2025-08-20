export * from './lib/signal-tree';
export * from './lib/types';
// Internal utilities, scheduler, and devtools removed from public barrel to trim surface
// Re-export adapter layer so downstream packages don't import '@angular/core' directly
export * from './lib/adapter';
