# SignalTree Examples

## Basic Usage Examples

### Simple Counter

```typescript
const counterTree = signalTree({
  count: 0,
  step: 1,
});

// Read values
console.log(counterTree.$.count()); // 0

// Update single property
counterTree.$.count.set(5);
counterTree.$.step.set(2);

// Update with function
counterTree.update((state) => ({
  count: state.count + state.step,
}));
```

### User Management

```typescript
const userTree = signalTree({
  user: {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    profile: {
      bio: 'Developer',
      avatar: 'avatar.jpg',
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    },
  },
  isLoading: false,
  lastUpdated: new Date(),
});

// Deep property access with full type safety
userTree.$.user.profile.preferences.theme.set('light');
userTree.$.user.name.set('Jane Doe');

// Nested updates
userTree.update((state) => ({
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      bio: 'Senior Developer',
    },
  },
  lastUpdated: new Date(),
}));
```

### Todo List

```typescript
interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const todoTree = signalTree({
  todos: [] as Todo[],
  filter: 'all' as 'all' | 'active' | 'completed',
  newTodoText: '',
});

// Add new todo
todoTree.update((state) => ({
  todos: [
    ...state.todos,
    {
      id: Date.now(),
      text: state.newTodoText,
      completed: false,
    },
  ],
  newTodoText: '',
}));

// Toggle todo
const toggleTodo = (id: number) => {
  todoTree.update((state) => ({
    todos: state.todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)),
  }));
};

// Filter todos
const filteredTodos = computed(() => {
  const state = todoTree.unwrap();
  switch (state.filter) {
    case 'active':
      return state.todos.filter((todo) => !todo.completed);
    case 'completed':
      return state.todos.filter((todo) => todo.completed);
    default:
      return state.todos;
  }
});
```

## Advanced Examples

### Shopping Cart

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
}

interface CartItem extends Product {
  quantity: number;
}

const cartTree = signalTree({
  items: [] as CartItem[],
  total: 0,
  discount: 0,
  shipping: 0,
  currency: 'USD',
});

// Computed values
const subtotal = computed(() => cartTree.$.items().reduce((sum, item) => sum + item.price * item.quantity, 0));

const finalTotal = computed(() => {
  const state = cartTree.unwrap();
  return subtotal() - state.discount + state.shipping;
});

// Add item to cart
const addToCart = (product: Product) => {
  cartTree.update((state) => {
    const existing = state.items.find((item) => item.id === product.id);

    if (existing) {
      return {
        items: state.items.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)),
      };
    }

    return {
      items: [...state.items, { ...product, quantity: 1 }],
    };
  });
};
```

### Form State Management

```typescript
interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  preferences: {
    newsletter: boolean;
    notifications: boolean;
  };
}

const formTree = signalTree({
  data: {
    firstName: '',
    lastName: '',
    email: '',
    age: 0,
    preferences: {
      newsletter: false,
      notifications: true,
    },
  } as FormData,
  errors: {} as Partial<Record<keyof FormData, string>>,
  isValid: false,
  isSubmitting: false,
});

// Form validation
const validateForm = () => {
  const state = formTree.unwrap();
  const errors: Partial<Record<keyof FormData, string>> = {};

  if (!state.data.firstName) errors.firstName = 'Required';
  if (!state.data.lastName) errors.lastName = 'Required';
  if (!state.data.email.includes('@')) errors.email = 'Invalid email';
  if (state.data.age < 18) errors.age = 'Must be 18+';

  formTree.update(() => ({
    errors,
    isValid: Object.keys(errors).length === 0,
  }));
};

// Form submission
const submitForm = async () => {
  formTree.$.isSubmitting.set(true);

  try {
    const formData = formTree.$.data();
    await api.submitForm(formData);

    // Reset form on success
    formTree.update(() => ({
      data: {
        firstName: '',
        lastName: '',
        email: '',
        age: 0,
        preferences: { newsletter: false, notifications: true },
      },
      errors: {},
      isValid: false,
    }));
  } catch (error) {
    console.error('Form submission failed:', error);
  } finally {
    formTree.$.isSubmitting.set(false);
  }
};
```

## Framework Integration Examples

### Angular Component

```typescript
@Component({
  selector: 'app-user-profile',
  template: `
    <div>
      <h1>{{ userTree.$.user.name() }}</h1>
      <p>{{ userTree.$.user.email() }}</p>

      <button (click)="updateProfile()">Update Profile</button>

      <div *ngIf="userTree.$.isLoading()">Loading...</div>
    </div>
  `,
})
export class UserProfileComponent {
  userTree = signalTree({
    user: { name: '', email: '' },
    isLoading: false,
  });

  updateProfile() {
    this.userTree.$.isLoading.set(true);

    // Simulate API call
    setTimeout(() => {
      this.userTree.update((state) => ({
        user: {
          ...state.user,
          name: 'Updated Name',
        },
        isLoading: false,
      }));
    }, 1000);
  }
}
```

### React-like Usage (with adapter)

```typescript
// Custom hook adapter for React-like usage
function useSignalTree<T>(initialState: T) {
  const tree = useMemo(() => signalTree(initialState), []);

  // Re-render when state changes
  useEffect(() => {
    return tree.subscribe(() => {
      // Trigger re-render
      forceUpdate();
    });
  }, [tree]);

  return tree;
}

// Usage in component
function UserComponent() {
  const userTree = useSignalTree({
    name: 'John',
    age: 30,
  });

  return (
    <div>
      <h1>{userTree.$.name()}</h1>
      <p>Age: {userTree.$.age()}</p>

      <button onClick={() => userTree.$.age.set(userTree.$.age() + 1)}>Increment Age</button>
    </div>
  );
}
```

## Performance Examples

### Large Dataset Handling

```typescript
// Lazy loading for large datasets
const dataTree = signalTree({
  users: new Array(10000).fill(null).map((_, i) => ({
    id: i,
    name: `User ${i}`,
    active: Math.random() > 0.5,
  })),
  currentPage: 0,
  pageSize: 100,
});

// Only access what you need
const currentPageUsers = computed(() => {
  const state = dataTree.unwrap();
  const start = state.currentPage * state.pageSize;
  const end = start + state.pageSize;
  return state.users.slice(start, end);
});
```

### Optimized Updates

```typescript
// Batch updates for better performance
const gameTree = signalTree({
  score: 0,
  level: 1,
  lives: 3,
  powerUps: [] as string[],
});

// Single update instead of multiple
const levelUp = () => {
  gameTree.update((state) => ({
    level: state.level + 1,
    lives: state.lives + 1,
    score: state.score + 1000,
    powerUps: [...state.powerUps, 'speed-boost'],
  }));
};
```

## See Also

- [API Reference](../api/signal-tree.md)
- [Core Concepts](../core-concepts.md)
- [Performance Guide](../performance.md)
