/**
 * jscodeshift transform: remove console.* calls and simple inline console expressions
 * - Removes ExpressionStatements that are direct console.* calls
 * - Removes IfStatements whose consequent is a direct console.* call
 * - Keeps code semantics for other patterns; review dry-run before applying
 *
 * Usage (dry-run):
 * npx jscodeshift -t tools/codemods/remove-console.js apps/demo --extensions=ts,tsx,js,jsx --parser=tsx --dry
 */

module.exports = function transformer(fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  function isConsoleCall(node) {
    if (!node) return false;
    // match: console.log(...), console.error(...), console.warn(...), console.debug(...), console.table(...)
    return (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'console'
    );
  }

  // Remove top-level expression statements that are console calls
  root.find(j.ExpressionStatement).forEach((path) => {
    if (isConsoleCall(path.node.expression)) {
      j(path).remove();
    }
  });

  // Remove if (cond) console.log(...) or if (cond) { console.log(...); }
  root.find(j.IfStatement).forEach((path) => {
    const consequent = path.node.consequent;
    if (!consequent) return;
    // consequent is a block with single console call
    if (
      consequent.type === 'BlockStatement' &&
      consequent.body.length === 1 &&
      isConsoleCall(consequent.body[0].expression)
    ) {
      j(path).remove();
      return;
    }
    // consequent is a direct expression statement
    if (
      consequent.type === 'ExpressionStatement' &&
      isConsoleCall(consequent.expression)
    ) {
      j(path).remove();
    }
  });

  // Remove occurrences of `someCondition && console.log(...)` as ExpressionStatements
  root.find(j.LogicalExpression).forEach((path) => {
    const parent = path.parent.node;
    if (parent && parent.type === 'ExpressionStatement') {
      if (isConsoleCall(path.node.right)) {
        j(parent).remove();
      }
    }
  });

  // Neutralize page.on('console', ...) in E2E test files by commenting the line
  // We will replace the call with a comment node so it's obvious in dry-run.
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { name: 'on' },
      },
    })
    .forEach((path) => {
      const callee = path.node.callee;
      if (
        callee &&
        callee.object &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'page'
      ) {
        const args = path.node.arguments || [];
        if (
          args.length > 0 &&
          args[0].type === 'Literal' &&
          args[0].value === 'console'
        ) {
          // Replace the entire statement with an empty statement with a trailing comment
          const comment = j.commentLine(
            ' console handler removed by codemod (originally: page.on("console", ...))'
          );
          const empty = j.emptyStatement();
          empty.comments = [comment];
          j(path.parent).replaceWith(empty);
        }
      }
    });

  return root.toSource({ quote: 'single' });
};
