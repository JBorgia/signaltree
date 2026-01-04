import path from 'path';

const corePath = path.resolve('./dist/packages/core/dist/index.js');
const { signalTree, entities, devTools } = await import(`file://${corePath}`);

console.log('signalTree available:', typeof signalTree);
const base = signalTree({ a: 1 });
console.log('base.with:', typeof base.with);
const withEntities = base.with(entities());
console.log('withEntities.with:', typeof withEntities.with);
const withDev = withEntities.with(devTools({ treeName: 'smoke' }));
console.log('withDev.with:', typeof withDev.with);

// Extra check: call the tree to ensure callable behavior
console.log('base():', base());
console.log('withDev():', withDev());
