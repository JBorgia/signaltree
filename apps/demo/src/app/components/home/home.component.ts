import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  features = [
    {
      title: '🏪 Basic Store',
      description:
        'Simple hierarchical signal store with reactive state management',
      route: '/basic-store',
      category: 'Core',
    },
    {
      title: '⚡ Performance',
      description: 'Batched updates, memoization, and performance optimization',
      route: '/performance',
      category: 'Performance',
      methods: [
        'batchUpdate',
        'computed',
        'optimize',
        'clearCache',
        'getMetrics',
      ],
    },
    {
      title: '🔌 Middleware',
      description:
        'Intercept and extend store operations with custom middleware',
      route: '/middleware',
      category: 'Middleware',
      methods: ['addMiddleware', 'removeMiddleware'],
    },
    {
      title: '📦 Entity Management',
      description:
        'CRUD operations and entity helpers for managing collections',
      route: '/entity',
      category: 'Entity',
      methods: [
        'withEntityHelpers',
        'add',
        'update',
        'remove',
        'upsert',
        'findById',
        'findBy',
      ],
    },
    {
      title: '🌐 Async Operations',
      description:
        'Handle async operations with loading states and error management',
      route: '/async',
      category: 'Async',
      methods: ['createAsyncAction'],
    },
    {
      title: '⏰ Time Travel',
      description: 'Undo/redo functionality with state history tracking',
      route: '/time-travel',
      category: 'Time Travel',
      methods: ['undo', 'redo', 'getHistory', 'resetHistory'],
    },
    {
      title: '📝 Form Integration',
      description: 'Two-way binding and form validation with signals',
      route: '/forms',
      category: 'Forms',
    },
    {
      title: '🧪 Testing Utilities',
      description: 'Specialized testing helpers and utilities',
      route: '/testing',
      category: 'Testing',
    },
  ];

  coreFeatures = [
    {
      name: 'Hierarchical State',
      description:
        'Organize state in nested structures with automatic signal creation',
    },
    {
      name: 'Type Safety',
      description:
        'Full TypeScript support with inferred types and autocomplete',
    },
    {
      name: 'Reactive Updates',
      description: 'Built on Angular signals for automatic change detection',
    },
    {
      name: 'Developer Tools',
      description: 'Redux DevTools integration for debugging and inspection',
    },
  ];

  getFeaturesByCategory(category: string) {
    return this.features.filter((f) => f.category === category);
  }

  quickStartCode = `import { signalStore } from '@signal-store';

// Create a basic store
const store = signalStore({
  user: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  settings: {
    theme: 'dark',
    notifications: true
  }
});

// Access nested state
console.log(store.state.user.name()); // 'John Doe'
console.log(store.$.settings.theme()); // 'dark'

// Update state
store.state.user.name.set('Jane Doe');
store.update(current => ({
  ...current,
  settings: { ...current.settings, theme: 'light' }
}));`;
}
