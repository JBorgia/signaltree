import { transformCode } from './ast-transform';

// Lightweight fallbacks so users without webpack types still compile.
interface CompilationLike {
  assets: Record<string, { source(): unknown; size(): number }>;
}
interface CompilerLike {
  hooks: {
    emit: {
      tapAsync(
        name: string,
        cb: (compilation: CompilationLike, done: (err?: Error) => void) => void
      ): void;
    };
  };
}

export interface SignalTreeWebpackPluginOptions {
  test?: RegExp;
  exclude?: RegExp;
  rootIdentifiers?: string[];
  debug?: boolean;
}

export class SignalTreeSyntaxWebpackPlugin {
  constructor(private readonly options: SignalTreeWebpackPluginOptions = {}) {}

  apply(compiler: CompilerLike) {
    const test = this.options.test ?? /src\/.*\.(t|j)sx?$/;
    const exclude = this.options.exclude ?? /node_modules|\.spec\.|\.test\./;

    compiler.hooks.emit.tapAsync(
      'SignalTreeSyntaxWebpackPlugin',
      (compilation: CompilationLike, cb: (err?: Error) => void) => {
        for (const filename of Object.keys(compilation.assets)) {
          if (!test.test(filename) || exclude.test(filename)) continue;
          const asset = compilation.assets[filename];
          const raw = asset.source();
          const source =
            typeof raw === 'string'
              ? raw
              : raw instanceof Buffer
              ? raw.toString('utf8')
              : String(raw);
          const { code, transformed } = transformCode(source, {
            rootIdentifiers: this.options.rootIdentifiers,
            debug: this.options.debug,
          });
          if (transformed > 0) {
            const updated = code;
            // Webpack 5 source compatibility minimal implementation
            compilation.assets[filename] = {
              source: () => updated,
              size: () => Buffer.byteLength(updated, 'utf8'),
            };
          }
        }
        cb();
      }
    );
  }
}
