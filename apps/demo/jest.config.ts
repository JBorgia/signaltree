export default {
  displayName: 'demo',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/apps/demo',
  testPathIgnorePatterns: ['demo-e2e'],
  moduleNameMapper: {
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
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$)'],
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment',
  ],
};
