import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';

const probes = [
  'polluted',
  'isAdmin',
  'toStringTag',
  'zzz1',
  'zzz2',
  'zzz3',
  'zzz4',
  'zzz5',
];

function cleanProtos() {
  for (const k of probes) {
    delete (Object.prototype as Record<string, unknown>)[k];
    delete (Array.prototype as unknown as Record<string, unknown>)[k];
    delete (Function.prototype as unknown as Record<string, unknown>)[k];
  }
}

function polluted(): string[] {
  const hits: string[] = [];
  for (const k of probes) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, k))
      hits.push(`Object.prototype.${k}`);
    if (Object.prototype.hasOwnProperty.call(Array.prototype, k))
      hits.push(`Array.prototype.${k}`);
    if (Object.prototype.hasOwnProperty.call(Function.prototype, k))
      hits.push(`Function.prototype.${k}`);
  }
  return hits;
}

describe('zz-audit attack', () => {
  afterEach(cleanProtos);

  it('vector sweep', () => {
    const report: string[] = [];

    const run = (
      label: string,
      state: Record<string, unknown>,
      payloadJson: string
    ) => {
      cleanProtos();
      let err = '';
      try {
        const tree = signalTree(state).with(enterprise());
        const payload = JSON.parse(payloadJson);
        const r = tree.updateOptimized(payload as never);
        report.push(
          `${label}: changed=${r.changed} paths=${JSON.stringify(
            r.changedPaths
          )} HITS=${JSON.stringify(polluted())}`
        );
      } catch (e) {
        err = String(e);
        report.push(`${label}: THREW ${err} HITS=${JSON.stringify(polluted())}`);
      }
      cleanProtos();
    };

    run('A1 top __proto__ obj', { a: 1 }, '{"__proto__":{"zzz1":1}}');
    run('A2 top __proto__ str', { a: 1 }, '{"__proto__":"x"}');
    run(
      'A3 nested __proto__',
      { config: { theme: 'dark' } },
      '{"config":{"__proto__":{"zzz1":1}}}'
    );
    run(
      'A4 deep __proto__',
      { a: { b: { c: { d: 1 } } } },
      '{"a":{"b":{"c":{"__proto__":{"zzz1":1}}}}}'
    );
    run(
      'A5 constructor.prototype',
      { config: { theme: 'd' } },
      '{"config":{"constructor":{"prototype":{"zzz2":1}}}}'
    );
    run(
      'A6 top constructor.prototype',
      { a: 1 },
      '{"constructor":{"prototype":{"zzz2":1}}}'
    );
    run(
      'A7 array element __proto__',
      { list: [{ x: 1 }] },
      '{"list":[{"__proto__":{"zzz3":1}}]}'
    );
    run(
      'A8 array proto',
      { list: [1, 2] },
      '{"list":{"__proto__":{"zzz3":1}}}'
    );
    run(
      'A9 proto.proto',
      { a: { b: 1 } },
      '{"a":{"__proto__":{"__proto__":{"zzz4":1}}}}'
    );
    run(
      'A10 constructor.prototype deep',
      { a: { b: { c: 1 } } },
      '{"a":{"b":{"constructor":{"prototype":{"zzz2":1}}}}}'
    );
    run(
      'A11 legit key name',
      { config: { theme: 'd' } },
      '{"config":{"name":"HACKED"}}'
    );
    run(
      'A12 legit key length',
      { config: { theme: 'd' } },
      '{"config":{"length":99}}'
    );

    throw new Error('REPORT::\n' + report.join('\n'));
  });
});
