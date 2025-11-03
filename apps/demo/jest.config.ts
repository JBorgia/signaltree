export default {
  displayName: 'demo',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/demo',
  testPathIgnorePatterns: ['demo-e2e'],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    // Map enhancers root to its index.js
    '^@signaltree/core/enhancers$':
      '<rootDir>/../../packages/core/dist/enhancers/index.js',
    // Map enhancers/devtools to its own index.js for named exports
    '^@signaltree/core/enhancers/devtools$':
      '<rootDir>/../../packages/core/dist/enhancers/devtools/index.js',
    // Map any other enhancer submodule to its own index.js
    '^@signaltree/core/enhancers/(.*)$':
      '<rootDir>/../../packages/core/dist/enhancers/$1/index.js',
    '^@signaltree/(.*)$': '<rootDir>/../../packages/$1/dist/index.cjs',
    '^@signaltree/core$': '<rootDir>/../../packages/core/dist/index.cjs',
    '^@signaltree/core/(.*)$':
      '<rootDir>/../../packages/core/dist/$1/index.cjs',
  },
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@datorama|@ngrx|@ngxs|elf|@signaltree|.*\\.mjs$))',
  ],
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
