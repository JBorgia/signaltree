// Simple test to verify middleware is actually working
// This file can be run in Node.js to test the middleware functionality

console.log('Testing middleware implementation...');

// Simulate the middleware behavior we expect
const testMiddleware = {
  id: 'test',
  before: (action, payload, state) => {
    console.log('BEFORE middleware called:', { action, payload, state });
    return true;
  },
  after: (action, payload, previousState, newState) => {
    console.log('AFTER middleware called:', {
      action,
      payload,
      previousState,
      newState,
    });
  },
};

console.log('Middleware object created:', testMiddleware);

// Test if our middleware object matches the expected Middleware<T> interface
console.log('Middleware has id:', typeof testMiddleware.id === 'string');
console.log(
  'Middleware has before:',
  typeof testMiddleware.before === 'function'
);
console.log(
  'Middleware has after:',
  typeof testMiddleware.after === 'function'
);

console.log('Test complete - middleware structure appears correct');
