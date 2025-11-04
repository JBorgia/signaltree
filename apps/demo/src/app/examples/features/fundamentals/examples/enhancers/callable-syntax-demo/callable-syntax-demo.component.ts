import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { signalTree } from '@signaltree/core';

// Type definitions for the component
interface User {
  id: number;
  name: string;
  role: string;
}

@Component({
  selector: 'app-callable-syntax-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './callable-syntax-demo.component.html',
  styleUrls: ['./callable-syntax-demo.component.scss'],
})
export class CallableSyntaxDemoComponent {
  activeSection: 'basic' | 'complex' | 'arrays' | 'performance' = 'basic';
  activeTab: 'callable' | 'current' = 'callable';

  // Basic patterns - from test-cases_transformed.ts
  basicProfile = signalTree({
    name: 'John',
    age: 30,
    active: true,
    tags: ['developer', 'typescript'],
    profile: {
      email: 'john@example.com',
      settings: {
        theme: 'dark' as 'light' | 'dark',
        notifications: true,
      },
    },
  });

  // Complex nested object - from test-cases_transformed.ts
  complexTree = signalTree({
    user: {
      id: 1,
      profile: {
        personal: {
          firstName: 'John',
          lastName: 'Doe',
          age: 30,
        },
        professional: {
          title: 'Developer',
          company: 'TechCorp',
          skills: ['JavaScript', 'TypeScript', 'Angular'],
        },
      },
      preferences: {
        ui: {
          theme: 'dark' as 'light' | 'dark',
          language: 'en',
          sidebar: {
            collapsed: false,
            width: 250,
          },
        },
        notifications: {
          email: true,
          push: false,
          frequency: 'daily' as 'never' | 'daily' | 'weekly',
        },
      },
    },
  });

  // Array operations - from test-cases_transformed.ts
  arrayTree = signalTree({
    numbers: [1, 2, 3, 4, 5],
    users: [
      {
        id: 1,
        name: 'Alice',
        role: 'admin',
      },
      {
        id: 2,
        name: 'Bob',
        role: 'user',
      },
    ],
    nested: {
      matrix: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      collections: {
        tags: ['red', 'blue', 'green'],
        categories: ['work', 'personal'],
      },
    },
  });

  // Performance demo
  performanceDemo = signalTree({
    counter: 0,
    batchCount: 0,
    lastUpdate: new Date(),
    updateHistory: [] as string[],
  });

  // Stress test
  stressTest = signalTree({
    operations: 0,
    deep: {
      level1: {
        level2: {
          level3: {
            value: 'initial',
          },
        },
      },
    },
    largeArray: [] as number[],
  });

  // Basic Pattern Methods (using callable syntax - shows TS errors until transformed)
  updateBasicProfile() {
    const names = ['John', 'Jane', 'Alex', 'Sam'];
    const currentName = this.basicProfile.$.name();
    const nextName = names[(names.indexOf(currentName) + 1) % names.length];

    // Using regular syntax for now since transform isn't active
    this.basicProfile.$.name.set(nextName);
  }

  incrementAge() {
    this.basicProfile.$.age.update((current: number) => current + 1);
  }

  addTag() {
    const newTags = ['react', 'vue', 'svelte', 'node', 'python'];
    const randomTag = newTags[Math.floor(Math.random() * newTags.length)];
    this.basicProfile.$.tags.update((current: string[]) => [
      ...current,
      randomTag,
    ]);
  }

  toggleTheme() {
    this.basicProfile.$.profile.settings.theme.update(
      (current: 'light' | 'dark') => (current === 'dark' ? 'light' : 'dark')
    );
  }

  updateEmail() {
    const emails = ['john@example.com', 'jane@test.com', 'user@demo.com'];
    const current = this.basicProfile.$.profile.email();
    const next = emails[(emails.indexOf(current) + 1) % emails.length];
    this.basicProfile.$.profile.email.set(next);
  }

  toggleNotifications() {
    this.basicProfile.$.profile.settings.notifications.update(
      (current: boolean) => !current
    );
  }

  // Complex Object Methods
  updateProfessional() {
    const titles = [
      'Developer',
      'Senior Developer',
      'Lead Developer',
      'Principal Developer',
    ];
    const current = this.complexTree.$.user.profile.professional.title();
    const next = titles[(titles.indexOf(current) + 1) % titles.length];
    this.complexTree.$.user.profile.professional.title.set(next);
  }

  addSkill() {
    const skills = ['React', 'Vue', 'Node.js', 'Python', 'Rust', 'Go'];
    const randomSkill = skills[Math.floor(Math.random() * skills.length)];
    this.complexTree.$.user.profile.professional.skills.update(
      (current: string[]) => [...current, randomSkill]
    );
  }

