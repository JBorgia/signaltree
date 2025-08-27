// Export only the minimal core API from the main entry to keep bundle size small.
// Creator helpers remain available internally and for tests via relative imports,
// but are not part of the primary public bundle.
export { withMiddleware } from './lib/middleware';
