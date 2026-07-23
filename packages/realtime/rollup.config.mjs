import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const baseConfig = createLibraryRollupConfig({
  packageRoot,
});

export default (config, options = {}) => {
  const result = baseConfig(config, options);

  // ROOT CAUSE FIX (2026-07-23): @nx/rollup keys the input map by entry
  // BASENAME, so the additionalEntryPoint `src/supabase/index.ts` and the
  // main `src/index.ts` both key as "index" — and the supabase entry
  // silently OVERWROTE the main barrel, which therefore never built at all.
  // A former "barrel-index-plugin" here papered over that by fabricating
  // dist/index.js from a hardcoded (and by now stale) export list, silently
  // resurrecting removed APIs. Deleted; instead, key the entries uniquely so
  // both actually build.
  result.input = {
    index: path.join(packageRoot, 'src/index.ts'),
    'supabase/index': path.join(packageRoot, 'src/supabase/index.ts'),
  };
  result.preserveEntrySignatures = 'exports-only';

  return result;
};
