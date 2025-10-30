import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { dts } from 'rollup-plugin-dts';

const external = [
  '@angular/core',
  '@signaltree/shared',
  'rxjs',
  'rxjs/operators',
];

const plugins = [
  nodeResolve({
    preferBuiltins: false,
  }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.lib.json',
    declaration: true,
    declarationDir: './dist/types',
  }),
];

export default defineConfig([
  // Main entry point
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'esm',
        sourcemap: true,
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
      },
    ],
    external,
    plugins,
  },

  // Secondary entry points
  {
    input: 'src/enhancers/index.ts',
    output: {
      file: 'dist/enhancers/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/batching/index.ts',
    output: {
      file: 'dist/enhancers/batching/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/computed/index.ts',
    output: {
      file: 'dist/enhancers/computed/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/middleware/index.ts',
    output: {
      file: 'dist/enhancers/middleware/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/memoization/index.ts',
    output: {
      file: 'dist/enhancers/memoization/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/time-travel/index.ts',
    output: {
      file: 'dist/enhancers/time-travel/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/devtools/index.ts',
    output: {
      file: 'dist/enhancers/devtools/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/presets/index.ts',
    output: {
      file: 'dist/enhancers/presets/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/entities/index.ts',
    output: {
      file: 'dist/enhancers/entities/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },
  {
    input: 'src/enhancers/serialization/index.ts',
    output: {
      file: 'dist/enhancers/serialization/index.js',
      format: 'esm',
      sourcemap: true,
    },
    external,
    plugins,
  },

  // Type definitions
  {
    input: 'dist/types/packages/core/src/index.d.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/index.d.ts',
    output: {
      file: 'dist/enhancers/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/batching/index.d.ts',
    output: {
      file: 'dist/enhancers/batching/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/computed/index.d.ts',
    output: {
      file: 'dist/enhancers/computed/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/middleware/index.d.ts',
    output: {
      file: 'dist/enhancers/middleware/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/memoization/index.d.ts',
    output: {
      file: 'dist/enhancers/memoization/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/time-travel/index.d.ts',
    output: {
      file: 'dist/enhancers/time-travel/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/devtools/index.d.ts',
    output: {
      file: 'dist/enhancers/devtools/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/presets/index.d.ts',
    output: {
      file: 'dist/enhancers/presets/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/entities/index.d.ts',
    output: {
      file: 'dist/enhancers/entities/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
  {
    input: 'dist/types/packages/core/src/enhancers/serialization/index.d.ts',
    output: {
      file: 'dist/enhancers/serialization/index.d.ts',
      format: 'esm',
    },
    plugins: [dts()],
  },
]);
