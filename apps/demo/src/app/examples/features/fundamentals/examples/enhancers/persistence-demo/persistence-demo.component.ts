import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { persistence, signalTree } from '@signaltree/core';

interface PersistenceState extends Record<string, unknown> {
  user: {
    name: string;
    email: string;
    theme: 'light' | 'dark' | 'system';
  };
  preferences: {
    notifications: boolean;
    autoSave: boolean;
    language: string;
  };
  notes: Array<{
    id: number;
    title: string;
    content: string;
    createdAt: string;
  }>;
  lastSaved: string | null;
}

/**
 * Persistence Demo
 *
 * Demonstrates withPersistence enhancer for automatic state persistence:
 * - Auto-save to localStorage on every change
 * - Auto-load on app start
 * - Manual save/load/clear controls
 * - Debounced saves to avoid excessive writes
 *
 * Try it:
 * 1. Make changes to the form
 * 2. Refresh the page - your data persists!
 * 3. Click "Clear Storage" to reset
 */
@Component({
  selector: 'app-persistence-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './persistence-demo.component.html',
  styleUrls: ['./persistence-demo.component.scss'],
})
export class PersistenceDemoComponent implements OnDestroy {
  // Storage key for this demo
  private readonly STORAGE_KEY = 'signaltree-persistence-demo';

  // Track save status
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  lastError = signal<string | null>(null);

  // Form inputs
  newNoteTitle = '';
  newNoteContent = '';

  // Create store with persistence enhancer
  store = signalTree<PersistenceState>({
    user: {
      name: '',
      email: '',
      theme: 'system',
    },
    preferences: {
      notifications: true,
      autoSave: true,
      language: 'en',
    },
    notes: [],
    lastSaved: null,
  }).with(
    persistence({
      key: this.STORAGE_KEY,
      autoSave: true, // Auto-save on every state change
      autoLoad: true, // Auto-load on creation
      debounceMs: 500, // Debounce saves by 500ms
      includeMetadata: true, // Include save timestamp
    })
  );

  // Expose state for template
  user = this.store.$.user;
  preferences = this.store.$.preferences;
  notes = this.store.$.notes;
  lastSaved = this.store.$.lastSaved;

  // Available languages
  languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
  ];

  // Available themes
  themes: Array<{ value: 'light' | 'dark' | 'system'; label: string }> = [
    { value: 'light', label: '☀️ Light' },
    { value: 'dark', label: '🌙 Dark' },
    { value: 'system', label: '💻 System' },
  ];

  constructor() {
    // Log when state is loaded from storage
    console.log('🔄 Persistence Demo initialized');
    console.log('📦 Storage key:', this.STORAGE_KEY);
  }

  ngOnDestroy() {
    // Final save on component destroy
    this.manualSave();
  }

  // ==================
  // USER PROFILE
  // ==================

  updateName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.$.user.name.set(target.value);
    this.updateLastSaved();
  }

  updateEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.$.user.email.set(target.value);
    this.updateLastSaved();
  }

  updateTheme(theme: 'light' | 'dark' | 'system') {
    this.store.$.user.theme.set(theme);
    this.updateLastSaved();
  }

  // ==================
  // PREFERENCES
  // ==================

  toggleNotifications() {
    this.store.$.preferences.notifications.update((n: boolean) => !n);
    this.updateLastSaved();
  }

  toggleAutoSave() {
    this.store.$.preferences.autoSave.update((a: boolean) => !a);
    this.updateLastSaved();
  }

  updateLanguage(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.store.$.preferences.language.set(target.value);
    this.updateLastSaved();
  }

  // ==================
  // NOTES
  // ==================

  addNote() {
    if (!this.newNoteTitle.trim()) return;

    const newNote = {
      id: Date.now(),
      title: this.newNoteTitle.trim(),
      content: this.newNoteContent.trim(),
      createdAt: new Date().toISOString(),
    };

    this.store.$.notes.update((notes: PersistenceState['notes']) => [
      ...notes,
      newNote,
    ]);
    this.newNoteTitle = '';
    this.newNoteContent = '';
    this.updateLastSaved();
  }

  deleteNote(id: number) {
    this.store.$.notes.update((notes: PersistenceState['notes']) =>
      notes.filter((n) => n.id !== id)
    );
    this.updateLastSaved();
  }

  // ==================
  // PERSISTENCE CONTROLS
  // ==================

  async manualSave() {
    try {
      this.saveStatus.set('saving');
      await (this.store as unknown as { save: () => Promise<void> }).save();
      this.saveStatus.set('saved');
      this.updateLastSaved();

      // Reset status after 2 seconds
      setTimeout(() => {
        if (this.saveStatus() === 'saved') {
          this.saveStatus.set('idle');
        }
      }, 2000);
    } catch (error) {
      this.saveStatus.set('error');
      this.lastError.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async manualLoad() {
    try {
      this.saveStatus.set('saving');
      await (this.store as unknown as { load: () => Promise<void> }).load();
      this.saveStatus.set('saved');

      setTimeout(() => {
        if (this.saveStatus() === 'saved') {
          this.saveStatus.set('idle');
        }
      }, 2000);
    } catch (error) {
      this.saveStatus.set('error');
      this.lastError.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async clearStorage() {
    if (!confirm('Clear all saved data? This cannot be undone.')) return;

    try {
      await (this.store as unknown as { clear: () => Promise<void> }).clear();

      // Reset to defaults (use update to match accessor API)
      this.store.$.user.update(() => ({
        name: '',
        email: '',
        theme: 'system',
      }));
      this.store.$.preferences.update(() => ({
        notifications: true,
        autoSave: true,
        language: 'en',
      }));
      this.store.$.notes.update(() => []);
      this.store.$.lastSaved.update(() => null);

      this.saveStatus.set('idle');
    } catch (error) {
      this.saveStatus.set('error');
      this.lastError.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private updateLastSaved() {
    this.store.$.lastSaved.set(new Date().toISOString());
  }

  // ==================
  // HELPERS
  // ==================

  formatDate(isoString: string | null): string {
    if (!isoString) return 'Never';
    return new Date(isoString).toLocaleString();
  }

  getStorageSize(): string {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) return '0 bytes';
    const bytes = new Blob([data]).size;
    if (bytes < 1024) return `${bytes} bytes`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  viewRawStorage() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (data) {
      console.log('📦 Raw storage data:', JSON.parse(data));
      alert('Check browser console for raw storage data');
    } else {
      alert('No data in storage');
    }
  }
}
