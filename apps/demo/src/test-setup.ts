import { deserialize, serialize } from 'node:v8';

import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// jsdom does not implement `structuredClone`, and jest's jsdom environment builds
// a fresh global context so Node's own copy isn't reachable either. Every browser
// SignalTree supports has it, so code is right to use it — `createAuditTracker`
// snapshots state with it, and without this the audit-tracking demo specs died
// with `ReferenceError: structuredClone is not defined`.
//
// v8.serialize/deserialize IS the structured-clone algorithm, so this keeps Dates,
// Maps, Sets, and cycles intact. A JSON round-trip would silently flatten them and
// make the polyfill itself a source of wrong test results.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (<T>(value: T): T =>
    deserialize(serialize(value)) as T) as typeof globalThis.structuredClone;
}

setupZoneTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

// Mock canvas and WebGL for environment detection
const mockCanvas = {
  getContext: jest.fn(),
  width: 800,
  height: 600,
};

Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
  value: mockCanvas.getContext,
});

// Mock WebGL context methods
const mockWebGLContext = {
  getExtension: jest.fn((name: string) => {
    if (name === 'WEBGL_debug_renderer_info') {
      return {
        UNMASKED_VENDOR_WEBGL: 0x9245,
        UNMASKED_RENDERER_WEBGL: 0x9246,
      };
    }
    return null;
  }),
  getParameter: jest.fn((param: number) => {
    switch (param) {
      case 0x9245:
        return 'Mock Vendor'; // UNMASKED_VENDOR_WEBGL
      case 0x9246:
        return 'NVIDIA GeForce GTX 1080'; // UNMASKED_RENDERER_WEBGL - not Intel for testing
      default:
        return null;
    }
  }),
};

mockCanvas.getContext.mockImplementation((contextType: string) => {
  if (contextType === 'webgl' || contextType === 'webgl2') {
    return mockWebGLContext;
  }
  return null;
});
