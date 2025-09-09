// Fallback declarations for Babel modules in case @types packages are missing.
// These are minimal and only to satisfy TypeScript when types cannot be resolved.
// They will be ignored if proper @types are installed.

declare module '@babel/generator' {
  import type { Node } from '@babel/types';
  interface GeneratorOptions {
    retainLines?: boolean;
    comments?: boolean;
  }
  interface GeneratorResult {
    code: string;
    map?: unknown;
  }
  export default function generate(
    ast: Node,
    options?: GeneratorOptions,
    code?: string
  ): GeneratorResult;
}

declare module '@babel/traverse' {
  import type { Node } from '@babel/types';
  export interface NodePath<T = Node> {
    node: T;
    replaceWith(node: Node): void;
  }
  export type VisitorFn<T = Node> = (path: NodePath<T>) => void;
  export type Visitor = Record<string, VisitorFn>;
  export default function traverse(ast: Node, options: Visitor): void;
}
