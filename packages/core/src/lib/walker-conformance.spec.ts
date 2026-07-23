/**
 * WALKER CONFORMANCE SUITE — core package.
 *
 * One deliberately hostile fixture asserted against every core subsystem that
 * walks the tree. The v11.4/11.5 regressions (inert batching interception,
 * inert enterprise diff/patch, inert updateOptimized) all shared one root
 * cause — walkers whose specs used flat, plain-object fixtures never noticed
 * that real trees are made of CALLABLE NodeAccessors (typeof 'function') with
 * markers and built-in leaves (Date/Map) mixed in at depth. This suite makes
 * "the walker reaches nested nodes" a tested behavioral contract per
 * subsystem, not a code-review hope. See RFC 0004 §3 V-P1 / §4 step 1.
 *
 * Companion suites: packages/enterprise/src/lib/nested-state.spec.ts
 * (PathIndex / UpdateEngine / DiffEngine), plus schema and ng-forms
 * walker-conformance specs. `invalidateTag`'s nested-branch coverage also
 * lives in entity-map-loading.spec.ts; the variant here adds a built-in
 * (Date) sibling on the walk path.
 */
import { describe, expect, it } from 'vitest';

import { of } from 'rxjs';

import {
  batching,
  entityMap,
  interceptLeafSignals,
  invalidateTag,
  serialization,
  signalTree,
  status,
} from '../index';

interface Member extends Record<string, unknown> {
  id: number;
  name: string;
}

/** Depth map: org(1) → teams(2) → alpha(3) → lead(4) → profile(5) → leaves. */
const makeDeepState = () => ({
  org: {
    meta: {
      founded: new Date('2020-01-02T00:00:00Z'), // built-in leaf on the walk path
      aliases: ['a1'],
    },
    teams: {
      alpha: {
        info: { name: 'Alpha', size: 3 },
        lead: { profile: { display: 'Ada', score: 1 } },
      },
    },
  },
  counter: 0,
});

describe('walker conformance — core subsystems on a deep callable-branch tree', () => {
  it('marker materialization reaches markers nested under deep branches', () => {
    const tree = signalTree({
      org: {
        teams: {
          alpha: {
            members: entityMap<Member, number>(),
            loadState: status(),
          },
        },
      },
    });

    tree.$.org.teams.alpha.members.addOne({ id: 1, name: 'Ada' });
    expect(tree.$.org.teams.alpha.members.all()).toEqual([
      { id: 1, name: 'Ada' },
    ]);

    tree.$.org.teams.alpha.loadState.setLoading();
    expect(tree.$.org.teams.alpha.loadState.loading()).toBe(true);
  });

  it('batching setter interception wraps leaves five branches deep', () => {
    const base = signalTree(makeDeepState());

    // Count RAW writes by wrapping the setter BEFORE the enhancer; if the
    // enhancer's walker skips callable branches, coalesce() applies every
    // write instead of one and this counter exposes it.
    let applied = 0;
    const leaf = base.$.org.teams.alpha.lead.profile.score as unknown as {
      set(v: number): void;
    };
    const rawSet = leaf.set.bind(leaf);
    leaf.set = (v: number) => {
      applied++;
      rawSet(v);
    };

    const tree = base.with(batching({ enabled: true, notificationDelayMs: 0 }));
    tree.coalesce(() => {
      tree.$.org.teams.alpha.lead.profile.score.set(10);
      tree.$.org.teams.alpha.lead.profile.score.set(20);
      tree.$.org.teams.alpha.lead.profile.score.set(30);
    });

    expect(tree.$.org.teams.alpha.lead.profile.score()).toBe(30);
    expect(applied).toBe(1);
  });

  it('serialization round-trips deep leaves and a Date sitting mid-path', () => {
    const initial = makeDeepState();
    const tree = signalTree(initial).with(serialization());

    const json = tree.serialize();

    // Corrupt deep state, then restore — deserialize must recurse through
    // callable branch accessors (not bail on typeof 'function') to reach
    // the depth-5 leaves and the built-in Date leaf.
    tree.$.org.teams.alpha.lead.profile.display.set('WRONG');
    tree.$.org.teams.alpha.lead.profile.score.set(-1);
    tree.$.org.meta.founded.set(new Date(0));

    tree.deserialize(json);

    expect(tree.$.org.teams.alpha.lead.profile.display()).toBe('Ada');
    expect(tree.$.org.teams.alpha.lead.profile.score()).toBe(1);
    expect(tree.$.org.meta.founded().toISOString()).toBe(
      initial.org.meta.founded.toISOString()
    );
  });

  it('interceptLeafSignals observes a write five branches deep', () => {
    const tree = signalTree(makeDeepState());
    const paths: string[] = [];
    const restore = interceptLeafSignals(tree.$, (path) => {
      paths.push(path);
    });

    tree.$.org.teams.alpha.lead.profile.score.set(42);

    expect(paths).toContain('org.teams.alpha.lead.profile.score');
    restore();
  });

  it('invalidateTag finds a tagged collection nested past a built-in leaf sibling', async () => {
    let calls = 0;
    const tree = signalTree({
      catalog: {
        stamp: new Date('2021-01-01T00:00:00Z'), // sibling the walk must step over, not choke on
        nursery: {
          plants: entityMap<Member, number>({
            load: () => {
              calls++;
              return of([{ id: 1, name: 'Fern' }]);
            },
            staleTime: '1h',
            tags: ['plants'],
          }),
        },
      },
    });

    tree.$.catalog.nursery.plants.all();
    await Promise.resolve(); // deferred auto-load settles
    expect(calls).toBe(1);

    expect(invalidateTag(tree, 'plants')).toBe(1);
    await tree.$.catalog.nursery.plants.load();
    expect(calls).toBe(2);
  });
});
