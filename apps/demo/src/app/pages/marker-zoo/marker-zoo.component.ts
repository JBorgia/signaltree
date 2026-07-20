import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  asyncQuery,
  asyncSource,
  entityCollection,
  entityMap,
  form,
  signalTree,
  status,
  stored,
  validators,
} from '@signaltree/core';
import { delay, of } from 'rxjs';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

interface User {
  id: number;
  name: string;
  role: 'admin' | 'user' | 'guest';
  email: string;
}

interface Team {
  id: number;
  name: string;
}

interface Plant {
  id: string;
  name: string;
  region: string;
}

const ALL_USERS: User[] = [
  { id: 1, name: 'Alice', role: 'admin', email: 'alice@acme.test' },
  { id: 2, name: 'Bob', role: 'user', email: 'bob@acme.test' },
  { id: 3, name: 'Carol', role: 'user', email: 'carol@acme.test' },
  { id: 4, name: 'Dave', role: 'guest', email: 'dave@acme.test' },
];

const ALL_TEAMS: Team[] = [
  { id: 100, name: 'Platform' },
  { id: 101, name: 'Growth' },
];

const ALL_PLANTS: Plant[] = [
  { id: 'plant-a', name: 'Riverside', region: 'east' },
  { id: 'plant-b', name: 'Lakeshore', region: 'west' },
  { id: 'plant-c', name: 'Summit', region: 'central' },
];

/**
 * MARKER ZOO
 *
 * Showcases ALL 7 markers in ONE tree at four different depths simultaneously.
 * This is intentionally non-trivial — the point is to demonstrate that
 * SignalTree's marker family composes at arbitrary tree positions, which
 * is impossible (or requires significant ceremony) in libraries that
 * compose features at the store root.
 *
 * Depth map:
 *   depth 1: orgStatus (status marker)
 *   depth 2: directory.users (asyncSource), settings.theme (stored),
 *            onboarding.profile (form marker)
 *   depth 3: organization.teams.list (entityMap), organization.teams.search (asyncQuery)
 *   depth 4: organization.teams.catalog.plants (entityCollection — cache-aware,
 *            self-loading entityMap)
 */
@Component({
  selector: 'app-marker-zoo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CodeTabsComponent],
  templateUrl: './marker-zoo.component.html',
  styleUrl: './marker-zoo.component.scss',
})
export class MarkerZooComponent {
  readonly statusCode: CodeFile[] = [
    {
      label: 'status.ts',
      language: 'typescript',
      source: `// Read predicates (v10.3 canonical — bare names)
store.$.orgStatus.loading();      // Signal<boolean>
store.$.orgStatus.loaded();
store.$.orgStatus.hasError();

// Write methods (canonical):
store.$.orgStatus.setLoading();
store.$.orgStatus.setLoaded();

// v10.2 Promise-vocabulary aliases (equivalent):
store.$.orgStatus.start();        // === setLoading
store.$.orgStatus.setSuccess();   // === setLoaded
store.$.orgStatus.fail(err);      // === setError`,
    },
  ];

  readonly entityMapCode: CodeFile[] = [
    {
      label: 'entityMap.ts',
      language: 'typescript',
      source: `store.$.organization.teams.list.all()`,
    },
  ];

  readonly storedCode: CodeFile[] = [
    {
      label: 'stored.ts',
      language: 'typescript',
      source: `theme: stored('marker-zoo-theme', 'light')`,
    },
  ];

  readonly entityCollectionCode: CodeFile[] = [
    {
      label: 'entityCollection.ts',
      language: 'typescript',
      source: `plants: entityCollection<Plant, string>({
  load: () => of(ALL_PLANTS).pipe(delay(400)),
  selectId: (p) => p.id,
  staleTime: '30s',  // load() is a no-op while fresh
  tags: ['plants'],  // invalidateTag(tree, 'plants')
})

store.$.organization.teams.catalog.plants.all();      // full entityMap surface
store.$.organization.teams.catalog.plants.loading();   // Signal<boolean>
store.$.organization.teams.catalog.plants.load();      // guarded — coalesces concurrent calls
store.$.organization.teams.catalog.plants.invalidate(); // mark stale`,
    },
  ];

  readonly store = signalTree({
    // depth 1 — status marker for org-wide sync
    orgStatus: status(),

    // depth 2 — asyncSource for an org-wide user directory
    directory: {
      users: asyncSource<User[]>({
        initial: [],
        load: () => of(ALL_USERS).pipe(delay(600)),
        lazy: true,
      }),
    },

    organization: {
      teams: {
        // depth 3 — entityMap of teams (nested inside organization)
        list: entityMap<Team, number>({ selectId: (t) => t.id }),

        // depth 3 — asyncQuery for team-name search
        search: asyncQuery<string, Team[]>({
          initialResult: [],
          debounce: 250,
          filter: (q) => q.length > 0,
          query: (q) =>
            of(
              ALL_TEAMS.filter((t) =>
                t.name.toLowerCase().includes(q.toLowerCase())
              )
            ).pipe(delay(180)),
        }),

        catalog: {
          // depth 4 — entityCollection: cache-aware, self-loading entityMap
          plants: entityCollection<Plant, string>({
            load: () => of(ALL_PLANTS).pipe(delay(400)),
            selectId: (p) => p.id,
            staleTime: '30s',
            tags: ['plants'],
          }),
        },
      },
    },

    // depth 2 — stored marker for auto-synced localStorage preference
    settings: {
      theme: stored('marker-zoo-theme', 'light' as 'light' | 'dark'),
    },

    // depth 2 — form marker
    onboarding: {
      profile: form<{ name: string; email: string }>({
        initial: { name: '', email: '' },
        validators: {
          name: validators.required('Required'),
          email: [
            validators.required('Required'),
            validators.email('Invalid email'),
          ],
        },
      }),
    },
  });

  loadDirectory(): void {
    this.store.$.orgStatus.setLoading();
    this.store.$.directory.users.refresh();
    // Mirror the asyncSource's loaded state into the depth-1 status marker
    // (orgStatus represents "are we hydrated") — illustrates how markers
    // compose: each does one thing, you wire them together explicitly.
    setTimeout(() => this.store.$.orgStatus.setLoaded(), 650);
  }

  loadTeams(): void {
    this.store.$.organization.teams.list.setAll(ALL_TEAMS);
  }

  loadPlants(): void {
    this.store.$.organization.teams.catalog.plants.load();
  }

  toggleTheme(): void {
    this.store.$.settings.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  resetAll(): void {
    this.store.$.directory.users.reset();
    this.store.$.organization.teams.list.clear();
    this.store.$.organization.teams.search.reset();
    this.store.$.organization.teams.catalog.plants.clear();
    this.store.$.organization.teams.catalog.plants.invalidate();
    this.store.$.onboarding.profile.reset();
    this.store.$.orgStatus.reset();
  }
}
