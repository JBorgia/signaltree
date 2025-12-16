/* eslint-disable */
export default {
  displayName: 'ng-forms',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/packages/ng-forms',
  moduleNameMapper: {
    '^@signaltree/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@signaltree/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@signaltree/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@signaltree/utils$': '<rootDir>/../../packages/utils/src/index.ts',
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
