import { signal } from '@angular/core';
import { deepEqual } from './dist-core/dist/shared/lib/deep-equal.js';
const M = 2_000_000, S = 7;
const med = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
function bench(eq, vals) {
  const s = signal(vals[0], { equal: eq }); const t=[];
  for (let k=0;k<S;k++){const t0=performance.now();for(let i=0;i<M;i++)s.set(vals[i&1023]);t.push(performance.now()-t0);}
  return med(t)*1e6/M;
}
const show = (name, rows) => { const base = rows[0][1];
  console.log(`  ${name}`); rows.forEach(([l,v])=>console.log(`    ${l.padEnd(34)} ${v.toFixed(1).padStart(6)}ns   ${(base/v).toFixed(1)}x`)); };

// --- OBJECT LEAF: the case the other AI is asking about ---
const users = Array.from({length:1024},(_,i)=>({id:i,name:'n'+i,email:'e'+i+'@x.com',version:i}));
const equalUser=(a,b)=>a===b||(a.id===b.id&&a.name===b.name&&a.email===b.email&&a.version===b.version);
const equalByVersion=(a,b)=>a===b||(a.id===b.id&&a.version===b.version);
show('object leaf {id,name,email,version} — CHANGING value', [
  ['deepEqual (generic)',        bench(deepEqual, users)],
  ['typed equalUser (4 fields)', bench(equalUser, users)],
  ['version equality (id+ver)',  bench(equalByVersion, users)],
  ['Object.is (ref only)',       bench(Object.is, users)],
]);
// The HTTP re-fetch case: structurally identical, new identity every write.
const same = Array.from({length:1024},()=>({id:7,name:'n7',email:'e7@x.com',version:7}));
show('object leaf — HTTP RE-FETCH (equivalent, new identity each time)', [
  ['deepEqual (generic)',        bench(deepEqual, same)],
  ['typed equalUser (4 fields)', bench(equalUser, same)],
  ['version equality (id+ver)',  bench(equalByVersion, same)],
]);
// Deep/nested object leaf — where generic recursion should hurt most.
const mk=i=>({id:i,profile:{name:'n'+i,addr:{city:'c'+i,zip:i}},prefs:{theme:'dark',n:i}});
const deep = Array.from({length:1024},(_,i)=>mk(i));
const equalDeep=(a,b)=>a===b||(a.id===b.id&&a.profile.name===b.profile.name&&a.profile.addr.city===b.profile.addr.city&&a.profile.addr.zip===b.profile.addr.zip&&a.prefs.theme===b.prefs.theme&&a.prefs.n===b.prefs.n);
show('nested object leaf (3 levels, 6 fields)', [
  ['deepEqual (generic)', bench(deepEqual, deep)],
  ['typed equalDeep',     bench(equalDeep, deep)],
]);
