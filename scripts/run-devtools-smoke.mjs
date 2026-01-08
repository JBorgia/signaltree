import path from 'path';

const corePath = path.resolve('./dist/packages/core/dist/index.js');
const { signalTree, devTools, entityMap } = await import(`file://${corePath}`);

console.log('signalTree available:', typeof signalTree);
const base = signalTree({ users: entityMap() });
console.log('base.with:', typeof base.with);
const withDev = base.with(devTools({ treeName: 'smoke' }));
console.log('withDev.with:', typeof withDev.with);

// Extra check: call the tree to ensure callable behavior
console.log('base():', base());
console.log('withDev():', withDev());
