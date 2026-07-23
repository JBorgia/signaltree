/**
 * WALKER CONFORMANCE — ng-forms package (RFC 0004 §4 step 1).
 *
 * `formBridge`'s `findFormSignals` walks the materialized tree to discover
 * `form()` markers; tree branches are CALLABLE NodeAccessors
 * (typeof 'function'). Companion to the core/enterprise/schema
 * walker-conformance suites. `getSignalAtPath`'s dotted-path depth coverage
 * lives in ng-forms.spec.ts (the setValue('preferences.theme') regression).
 */
import { form, signalTree } from '@signaltree/core';

import { formBridge } from './form-bridge';

describe('formBridge walker conformance — deep callable-branch discovery', () => {
  it('finds form() markers nested three branches deep', () => {
    const tree = signalTree({
      org: {
        teams: {
          alpha: {
            settings: form({
              initial: { theme: 'light' },
            }),
          },
        },
      },
      // A shallow sibling form proves depth doesn't shadow breadth.
      contact: form({
        initial: { email: '' },
      }),
    }).with(formBridge());

    expect(tree.formBridge.size).toBe(2);
    expect(tree.formBridge.has('org.teams.alpha.settings')).toBe(true);
    expect(tree.formBridge.has('contact')).toBe(true);
  });

  it('does not choke on a built-in (Date) leaf while discovering forms', () => {
    const tree = signalTree({
      meta: { createdAt: new Date('2020-01-02T00:00:00Z') },
      deep: {
        wizard: form({
          initial: { step: 1 },
        }),
      },
    }).with(formBridge());

    expect(tree.formBridge.size).toBe(1);
    expect(tree.formBridge.has('deep.wizard')).toBe(true);
  });
});
