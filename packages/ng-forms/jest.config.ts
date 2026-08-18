export default {
  displayName: 'ng-forms',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/packages/ng-forms',
  // Without these, `nx test ng-forms --coverage` printed NOTHING — jest needs to
  // be told what to instrument and how to report. Every other package reported a
  // number; this one reported silence, and a number nobody can see is a number
  // nobody defends.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/test-setup.ts',
    '!src/index.ts',
  ],
  coverageReporters: ['text-summary', 'text', 'json'],
  moduleNameMapper: {
    '^@signaltree/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@signaltree/shared$': '<rootDir>/../../packages/shared/src/index.ts',
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