  agePerson() {
    this.complexTree.$.user.profile.personal.age.update(
      (current: number) => current + 1
    );
  }

  toggleComplexTheme() {
    this.complexTree.$.user.preferences.ui.theme.update(
      (current: 'light' | 'dark') => (current === 'dark' ? 'light' : 'dark')
    );
  }

  toggleSidebar() {
    this.complexTree.$.user.preferences.ui.sidebar.collapsed.update(
      (current: boolean) => !current
    );
  }

  changeNotificationFreq() {
    const frequencies = ['never', 'daily', 'weekly'] as const;
    const current =
      this.complexTree.$.user.preferences.notifications.frequency();
    const next =
      frequencies[(frequencies.indexOf(current) + 1) % frequencies.length];
    this.complexTree.$.user.preferences.notifications.frequency.set(next);
  }

  // Array Operation Methods
  replaceNumbers() {
    this.arrayTree.$.numbers.set([10, 20, 30]);
  }

  addNumbers() {
    this.arrayTree.$.numbers.update((current: number[]) => [
      ...current,
      40,
      50,
    ]);
  }

  filterNumbers() {
    this.arrayTree.$.numbers.update((current: number[]) =>
      current.filter((n) => n > 25)
    );
  }

  addUser() {
    const names = ['Charlie', 'David', 'Emma', 'Frank'];
    const roles = ['user', 'admin', 'moderator'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomRole = roles[Math.floor(Math.random() * roles.length)];

    const currentUsers = this.arrayTree.$.users();
    const nextId = Math.max(...currentUsers.map((u: User) => u.id)) + 1;

    this.arrayTree.$.users.update((current: User[]) => [
      ...current,
      {
        id: nextId,
        name: randomName,
        role: randomRole,
      },
    ]);
  }

  promoteUser() {
    this.arrayTree.$.users.update((current: User[]) =>
      current.map((user: User, index: number) =>
        index === 0
          ? { ...user, role: user.role === 'admin' ? 'user' : 'admin' }
          : user
      )
    );
  }

  addMatrixTag() {
    const colors = ['yellow', 'purple', 'orange', 'pink', 'cyan'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    this.arrayTree.$.nested.collections.tags.update((current: string[]) => [
      ...current,
      randomColor,
    ]);
  }

  sortTags() {
    this.arrayTree.$.nested.collections.tags.update((current: string[]) =>
      [...current].sort()
    );
  }

  addMatrixRow() {
    this.arrayTree.$.nested.matrix.update((current: number[][]) => {
      const nextRow = [current.length * 2 + 1, current.length * 2 + 2];
      return [...current, nextRow];
    });
  }

  // Performance Methods
  incrementCounter() {
    this.performanceDemo.$.counter.update((c: number) => c + 1);
    this.performanceDemo.$.lastUpdate.set(new Date());
    this.performanceDemo.$.updateHistory.update((history: string[]) => [
      ...history,
      `Counter: ${this.performanceDemo.$.counter() + 1}`,
    ]);
  }

  batchUpdate() {
    this.performanceDemo.$.counter.update((c: number) => c + 100);
    this.performanceDemo.$.batchCount.update((b: number) => b + 1);
    this.performanceDemo.$.lastUpdate.set(new Date());
    this.performanceDemo.$.updateHistory.update((history: string[]) => [
      ...history,
      `Batch +100: ${this.performanceDemo.$.counter() + 100}`,
    ]);
  }

  resetCounter() {
    this.performanceDemo.$.counter.set(0);
    this.performanceDemo.$.batchCount.set(0);
    this.performanceDemo.$.lastUpdate.set(new Date());
    this.performanceDemo.$.updateHistory.set([]);
  }

  runStressTest() {
    this.stressTest.$.operations.update((ops: number) => ops + 1000);
  }

  updateDeepValue() {
    const values = ['updated', 'modified', 'changed', 'transformed'];
    const randomValue = values[Math.floor(Math.random() * values.length)];
    this.stressTest.$.deep.level1.level2.level3.value.set(randomValue);
  }

  growArray() {
    this.stressTest.$.largeArray.update((current: number[]) => [
      ...current,
      ...Array.from({ length: 100 }, (_, i) => current.length + i),
    ]);
  }

  // Helper methods
  getSum(): number {
    return this.arrayTree.$.numbers().reduce(
      (sum: number, n: number) => sum + n,
      0
    );
  }

  trackUser(index: number, user: User): number {
    return user.id;
  }

  trackRow(index: number): number {
    return index;
  }
}
