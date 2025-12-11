import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { SignalTree, signalTree, withSerialization } from '@signaltree/core';

interface ItemType {
  id: number;
  name: string;
  value: number;
  tags: string[];
}

interface AppState {
  user: {
    name: string;
    email: string;
    createdAt: Date;
  };
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    notifications: boolean;
  };
  items: ItemType[];
  metadata: {
    version: number;
    lastModified: Date;
  };
}

// Extended type for serialization methods
interface SerializableMethods {
  serialize: (config?: object) => string;
  deserialize: (json: string, config?: object) => void;
  toJSON: () => AppState;
  fromJSON: (data: AppState) => void;
}

/**
 * Serialization Demo
 *
 * Demonstrates the withSerialization enhancer for:
 * - Converting SignalTree state to JSON
 * - Restoring state from JSON
 * - Handling special types (Date, Set, Map, etc.)
 * - Type preservation across serialization cycles
 */
@Component({
  selector: 'app-serialization-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './serialization-demo.component.html',
  styleUrl: './serialization-demo.component.scss',
})
export class SerializationDemoComponent {
  // Create store with serialization enhancer
  // Note: Using type assertion due to complex generic constraints in withSerialization
  store: SignalTree<AppState> & SerializableMethods;

  constructor() {
    const baseStore = signalTree<AppState>({
      user: {
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
      },
      preferences: {
        theme: 'dark',
        language: 'en',
        notifications: true,
      },
      items: [
        { id: 1, name: 'Item One', value: 100, tags: ['important', 'urgent'] },
        { id: 2, name: 'Item Two', value: 250, tags: ['archived'] },
      ],
      metadata: {
        version: 1,
        lastModified: new Date(),
      },
    });

    // Apply enhancer with type assertion
    /* eslint-disable @typescript-eslint/no-explicit-any */
    this.store = baseStore.with(
      withSerialization({ preserveTypes: true, includeMetadata: true }) as any
    ) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  // UI State
  serializedOutput = signal<string>('');
  importInput = signal<string>('');
  lastAction = signal<string>('');
  showTypePreservation = signal(false);

  // Computed helpers - use getter pattern to access after constructor
  get userName() {
    return this.store.$.user.name;
  }
  get userEmail() {
    return this.store.$.user.email;
  }
  createdAt = computed(() => {
    const date = this.store.$.user.createdAt();
    return date instanceof Date ? date.toLocaleString() : String(date);
  });

  get theme() {
    return this.store.$.preferences.theme;
  }
  get language() {
    return this.store.$.preferences.language;
  }
  get notifications() {
    return this.store.$.preferences.notifications;
  }

  get items() {
    return this.store.$.items;
  }
  itemsCount = computed(() => this.store.$.items().length);

  get metadataVersion() {
    return this.store.$.metadata.version;
  }
  lastModified = computed(() => {
    const date = this.store.$.metadata.lastModified();
    return date instanceof Date ? date.toLocaleString() : String(date);
  });

  // Type verification for demo
  typeInfo = computed(() => {
    const state = this.store() as unknown as AppState;
    const items = state.items;
    const firstItem = items[0];

    return {
      createdAtType:
        state.user.createdAt instanceof Date
          ? 'Date ✓'
          : typeof state.user.createdAt,
      lastModifiedType:
        state.metadata.lastModified instanceof Date
          ? 'Date ✓'
          : typeof state.metadata.lastModified,
      tagsType: Array.isArray(firstItem?.tags)
        ? 'Array ✓'
        : typeof firstItem?.tags,
      itemsIsArray: Array.isArray(items) ? 'Array ✓' : typeof items,
    };
  });

  // Actions
  serializeToJSON(): void {
    const json = this.store.serialize();
    this.serializedOutput.set(json);
    this.lastAction.set('Serialized state to JSON with type markers');
  }

  serializeSimple(): void {
    // toJSON() returns plain object without type markers
    const obj = this.store.toJSON();
    this.serializedOutput.set(JSON.stringify(obj, null, 2));
    this.lastAction.set('Converted to plain JSON (no type preservation)');
  }

  deserializeFromJSON(): void {
    const input = this.importInput();
    if (!input.trim()) {
      this.lastAction.set('Error: No JSON to import');
      return;
    }

    try {
      this.store.deserialize(input);
      this.lastAction.set('Deserialized JSON back into store');
      this.updateMetadata();
    } catch (error) {
      this.lastAction.set(
        `Error: ${error instanceof Error ? error.message : 'Invalid JSON'}`
      );
    }
  }

  loadSampleJSON(): void {
    // Create sample JSON with type markers for demonstration
    const sample = {
      data: {
        user: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          createdAt: { __date__: new Date(2024, 0, 15).toISOString() },
        },
        preferences: {
          theme: 'light',
          language: 'fr',
          notifications: false,
        },
        items: [
          {
            id: 10,
            name: 'Imported Item',
            value: 500,
            tags: ['new', 'featured'],
          },
        ],
        metadata: {
          version: 2,
          lastModified: { __date__: new Date().toISOString() },
        },
      },
      metadata: {
        timestamp: Date.now(),
        version: '1.0.0',
      },
    };
    this.importInput.set(JSON.stringify(sample, null, 2));
    this.lastAction.set('Loaded sample JSON with type markers');
  }

