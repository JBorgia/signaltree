import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

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
