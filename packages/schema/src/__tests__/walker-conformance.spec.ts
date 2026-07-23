/**
 * WALKER CONFORMANCE — schema package (RFC 0004 §4 step 1).
 *
 * The schema matcher's path resolution (`readTreeAtPath`) and snapshotting
 * (`snapshotTreeNode`) walk the materialized tree, whose branches are
 * CALLABLE NodeAccessors (typeof 'function'). Companion to the core and
 * enterprise walker-conformance suites: deep paths, plus a built-in (Date)
 * leaf on the walk path that must snapshot atomically.
 */
import { describe, expect, it } from 'vitest';
import { signalTree } from '@signaltree/core';

import { schemas } from '../lib/schema';
import { syncSchema } from './test-helpers';

describe('schemas walker conformance — deep callable-branch paths', () => {
  const makeDeepState = () => ({
    org: {
      meta: { founded: new Date('2020-01-02T00:00:00Z') },
      teams: {
        alpha: {
          lead: { profile: { display: 'Ada', score: 1 } },
        },
      },
    },
  });

  it('binds and validates a schema five branches deep (attach + write)', () => {
    const tree = signalTree(makeDeepState()).with(
      schemas({
        schemas: {
          'org.teams.alpha.lead.profile.display': syncSchema((v) =>
            typeof v === 'string' && v.length > 0 ? null : 'Required'
          ),
        },
        // validateOnAttach exercises readTreeAtPath/snapshotTreeNode through
        // the callable branches immediately, not just on the write path.
        validateOnAttach: true,
      })
    );

    expect(
      tree.schemas.errorsAt('org.teams.alpha.lead.profile.display')()
    ).toBeNull();

    (tree as any).$.org.teams.alpha.lead.profile.display.set('');
    expect(
      tree.schemas.errorsAt('org.teams.alpha.lead.profile.display')()
    ).toBe('Required');
    expect(tree.schemas.isValid()).toBe(false);

    (tree as any).$.org.teams.alpha.lead.profile.display.set('Grace');
    expect(tree.schemas.isValid()).toBe(true);
  });

  it('validates a built-in (Date) leaf at depth as an atomic value', () => {
    const tree = signalTree(makeDeepState()).with(
      schemas({
        schemas: {
          'org.meta.founded': syncSchema((v) =>
            v instanceof Date && v.getTime() > 0 ? null : 'Bad date'
          ),
        },
        validateOnAttach: true,
      })
    );

    // Snapshot must deliver the Date itself (leaf), not a walked-into husk.
    expect(tree.schemas.errorsAt('org.meta.founded')()).toBeNull();

    (tree as any).$.org.meta.founded.set(new Date(0));
    expect(tree.schemas.errorsAt('org.meta.founded')()).toBe('Bad date');
  });
});
