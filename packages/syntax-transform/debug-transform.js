// Quick test script to debug the transform
const { transformCode } = require('./src/lib/ast-transform.ts');

try {
  const result = transformCode("tree.$.user.name('John');", {
    rootIdentifiers: ['tree'],
  });
  console.log('Transform result:', result);
  console.log('Generated code:', result.code);
} catch (error) {
  console.error('Transform error:', error);
}