  copyToClipboard(): void {
    const text = this.serializedOutput();
    if (text) {
      navigator.clipboard.writeText(text);
      this.lastAction.set('Copied to clipboard');
    }
  }

  useOutputAsInput(): void {
    const output = this.serializedOutput();
    if (output) {
      this.importInput.set(output);
      this.lastAction.set('Copied serialized output to import field');
    }
  }

  // Update state methods
  updateUserName(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userName.set(target.value);
    this.updateMetadata();
  }

  updateUserEmail(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userEmail.set(target.value);
    this.updateMetadata();
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.theme.set(theme);
    this.updateMetadata();
  }

  toggleNotifications(): void {
    this.notifications.set(!this.notifications());
    this.updateMetadata();
  }

  addItem(): void {
    const currentItems = this.items();
    const newId = Math.max(0, ...currentItems.map((i: ItemType) => i.id)) + 1;
    this.items.set([
      ...currentItems,
      {
        id: newId,
        name: `Item ${newId}`,
        value: Math.floor(Math.random() * 1000),
        tags: ['new'],
      },
    ]);
    this.updateMetadata();
  }

  removeItem(id: number): void {
    this.items.set(this.items().filter((i: ItemType) => i.id !== id));
    this.updateMetadata();
  }

  addTagToItem(id: number, tag: string): void {
    const currentItems = this.items();
    const updated = currentItems.map((item: ItemType) => {
      if (item.id === id) {
        return { ...item, tags: [...item.tags, tag] };
      }
      return item;
    });
    this.items.set(updated);
    this.updateMetadata();
  }

  private updateMetadata(): void {
    this.store.$.metadata.lastModified.set(new Date());
    this.store.$.metadata.version.set(this.metadataVersion() + 1);
  }

  resetToDefaults(): void {
    this.store.$.user.name.set('John Doe');
    this.store.$.user.email.set('john@example.com');
    this.store.$.user.createdAt.set(new Date());
    this.store.$.preferences.theme.set('dark');
    this.store.$.preferences.language.set('en');
    this.store.$.preferences.notifications.set(true);
    this.store.$.items.set([
      { id: 1, name: 'Item One', value: 100, tags: ['important', 'urgent'] },
      { id: 2, name: 'Item Two', value: 250, tags: ['archived'] },
    ]);
    this.store.$.metadata.version.set(1);
    this.store.$.metadata.lastModified.set(new Date());
    this.lastAction.set('Reset to default values');
    this.serializedOutput.set('');
    this.importInput.set('');
  }

  updateImportInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.importInput.set(target.value);
  }

  toggleTypePreservation(): void {
    this.showTypePreservation.set(!this.showTypePreservation());
  }
}
