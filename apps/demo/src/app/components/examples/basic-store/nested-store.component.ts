import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signal-tree';

interface Address extends Record<string, unknown> {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

interface UserProfile extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
}

interface UserSettings extends Record<string, unknown> {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
  timezone: string;
}

interface UserData extends Record<string, unknown> {
  profile: UserProfile;
  settings: UserSettings;
  address: Address;
  preferences: {
    newsletter: boolean;
    marketing: boolean;
    updates: boolean;
  };
}

@Component({
  selector: 'app-nested-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nested-store.component.html',
  styleUrls: ['./nested-store.component.scss'],
})
export class NestedTreeComponent {
  // Smart progressive enhancement - complex nested structures work immediately!
  userTree = signalTree<UserData>({
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      avatar: 'https://avatars.githubusercontent.com/u/1?v=4',
    },
    settings: {
      theme: 'light',
      notifications: true,
      language: 'en',
      timezone: 'America/New_York',
    },
    address: {
      street: '123 Main Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
    },
    preferences: {
      newsletter: true,
      marketing: false,
      updates: true,
    },
  });

  updateLog: Array<{ timestamp: Date; action: string; path: string }> = [];

  constructor() {
    this.logAction(
      'Nested tree initialized with smart progressive enhancement',
      ''
    );
  }

  // Direct signal access with $ shorthand
  updateFirstName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.userTree.$.profile.firstName.set(target.value);
    this.logAction('First name updated', 'profile.firstName');
  }

  updateLastName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.userTree.$.profile.lastName.set(target.value);
    this.logAction('Last name updated', 'profile.lastName');
  }

  updateEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.userTree.$.profile.email.set(target.value);
    this.logAction('Email updated', 'profile.email');
  }

  toggleTheme() {
    const currentTheme = this.userTree.$.settings.theme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    this.userTree.$.settings.theme.set(newTheme);
    this.logAction('Theme toggled', 'settings.theme');
  }

  toggleNotifications() {
    this.userTree.$.settings.notifications.update((current) => !current);
    this.logAction('Notifications toggled', 'settings.notifications');
  }

  // Batch update example with auto-enabling
  updateProfileBatch() {
    this.userTree.batchUpdate(() => {
      this.userTree.$.profile.firstName.set(
        this.userTree.$.profile.firstName().toUpperCase()
      );
      this.userTree.$.profile.lastName.set(
        this.userTree.$.profile.lastName().toUpperCase()
      );
      this.userTree.$.profile.email.set(
        this.userTree.$.profile.email().toLowerCase()
      );
    });
    this.logAction('Profile batch updated', 'profile.*');
  }

  // Memoized computed values
  get fullName() {
    return this.userTree.memoize(
      'fullName',
      () =>
        `${this.userTree.$.profile.firstName()} ${this.userTree.$.profile.lastName()}`
    );
  }

  get userSummary() {
    return this.userTree.memoize('userSummary', () => ({
      name: this.fullName(),
      email: this.userTree.$.profile.email(),
      theme: this.userTree.$.settings.theme(),
      location: `${this.userTree.$.address.city()}, ${this.userTree.$.address.state()}`,
    }));
  }

  resetToDefaults() {
    this.userTree.update(() => ({
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        avatar: 'https://avatars.githubusercontent.com/u/1?v=4',
      },
      settings: {
        theme: 'light',
        notifications: true,
        language: 'en',
        timezone: 'UTC',
      },
      address: {
        street: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94102',
      },
      preferences: {
        newsletter: true,
        marketing: false,
        updates: true,
      },
    }));
    this.logAction('Reset to defaults', 'all');
  }

  loadSampleData() {
    this.userTree.batchUpdate(() => {
      this.userTree.$.profile.firstName.set('Alice');
      this.userTree.$.profile.lastName.set('Johnson');
      this.userTree.$.profile.email.set('alice.johnson@company.com');
      this.userTree.$.settings.theme.set('dark');
      this.userTree.$.settings.notifications.set(false);
      this.userTree.$.address.city.set('Los Angeles');
      this.userTree.$.address.state.set('CA');
    });
    this.logAction('Sample data loaded with batch update', 'multiple');
  }

  // Clear memoized cache
  clearCache() {
    this.userTree.clearCache();
    this.logAction('Cache cleared', 'cache');
  }

  // Get metrics to see auto-enabled features
  getMetrics() {
    const metrics = this.userTree.getMetrics();
    this.logAction('Metrics retrieved', 'metrics');
    return metrics;
  }

  private logAction(action: string, path: string) {
    this.updateLog.unshift({
      timestamp: new Date(),
      action,
      path,
    });

    // Keep only last 15 entries
    if (this.updateLog.length > 15) {
      this.updateLog = this.updateLog.slice(0, 15);
    }
  }

  clearLog() {
    this.updateLog = [];
  }

  trackByIndex(index: number): number {
    return index;
  }

  codeExample = `// Nested structures with smart progressive enhancement
const userTree = signalTree<UserData>({
  profile: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com'
  },
  settings: {
    theme: 'light',
    notifications: true
  },
  address: {
    street: '123 Main Street',
    city: 'San Francisco',
    state: 'CA'
  }
});

// Direct access with $ shorthand - auto-enabling!
console.log(userTree.$.profile.firstName()); // 'John'
console.log(userTree.$.settings.theme());    // 'light'

// Update nested properties directly
userTree.$.profile.firstName.set('Jane');
userTree.$.settings.theme.set('dark');

// Batch updates auto-enable
userTree.batchUpdate(() => {
  userTree.$.profile.firstName.set('Alice');
  userTree.$.profile.lastName.set('Smith');
  userTree.$.settings.notifications.set(false);
});

// Memoized computed values
const fullName = userTree.memoize('fullName', () =>
  userTree.$.profile.firstName() + ' ' + userTree.$.profile.lastName()
);

// All features work immediately - no configuration!`;
}
