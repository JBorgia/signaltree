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
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@benchmark/(.*)$': '<rootDir>/src/app/services/benchmark/$1',
    '^@api/(.*)$': '<rootDir>/../../api/$1',
    '^@packages/(.*)$': '<rootDir>/../../packages/$1',
    '^@types/(.*)$': '<rootDir>/../../types/$1',
    '^@datorama/akita$': '<rootDir>/__mocks__/akita.ts',
    '^(akita-benchmark-service|elf-benchmark-service|ngrx-benchmark-service|ngrx-signals-benchmark-service|ngxs-benchmark-service|signaltree-benchmark-service|realistic-benchmark-service|scenario-definitions)$':
      '<rootDir>/__mocks__/$1.ts',
  },
};

export default config;
