/* eslint-disable */
export default {
  displayName: 'demo',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/demo',
  testPathIgnorePatterns: ['demo-e2e'],
  moduleNameMapper: {
    '^@signaltree/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@signaltree/core/(.*)$': '<rootDir>/../../packages/core/src/$1/index.ts',
    '^@signaltree/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@benchmark/(.*)$': '<rootDir>/src/app/services/benchmark/$1',
    '^@api/(.*)$': '<rootDir>/../../api/$1',
    '^@packages/(.*)$': '<rootDir>/../../packages/$1',
    '^@types/(.*)$': '<rootDir>/../../types/$1',
    '^(akita-benchmark-service|elf-benchmark-service|ngrx-benchmark-service|ngrx-signals-benchmark-service|ngxs-benchmark-service|signaltree-benchmark-service|realistic-benchmark-service)$':
      '<rootDir>/src/app/tests/__mocks__/$1.ts',
    '^\\.\\./services/realistic-benchmark\\.service$':
      '<rootDir>/src/app/tests/__mocks__/realistic-benchmark.service.ts',
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
    'node_modules/(?!(@ngrx|@ngxs|elf|@signaltree|.*\\.mjs$|@angular|@angular/.*))',
  ],
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
