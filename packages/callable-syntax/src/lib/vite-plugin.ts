import { transformCode } from './ast-transform';

// Vite types are optional; fall back to minimal shape if not installed.
// Declare a lightweight Plugin interface to avoid hard dependency if types unavailable.
type Plugin = {
  name: string;
  enforce?: 'pre' | 'post';
  transform?: (code: string, id: string) => { code: string; map: null } | null;
};
export interface SignalTreeVitePluginOptions {
  include?: RegExp;
  exclude?: RegExp;
  rootIdentifiers?: string[];
  debug?: boolean;
}

export function signalTreeSyntaxTransform(
  options: SignalTreeVitePluginOptions = {}
): Plugin {
  const include = options.include ?? /src\/.*\.(t|j)sx?$/;
  const exclude = options.exclude ?? /node_modules|\.spec\.|\.test\./;

  return {
    name: 'signaltree-syntax-transform',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!include.test(id) || exclude.test(id)) return null;
      const result = transformCode(code, {
        rootIdentifiers: options.rootIdentifiers,
        debug: options.debug,
      });
      if (result.transformed === 0) return null;
      return { code: result.code, map: null };
    },
  };
}
