// Entry point for experimental vanilla engine subpath export
// Re-export the vanilla engine and neutral signals via the package public barrel
// to satisfy NX module boundary rules (avoid relative project imports).
export { vanillaEngine } from '@signaltree/core';
export * from '@signaltree/core/vanilla';
