import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

// NOTE (2026-07-23): a former "barrel-index-plugin" here would fabricate
// dist/index.js with `export * from './lib/vite-plugin.js'` etc. if the real
// barrel were ever missing — silently re-adding the @babel-heavy plugin
// exports the `.` entry deliberately does NOT expose (see src/index.ts). It
// never fired (this package has no entry-basename collision), but it was a
// loaded gun; removed. The `.` entry is type-only, so the built dist/index.js
// is legitimately (near-)empty.
export default createLibraryRollupConfig({
  packageRoot,
});
