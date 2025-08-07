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

  updateProfile() {
    // Example of updating nested properties using the tree's update method
    this.userTree.update((current) => ({
      ...current,
      profile: {
        ...current.profile,
        firstName: current.profile.firstName.toUpperCase(),
        lastName: current.profile.lastName.toUpperCase(),
      },
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
        street: '',
        city: '',
        state: '',
        zipCode: '',
      },
      preferences: {
        newsletter: false,
        marketing: false,
        updates: false,
      },
    }));
  }

  loadSampleData() {
    this.userTree.update(() => ({
      profile: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice.johnson@company.com',
        avatar: 'https://avatars.githubusercontent.com/u/2?v=4',
      },
      settings: {
        theme: 'dark',
        notifications: false,
        language: 'es',
        timezone: 'America/Los_Angeles',
      },
      address: {
        street: '456 Oak Avenue',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90210',
      },
      preferences: {
        newsletter: true,
        marketing: true,
        updates: false,
      },
    }));
  }

  toggleTheme() {
    const currentTheme = this.userTree.state.settings.theme();
    this.userTree.state.settings.theme.set(
      currentTheme === 'light' ? 'dark' : 'light'
    );
  }

  getFullName(): string {
    const firstName = this.userTree.state.profile.firstName();
    const lastName = this.userTree.state.profile.lastName();
    return `${firstName} ${lastName}`.trim();
  }

  getCityState(): string {
    const city = this.userTree.state.address.city();
    const state = this.userTree.state.address.state();
    return `${city}, ${state}`.replace(', ,', '').replace(',  ', ', ').trim();
  }

  getFullAddress(): string {
    const street = this.userTree.state.address.street();
    const cityState = this.getCityState();
    const zipCode = this.userTree.state.address.zipCode();

    const parts = [street, cityState, zipCode].filter((part) => part.trim());
    return parts.join(', ');
  }

  getTotalProperties(): number {
    const data = this.userTree.unwrap();

    function countProperties(obj: unknown): number {
      if (obj && typeof obj === 'object') {
        let localCount = 0;
        for (const value of Object.values(obj)) {
          if (value && typeof value === 'object') {
            localCount += countProperties(value);
          } else {
            localCount += 1;
          }
        }
        return localCount;
      }
      return 1;
    }

    return countProperties(data);
  }

  getBooleanCount(): number {
    const data = this.userTree.unwrap();

    function countBooleans(obj: unknown): number {
      if (obj && typeof obj === 'object') {
        let localCount = 0;
        for (const value of Object.values(obj)) {
          if (typeof value === 'boolean') {
            localCount += 1;
          } else if (value && typeof value === 'object') {
            localCount += countBooleans(value);
          }
        }
        return localCount;
      }
      return 0;
    }

    return countBooleans(data);
  }

  getStringCount(): number {
    const data = this.userTree.unwrap();

    function countStrings(obj: unknown): number {
      if (obj && typeof obj === 'object') {
        let localCount = 0;
        for (const value of Object.values(obj)) {
          if (typeof value === 'string') {
            localCount += 1;
          } else if (value && typeof value === 'object') {
            localCount += countStrings(value);
          }
        }
        return localCount;
      }
      return 0;
    }

    return countStrings(data);
  }

  codeExample = `// Create a nested signal tree
const userTree = signalTree<UserData>({
  profile: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    avatar: 'https://...'
  },
  settings: {
    theme: 'light',
    notifications: true,
    language: 'en',
    timezone: 'America/New_York'
  },
  address: {
    street: '123 Main Street',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102'
  }
});

// Access nested signals directly
console.log(userTree.state.profile.firstName()); // 'John'
console.log(userTree.state.settings.theme());    // 'light'
console.log(userTree.state.address.city());      // 'San Francisco'

// Update individual nested properties
userTree.state.profile.firstName.set('Jane');
userTree.state.settings.theme.set('dark');

// Update entire nested objects
userTree.state.address.update(addr => ({
  ...addr,
  city: 'Los Angeles',
  state: 'CA'
}));

// Update multiple nested properties
userTree.update(state => ({
  ...state,
  profile: {
    ...state.profile,
    firstName: 'Alice'
  },
  settings: {
    ...state.settings,
    theme: 'dark'
  }
}));`;
}
