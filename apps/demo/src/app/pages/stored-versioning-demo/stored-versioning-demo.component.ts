import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  clearStoragePrefix,
  createStorageKeys,
  signalTree,
  stored,
} from '@signaltree/core';

import {
  type CodeFile,
  CodeTabsComponent,
} from '../../examples/shared/components/example-shell';

// =============================================================================
// TYPES
// =============================================================================

// Version 1 schema (old)
interface UserSettingsV1 {
  theme: 'light' | 'dark';
  fontSize: number;
}

// Version 2 schema (current)
interface UserSettingsV2 {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  fontFamily: string;
  accentColor: string;
}

// Version 3 schema (future - for demo)
interface UserSettingsV3 {
  appearance: {
    theme: 'light' | 'dark' | 'system';
    fontSize: number;
    fontFamily: string;
    accentColor: string;
  };
  accessibility: {
    reduceMotion: boolean;
    highContrast: boolean;
  };
}

// =============================================================================
// MIGRATIONS
// =============================================================================

function migrateV1toV2(v1: UserSettingsV1): UserSettingsV2 {
  return {
    theme: v1.theme,
    fontSize: v1.fontSize,
    fontFamily: 'system-ui',
    accentColor: '#6366f1',
  };
}

function migrateV2toV3(v2: UserSettingsV2): UserSettingsV3 {
  return {
    appearance: {
      theme: v2.theme,
      fontSize: v2.fontSize,
      fontFamily: v2.fontFamily,
      accentColor: v2.accentColor,
    },
    accessibility: {
      reduceMotion: false,
      highContrast: false,
    },
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

@Component({
  selector: 'app-stored-versioning-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, CodeTabsComponent],
  templateUrl: './stored-versioning-demo.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './stored-versioning-demo.component.scss',
})
export class StoredVersioningDemoComponent {
  // Demo selection
  activeDemo = signal<'basic' | 'migration' | 'utilities' | 'durability'>(
    'basic'
  );

  // Storage key prefix for this demo
  readonly storagePrefix = 'st-demo';

  // =============================================================================
  // DEMO 1: Basic Versioned Storage
  // =============================================================================

  basicStore = signalTree({
    // Versioned storage with explicit version number
    preferences: stored<{ notifications: boolean; language: string }>(
      `${this.storagePrefix}-basic-prefs`,
      { notifications: true, language: 'en' },
      { version: 1 }
    ),
    // Non-versioned for comparison
    simpleCounter: stored<number>(`${this.storagePrefix}-counter`, 0),
  });

  // Helper methods for template (Angular templates don't support arrow functions)
  updateNotifications(value: boolean): void {
    const current = this.basicStore.$.preferences();
    this.basicStore.$.preferences.set({ ...current, notifications: value });
  }

  updateLanguage(value: string): void {
    const current = this.basicStore.$.preferences();
    this.basicStore.$.preferences.set({ ...current, language: value });
  }

  incrementCounter(): void {
    this.basicStore.$.simpleCounter.update((c) => c + 1);
  }

  decrementCounter(): void {
    this.basicStore.$.simpleCounter.update((c) => c - 1);
  }

  languages = ['en', 'es', 'fr', 'de', 'ja', 'zh'];

  // =============================================================================
  // DEMO 2: Migration Chain
  // =============================================================================

  readonly settingsKey = `${this.storagePrefix}-user-settings`;

  migrationStore = signalTree({
    settings: stored<UserSettingsV3>(
      `${this.storagePrefix}-user-settings`,
      {
        appearance: {
          theme: 'system',
          fontSize: 16,
          fontFamily: 'system-ui',
          accentColor: '#6366f1',
        },
        accessibility: {
          reduceMotion: false,
          highContrast: false,
        },
      },
      {
        version: 3,
        // Migration function handles all version upgrades
        migrate: (oldData: unknown, oldVersion: number) => {
          let data = oldData;

          // Chain migrations based on version
          if (oldVersion === 1) {
            data = migrateV1toV2(data as UserSettingsV1);
            oldVersion = 2;
          }
          if (oldVersion === 2) {
            data = migrateV2toV3(data as UserSettingsV2);
          }

          return data as UserSettingsV3;
        },
      }
    ),
  });

  themeOptions: UserSettingsV3['appearance']['theme'][] = [
    'light',
    'dark',
    'system',
  ];
  fontFamilies = ['system-ui', 'Inter', 'Roboto', 'Georgia', 'Monaco'];
  accentColors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];

  migrationLog = signal<string[]>([]);

  // Helper methods for migration settings (Angular templates don't support arrow functions)
  updateTheme(theme: UserSettingsV3['appearance']['theme']): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      appearance: { ...s.appearance, theme },
    });
  }

  updateFontSize(fontSize: number): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      appearance: { ...s.appearance, fontSize },
    });
  }

  updateFontFamily(fontFamily: string): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      appearance: { ...s.appearance, fontFamily },
    });
  }

  updateAccentColor(accentColor: string): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      appearance: { ...s.appearance, accentColor },
    });
  }

  updateReduceMotion(reduceMotion: boolean): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      accessibility: { ...s.accessibility, reduceMotion },
    });
  }

  updateHighContrast(highContrast: boolean): void {
    const s = this.migrationStore.$.settings();
    this.migrationStore.$.settings.set({
      ...s,
      accessibility: { ...s.accessibility, highContrast },
    });
  }

  simulateV1Data() {
    // Directly write V1 format to localStorage
    const v1Data: UserSettingsV1 = {
      theme: 'dark',
      fontSize: 18,
    };
    localStorage.setItem(
      this.settingsKey,
      JSON.stringify({ __v: 1, data: v1Data })
    );
    this.migrationLog.update((log) => [
      ...log,
      `[${new Date().toLocaleTimeString()}] Wrote V1 data: ${JSON.stringify(
        v1Data
      )}`,
    ]);
  }

  simulateV2Data() {
    const v2Data: UserSettingsV2 = {
      theme: 'light',
      fontSize: 14,
      fontFamily: 'Inter',
      accentColor: '#ec4899',
    };
    localStorage.setItem(
      this.settingsKey,
      JSON.stringify({ __v: 2, data: v2Data })
    );
    this.migrationLog.update((log) => [
      ...log,
      `[${new Date().toLocaleTimeString()}] Wrote V2 data: ${JSON.stringify(
        v2Data
      )}`,
    ]);
  }

  reloadSettings() {
    this.migrationStore.$.settings.reload();
    const currentValue = this.migrationStore.$.settings();
    this.migrationLog.update((log) => [
      ...log,
      `[${new Date().toLocaleTimeString()}] Reloaded & migrated to V3: ${JSON.stringify(
        currentValue
      )}`,
    ]);
  }

  clearMigrationLog() {
    this.migrationLog.set([]);
  }

  // =============================================================================
  // DEMO 3: Storage Utilities
  // =============================================================================

  // Prefix for utilities demo
  readonly appPrefix = 'myapp';

  // createStorageKeys() is what clearStoragePrefix() is designed to pair
  // with: it colon-delimits every key ("myapp:user:profile"), and
  // clearStoragePrefix() only matches keys starting with "prefix:". Hand-built
  // dash-joined keys (the old `${appPrefix}-user-profile` shape) never match.
  readonly storageKeys = createStorageKeys(this.appPrefix, {
    user: {
      profile: 'profile',
      settings: 'settings',
    },
    cache: {
      lastFetch: 'lastFetch',
      data: 'data',
    },
  } as const);

  utilitiesStore = signalTree({
    user: {
      profile: stored<{ name: string; avatar: string }>(
        this.storageKeys.user.profile,
        { name: '', avatar: '' }
      ),
      settings: stored<{ darkMode: boolean }>(
        this.storageKeys.user.settings,
        { darkMode: false }
      ),
    },
    cache: {
      lastFetch: stored<string | null>(this.storageKeys.cache.lastFetch, null),
      data: stored<string[]>(this.storageKeys.cache.data, []),
    },
  });

  allStorageKeys = signal<string[]>([]);
  prefixedKeys = signal<string[]>([]);

  // Helper methods for utilities store
  updateProfileName(name: string): void {
    const p = this.utilitiesStore.$.user.profile();
    this.utilitiesStore.$.user.profile.set({ ...p, name });
    this.refreshStorageKeys();
  }

  updateProfileAvatar(avatar: string): void {
    const p = this.utilitiesStore.$.user.profile();
    this.utilitiesStore.$.user.profile.set({ ...p, avatar });
    this.refreshStorageKeys();
  }

  updateDarkMode(darkMode: boolean): void {
    const s = this.utilitiesStore.$.user.settings();
    this.utilitiesStore.$.user.settings.set({ ...s, darkMode });
    this.refreshStorageKeys();
  }

  refreshStorageKeys() {
    // Get all localStorage keys
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) allKeys.push(key);
    }
    this.allStorageKeys.set(allKeys.sort());

    // Filter to just our prefix - createStorageKeys() colon-delimits
    // ("myapp:user:profile"), which is what clearStoragePrefix() matches on.
    this.prefixedKeys.set(
      allKeys.filter((k) => k.startsWith(`${this.appPrefix}:`)).sort()
    );
  }

  addCacheItem() {
    const items = this.utilitiesStore.$.cache.data();
    this.utilitiesStore.$.cache.data.set([
      ...items,
      `Item ${items.length + 1} - ${new Date().toLocaleTimeString()}`,
    ]);
    this.utilitiesStore.$.cache.lastFetch.set(new Date().toISOString());
    this.refreshStorageKeys();
  }

  clearAllMyAppStorage() {
    // Removes every "myapp:" key from storage in one call - including any
    // orphaned keys left behind by a stored() signal that isn't currently
    // mounted (e.g. from a previous session/version).
    clearStoragePrefix(this.appPrefix);
    // clearStoragePrefix() only touches storage - it doesn't know about the
    // live tree, so reload() re-reads each signal to sync the in-memory
    // value with the now-empty storage.
    this.utilitiesStore.$.user.profile.reload();
    this.utilitiesStore.$.user.settings.reload();
    this.utilitiesStore.$.cache.lastFetch.reload();
    this.utilitiesStore.$.cache.data.reload();
    this.refreshStorageKeys();
  }

  // =============================================================================
  // DEMO 4: Durability (13.3.0)
  // =============================================================================

  readonly durabilityKey = `${this.storagePrefix}-durability-note`;

  // Default debounce (100ms) - deliberately left unset here to demo the
  // out-of-the-box behavior described in the 13.3.0 release.
  durabilityStore = signalTree({
    note: stored<string>(this.durabilityKey, ''),
  });

  // Raw storage is polled (not read once) so the UI visibly catches up
  // when the debounce timer commits - stored() has no "pending" signal of
  // its own to read, so this reconstructs it from the outside.
  durabilityRawStorage = signal<string | null>(null);
  durabilityHasInteracted = signal(false);

  durabilityPersistedValue = computed<string | undefined>(() => {
    const raw = this.durabilityRawStorage();
    if (raw === null) return undefined;
    try {
      return (JSON.parse(raw) as { data: string }).data;
    } catch {
      return undefined;
    }
  });

  durabilityIsPending = computed(() => {
    if (!this.durabilityHasInteracted()) return false;
    return this.durabilityStore.$.note() !== this.durabilityPersistedValue();
  });

  setDurabilityValue(): void {
    this.durabilityHasInteracted.set(true);
    this.durabilityStore.$.note.set(
      `Set at ${new Date().toLocaleTimeString()}`
    );
    this.refreshDurabilityRaw();
  }

  flushDurability(): void {
    this.durabilityStore.$.note.flush();
    this.refreshDurabilityRaw();
  }

  refreshDurabilityRaw(): void {
    this.durabilityRawStorage.set(localStorage.getItem(this.durabilityKey));
  }

  durabilityCode = `// Default debounce (100ms) coalesces rapid writes into
// a single localStorage write
signalTree({
  note: stored('durability-note', ''),
});

tree.$.note.set('draft...'); // in storage ~100ms later, not immediately
tree.$.note.flush();         // commit the pending write right now

// Debounced writes also drain automatically on visibilitychange -> hidden
// and pagehide, so a value set right before the tab is backgrounded or
// killed is not lost - no code required.

// Native shells the DOM can't see (e.g. Capacitor) call the same drain:
import { flushAllStoredSignals } from '@signaltree/core';
App.addListener('pause', () => flushAllStoredSignals());

// Per-key durability levers
signalTree({
  criticalFlag: stored('critical-flag', false, {
    debounceMs: 0, // write synchronously, in set()'s stack
  }),
  draft: stored('draft', '', {
    // Bounds staleness under continuous writes - plain debouncing resets
    // its timer on every update, so a key updated faster than debounceMs
    // is never persisted until updates stop.
    maxWaitMs: 2000,
  }),
  tracked: stored('tracked', null, {
    onError: (error, { key, operation }) => {
      // operation: 'read' | 'write' | 'migrate'
      reportToTelemetry(error, { key, operation });
    },
  }),
});

// clear() and reload() both cancel any pending debounced write before
// acting - a cleared value can't be resurrected by an already-armed timer,
// and reload() treats storage as the source of truth, running migrate()
// if the stored version differs (same as initial load).
tree.$.note.clear();
tree.$.note.reload();

// ── 13.4.0 ──────────────────────────────────────────────────────────────
// reload() now REPORTS what it found instead of returning void:
//   'ok'      a stored value was read
//   'default' the key was absent
//   'error'   the data could not be read or migrated. The signal falls back
//             to its default and storage is left INTACT — destroying data a
//             human might still recover is a policy call left to you.
const outcome = tree.$.note.reload();
if (outcome === 'error') {
  // surface a "couldn't restore your draft" notice, or quarantine the key
}

// Also 13.4.0: a stored leaf is a REAL Angular signal, so the tree can
// finally see it. Before, tree() omitted a top-level stored leaf entirely and
// emitted the raw marker for a nested one; a merge write through the parent
// was silently dropped.
tree();                              // { note: 'draft...' } — value, not marker
tree.$.settings({ theme: 'dark' });  // reaches a stored leaf under settings

// Careful: a merge REPLACES an object-valued stored leaf rather than merging
// into it (a plain nested namespace would deep-merge).`;

  // =============================================================================
  // CODE EXAMPLES
  // =============================================================================

  basicVersioningCode = `// Versioned storage with explicit version
signalTree({
  preferences: stored<Preferences>(
    'app-preferences',
    { notifications: true, language: 'en' },
    { version: 1 }  // Explicit version number
  ),
});

// Storage format: { __v: 1, data: { notifications: true, ... } }

// Omitting \`version\` does NOT skip the wrapper - it defaults to 1.
// There is no unwrapped write path; every stored() value is versioned.
signalTree({
  counter: stored<number>('counter', 0),
});
// Storage format: { __v: 1, data: 0 }`;

  migrationCode = `// Multi-version migration with single migrate function
interface SettingsV1 { theme: 'light' | 'dark'; }
interface SettingsV2 { theme: 'light' | 'dark' | 'system'; accent: string; }
interface SettingsV3 { appearance: { theme: string; accent: string; }; }

signalTree({
  settings: stored<SettingsV3>(
    'user-settings',
    defaultV3Value,
    {
      version: 3,  // Current schema version
      migrate: (oldData, oldVersion) => {
        let data = oldData;
        
        // Chain migrations based on version
        if (oldVersion === 1) {
          data = migrateV1toV2(data as SettingsV1);
          oldVersion = 2;
        }
        if (oldVersion === 2) {
          data = migrateV2toV3(data as SettingsV2);
        }
        
        return data as SettingsV3;
      },
    }
  ),
});

// Migrations run automatically on reload()
// Old data transformed: v1 → v2 → v3`;

  utilitiesCode = `// createStorageKeys() colon-delimits every key - it's the
// only key shape clearStoragePrefix() is designed to match against.
const STORAGE_KEYS = createStorageKeys('myapp', {
  user: { profile: 'profile', settings: 'settings' },
  cache: { lastFetch: 'lastFetch', data: 'data' },
} as const);
// STORAGE_KEYS.user.profile === 'myapp:user:profile'

signalTree({
  user: {
    profile: stored(STORAGE_KEYS.user.profile, defaultProfile),
    settings: stored(STORAGE_KEYS.user.settings, defaultSettings),
  },
  cache: {
    lastFetch: stored(STORAGE_KEYS.cache.lastFetch, null),
    data: stored(STORAGE_KEYS.cache.data, []),
  },
});

// clearStoragePrefix() matches keys starting with "prefix:" - a hand-built
// dash-joined key ('myapp-user-profile') will NOT match and silently no-op.
clearStoragePrefix('myapp');
// Removes: myapp:user:profile, myapp:user:settings,
//          myapp:cache:lastFetch, myapp:cache:data

// clearStoragePrefix() only touches storage - reload() (or clear()) still
// syncs any live signal's in-memory value with the cleared storage.`;

  // Source strings wrapped for the shared tabbed code viewer
  basicVersioningFiles: CodeFile[] = [
    {
      label: 'basic-versioning.ts',
      language: 'typescript',
      source: this.basicVersioningCode,
    },
  ];
  migrationFiles: CodeFile[] = [
    { label: 'migration.ts', language: 'typescript', source: this.migrationCode },
  ];
  utilitiesFiles: CodeFile[] = [
    { label: 'utilities.ts', language: 'typescript', source: this.utilitiesCode },
  ];
  durabilityFiles: CodeFile[] = [
    { label: 'durability.ts', language: 'typescript', source: this.durabilityCode },
  ];

  constructor() {
    // Initialize storage keys list
    this.refreshStorageKeys();

    // Poll the raw storage value so the "pending vs persisted" indicator on
    // the Durability tab visibly catches up once the debounce timer fires -
    // stored() itself exposes no event for a completed write.
    this.refreshDurabilityRaw();
    const durabilityPollId = setInterval(
      () => this.refreshDurabilityRaw(),
      25
    );
    inject(DestroyRef).onDestroy(() => clearInterval(durabilityPollId));
  }
}
