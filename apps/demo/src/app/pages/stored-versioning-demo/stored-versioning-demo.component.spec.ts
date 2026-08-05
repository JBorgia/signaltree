import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoredVersioningDemoComponent } from './stored-versioning-demo.component';

describe('StoredVersioningDemoComponent', () => {
  let component: StoredVersioningDemoComponent;
  let fixture: ComponentFixture<StoredVersioningDemoComponent>;

  beforeEach(async () => {
    // This page's stored() signals read/write real localStorage (there's no
    // injectable storage seam — `stored()` reaches straight for the global).
    // Clear it before AND after each test so one test's writes never leak
    // into the next test's initial hydration.
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [StoredVersioningDemoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StoredVersioningDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Demo 1: basic versioned storage', () => {
    it('starts from the seeded defaults', () => {
      expect(component.basicStore.$.preferences()).toEqual({
        notifications: true,
        language: 'en',
      });
      expect(component.basicStore.$.simpleCounter()).toBe(0);
    });

    it('increments and decrements the counter in memory', () => {
      component.incrementCounter();
      component.incrementCounter();
      expect(component.basicStore.$.simpleCounter()).toBe(2);

      component.decrementCounter();
      expect(component.basicStore.$.simpleCounter()).toBe(1);
    });

    it('updates preferences and persists the versioned wrapper once flushed', () => {
      component.updateNotifications(false);
      component.updateLanguage('es');
      expect(component.basicStore.$.preferences()).toEqual({
        notifications: false,
        language: 'es',
      });

      // Default debounce (100ms) hasn't necessarily committed yet — flush()
      // forces the write synchronously so the assertion isn't a timing race.
      component.basicStore.$.preferences.flush();

      const raw = localStorage.getItem('st-demo-basic-prefs');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual({
        __v: 1,
        data: { notifications: false, language: 'es' },
      });
    });
  });

  describe('Demo 2: migration chain', () => {
    it('simulateV1Data() writes the raw v1 shape and logs it', () => {
      component.simulateV1Data();

      const raw = localStorage.getItem(component.settingsKey);
      const parsed = JSON.parse(raw as string);
      expect(parsed.__v).toBe(1);
      expect(parsed.data).toEqual({ theme: 'dark', fontSize: 18 });

      expect(component.migrationLog().length).toBe(1);
      expect(component.migrationLog()[0]).toContain('Wrote V1 data');
    });

    it('reloadSettings() migrates v1 -> v2 -> v3 in one hop', () => {
      component.simulateV1Data();
      component.reloadSettings();

      expect(component.migrationStore.$.settings()).toEqual({
        appearance: {
          theme: 'dark',
          fontSize: 18,
          fontFamily: 'system-ui', // filled in by migrateV1toV2's default
          accentColor: '#6366f1', // filled in by migrateV1toV2's default
        },
        accessibility: {
          reduceMotion: false,
          highContrast: false,
        },
      });

      expect(component.migrationLog().length).toBe(2);
      expect(component.migrationLog()[1]).toContain('Reloaded & migrated to V3');
    });

    it('reloadSettings() migrates v2 -> v3 without touching the v1 step', () => {
      component.simulateV2Data();
      component.reloadSettings();

      expect(component.migrationStore.$.settings()).toEqual({
        appearance: {
          theme: 'light',
          fontSize: 14,
          fontFamily: 'Inter',
          accentColor: '#ec4899',
        },
        accessibility: {
          reduceMotion: false,
          highContrast: false,
        },
      });
    });

    it('per-field setters patch just their slice of the settings tree', () => {
      component.updateTheme('dark');
      component.updateFontSize(20);
      component.updateAccentColor('#ef4444');
      component.updateReduceMotion(true);

      const settings = component.migrationStore.$.settings();
      expect(settings.appearance.theme).toBe('dark');
      expect(settings.appearance.fontSize).toBe(20);
      expect(settings.appearance.accentColor).toBe('#ef4444');
      expect(settings.accessibility.reduceMotion).toBe(true);
      // Untouched fields are preserved
      expect(settings.appearance.fontFamily).toBe('system-ui');
      expect(settings.accessibility.highContrast).toBe(false);
    });

    it('clearMigrationLog() empties the log', () => {
      component.simulateV1Data();
      expect(component.migrationLog().length).toBeGreaterThan(0);

      component.clearMigrationLog();
      expect(component.migrationLog()).toEqual([]);
    });
  });

  describe('Demo 3: storage utilities (createStorageKeys / clearStoragePrefix)', () => {
    it('refreshStorageKeys() only surfaces colon-delimited myapp: keys once flushed', () => {
      component.updateProfileName('Ada');
      component.utilitiesStore.$.user.profile.flush();
      component.refreshStorageKeys();

      expect(component.prefixedKeys()).toContain('myapp:user:profile');
      // Every key under this prefix must use the colon-delimited shape that
      // clearStoragePrefix() is designed to match.
      for (const key of component.prefixedKeys()) {
        expect(key.startsWith('myapp:')).toBe(true);
      }
    });

    it('addCacheItem() appends an item and stamps lastFetch', () => {
      component.addCacheItem();
      component.utilitiesStore.$.cache.data.flush();
      component.utilitiesStore.$.cache.lastFetch.flush();
      component.refreshStorageKeys();

      expect(component.utilitiesStore.$.cache.data()).toEqual([
        expect.stringContaining('Item 1'),
      ]);
      expect(component.utilitiesStore.$.cache.lastFetch()).not.toBeNull();
      expect(component.prefixedKeys()).toContain('myapp:cache:data');
      expect(component.prefixedKeys()).toContain('myapp:cache:lastFetch');
    });

    it('clearAllMyAppStorage() removes every myapp: key and resyncs the live tree', () => {
      component.updateProfileName('Ada');
      component.updateDarkMode(true);
      component.addCacheItem();
      component.utilitiesStore.$.user.profile.flush();
      component.utilitiesStore.$.user.settings.flush();
      component.utilitiesStore.$.cache.data.flush();
      component.utilitiesStore.$.cache.lastFetch.flush();
      component.refreshStorageKeys();
      expect(component.prefixedKeys().length).toBeGreaterThan(0);

      component.clearAllMyAppStorage();

      expect(component.prefixedKeys()).toEqual([]);
      expect(component.utilitiesStore.$.user.profile()).toEqual({
        name: '',
        avatar: '',
      });
      expect(component.utilitiesStore.$.user.settings()).toEqual({
        darkMode: false,
      });
      expect(component.utilitiesStore.$.cache.lastFetch()).toBeNull();
      expect(component.utilitiesStore.$.cache.data()).toEqual([]);
    });
  });

  describe('Demo 4: durability (13.3.0 stored() write path)', () => {
    it('is "pending" immediately after set(), and settles once flushed', () => {
      expect(component.durabilityIsPending()).toBe(false);

      component.setDurabilityValue();
      // The debounced write hasn't committed yet — raw storage still lags
      // behind the in-memory value.
      expect(component.durabilityIsPending()).toBe(true);

      component.flushDurability();
      expect(component.durabilityIsPending()).toBe(false);
      expect(component.durabilityPersistedValue()).toBe(
        component.durabilityStore.$.note()
      );
    });

    it('auto-persists once the debounce window elapses, with no manual flush', async () => {
      component.setDurabilityValue();
      expect(component.durabilityIsPending()).toBe(true);
      const noteValue = component.durabilityStore.$.note();

      // Default stored() debounce is 100ms; give it a comfortable margin
      // rather than racing the exact boundary.
      await new Promise((r) => setTimeout(r, 250));
      component.refreshDurabilityRaw();

      expect(component.durabilityIsPending()).toBe(false);
      expect(component.durabilityPersistedValue()).toBe(noteValue);
    });
  });
});
