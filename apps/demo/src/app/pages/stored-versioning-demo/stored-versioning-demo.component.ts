import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { clearStoragePrefix, signalTree, stored } from '@signaltree/core';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './stored-versioning-demo.component.html',
  styleUrls: ['./stored-versioning-demo.component.scss'],
})
export class StoredVersioningDemoComponent {
  // Demo selection
  activeDemo = signal<'basic' | 'migration' | 'utilities'>('basic');

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

  utilitiesStore = signalTree({
    user: {
      profile: stored<{ name: string; avatar: string }>(
        `${this.appPrefix}-user-profile`,
        { name: '', avatar: '' }
      ),
      settings: stored<{ darkMode: boolean }>(
        `${this.appPrefix}-user-settings`,
        { darkMode: false }
      ),
    },
    cache: {
      lastFetch: stored<string | null>(
        `${this.appPrefix}-cache-lastFetch`,
        null
      ),
      data: stored<string[]>(`${this.appPrefix}-cache-data`, []),
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

    // Filter to just our prefix
    this.prefixedKeys.set(
      allKeys.filter((k) => k.startsWith(`${this.appPrefix}-`)).sort()
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
    clearStoragePrefix(`${this.appPrefix}-`);
    // Reset in-memory state
    this.utilitiesStore.$.user.profile.clear();
    this.utilitiesStore.$.user.settings.clear();
    this.utilitiesStore.$.cache.lastFetch.clear();
    this.utilitiesStore.$.cache.data.clear();
    this.refreshStorageKeys();
  }

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

// Non-versioned for simple values
signalTree({
  counter: stored<number>('counter', 0),
});
// Storage format: 0 (raw value, no wrapper)`;

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

  utilitiesCode = `// Use consistent prefixes for namespaced storage
const prefix = 'myapp';

signalTree({
  user: {
    profile: stored(\`\${prefix}-user-profile\`, defaultProfile),
    settings: stored(\`\${prefix}-user-settings\`, defaultSettings),
  },
  cache: {
    data: stored(\`\${prefix}-cache-data\`, []),
  },
});

// Clear all keys with a prefix
clearStoragePrefix('myapp-');
// Removes: myapp-user-profile, myapp-user-settings, myapp-cache-data`;

  constructor() {
    // Initialize storage keys list
    this.refreshStorageKeys();
  }
}
