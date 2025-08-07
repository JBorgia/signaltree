import type { Config } from 'jest';

const config: Config = {
  displayName: 'signal-tree',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  coverageDirectory: '../../coverage/signal-tree',
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
