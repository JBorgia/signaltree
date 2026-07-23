import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

// NOTE (2026-07-23): this config used to carry a "barrel-index-plugin" that
// fabricated dist/index.js from a hardcoded export list whenever the real
// barrel was missing. The barrel was missing because @nx/rollup keyed the
// input map by basename, so `src/signals/index.ts` overwrote `src/index.ts`
// — the fabricated stub then shipped WITHOUT barrel-level exports like
// `ngFormValidators` (declared in the .d.ts but undefined at runtime). The
// shared helper now re-keys entries by src-relative path, so the real barrel
// always builds; the fabrication hack is gone.
export default createLibraryRollupConfig({
  packageRoot,
});
