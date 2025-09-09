import generate from '@babel/generator';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export interface TransformOptions {
  /** Root variable names that contain SignalTree instances (default: ['tree']) */
  readonly rootIdentifiers?: string[];
  /** Enable debug logging for transformed calls */
  readonly debug?: boolean;
}

export interface TransformResult {
  /** The transformed code */
  code: string;
  /** Number of calls that were transformed */
  transformed: number;
}

const DEFAULT_ROOT_IDENTIFIERS = ['tree'];

/**
 * Transforms SignalTree callable syntax to explicit .set/.update method calls
 *
 * @example
 * ```typescript
 * // Input:
 * tree.$.user.name('John');
 * tree.$.count(n => n + 1);
 *
 * // Output:
 * tree.$.user.name.set('John');
 * tree.$.count.update(n => n + 1);
 * ```
 */
export function transformCode(
  source: string,
  options: TransformOptions = {}
): TransformResult {
  const rootIds = options.rootIdentifiers?.length
    ? options.rootIdentifiers
    : DEFAULT_ROOT_IDENTIFIERS;
  const ast = parseSourceCode(source);
  let transformCount = 0;

  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      if (!t.isCallExpression(node)) return;

      if (shouldTransformCallExpression(node, rootIds)) {
        const transformedCall = createTransformedCall(node);
        path.replaceWith(transformedCall);
        transformCount++;
      }
    },
  });

  const output = generate(ast, { retainLines: false, comments: true }, source);

  if (options.debug && transformCount > 0) {
    console.log(
      `[signaltree callable-syntax] transformed ${transformCount} calls`
    );
  }

  return { code: output.code, transformed: transformCount };
}

/**
 * Parses TypeScript/JSX source code into an AST
 */
function parseSourceCode(source: string): t.File {
  return parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
}

/**
 * Determines if a call expression should be transformed
 */
function shouldTransformCallExpression(
  node: t.CallExpression,
  rootIds: string[]
): boolean {
  // Must be a member expression call (e.g., obj.prop())
  if (!t.isMemberExpression(node.callee)) return false;

  // Skip getter calls (no arguments)
  if (node.arguments.length === 0) return false;

  // Skip if already calling .set or .update
  if (isAlreadyTransformed(node.callee)) return false;

  // Must be accessing a signal from one of the root identifiers
  return isRootedSignalAccess(node.callee, rootIds);
}

/**
 * Checks if the call is already transformed (.set or .update)
 */
function isAlreadyTransformed(callee: t.MemberExpression): boolean {
  return (
    t.isIdentifier(callee.property) &&
    (callee.property.name === 'set' || callee.property.name === 'update')
  );
}

/**
 * Creates the transformed call expression with .set or .update
 */
function createTransformedCall(node: t.CallExpression): t.CallExpression {
  const callee = node.callee as t.MemberExpression;
  const method = determineMethod(node.arguments[0]);

  return t.callExpression(
    t.memberExpression(callee, t.identifier(method)),
    node.arguments as t.Expression[]
  );
}

/**
 * Determines whether to use 'set' or 'update' based on the argument type
 */
function determineMethod(
  firstArg:
    | t.Expression
    | t.SpreadElement
    | t.JSXNamespacedName
    | t.ArgumentPlaceholder
): 'set' | 'update' {
  if (
    t.isFunctionExpression(firstArg) ||
    t.isArrowFunctionExpression(firstArg)
  ) {
    return 'update';
  }
  return 'set';
}

/**
 * Checks if the member expression ultimately accesses a signal from a root identifier
 */
function isRootedSignalAccess(
  expr: t.MemberExpression,
  roots: string[]
): boolean {
  let current: t.MemberExpression | t.Expression = expr;

  // Traverse up the member expression chain to find the root identifier
  while (t.isMemberExpression(current)) {
    if (t.isIdentifier(current.object)) {
      return roots.includes(current.object.name);
    }
    current = current.object as t.Expression;
  }

  return false;
}
