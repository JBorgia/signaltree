import type { Config } from 'jest';

const config: Config = {
  displayName: 'signaltree',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/signaltree',
  transform: {
    '^.+\\.(ts|mjs|js|html)': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)',
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|lodash-es))'],
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
  },
};

export default config;
