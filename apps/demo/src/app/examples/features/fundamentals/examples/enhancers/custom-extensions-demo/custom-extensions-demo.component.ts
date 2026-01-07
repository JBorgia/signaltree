import { CommonModule } from '@angular/common';
import { Component, Signal, signal, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { registerMarkerProcessor, signalTree } from '@signaltree/core';

import type { ISignalTree } from '@signaltree/core';

// =============================================================================
// CUSTOM MARKER EXAMPLE: validated() marker
// =============================================================================

/**
 * Step 1: Define a unique symbol for the marker
 * Using Symbol() ensures no accidental collisions with other markers
 */
const VALIDATED_MARKER = Symbol('VALIDATED_MARKER');

/**
 * Step 2: Define the marker interface (placeholder in state)
 * This is what you put in your initial state definition
 */
export interface ValidatedMarker<T> {
  [VALIDATED_MARKER]: true;
  defaultValue: T;
  validator: (value: T) => string | null; // Returns error message or null
}

/**
 * Step 3: Define the materialized interface (what it becomes at runtime)
 * This is the API users interact with after tree finalization
 */
export interface ValidatedSignal<T> {
  /** Get current value */
  (): T;
  /** Current value as signal */
  value: WritableSignal<T>;
  /** Validation error (null if valid) */
  error: Signal<string | null>;
  /** Is the current value valid? */
  isValid: Signal<boolean>;
  /** Set value (also triggers validation) */
  set(value: T): void;
  /** Update value with function */
  update(fn: (current: T) => T): void;
  /** Reset to default value */
  reset(): void;
}

/**
 * Step 4: Create the marker factory function
 * This is what users call in their state definition
 */
export function validated<T>(
  defaultValue: T,
  validator: (value: NoInfer<T>) => string | null
): ValidatedMarker<T> {
  return {
    [VALIDATED_MARKER]: true,
    defaultValue,
    validator: validator as (value: T) => string | null,
  };
}

/**
 * Step 5: Create the type guard
 * Used by the marker processor to identify this marker type
 */
export function isValidatedMarker(
  value: unknown
): value is ValidatedMarker<unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      VALIDATED_MARKER in value &&
      (value as Record<symbol, unknown>)[VALIDATED_MARKER] === true
  );
}

/**
 * Step 6: Create the materializer function
 * Converts the marker placeholder into the actual runtime object
 */
export function createValidatedSignal<T>(
  marker: ValidatedMarker<T>
): ValidatedSignal<T> {
  const valueSignal = signal<T>(marker.defaultValue);
  const errorSignal = signal<string | null>(
    marker.validator(marker.defaultValue)
  );

  // Create the callable signal interface
  const validatedSignal = (() => valueSignal()) as ValidatedSignal<T>;

  // Attach the value signal
  Object.defineProperty(validatedSignal, 'value', {
    value: valueSignal,
    writable: false,
  });

  // Computed error signal
  Object.defineProperty(validatedSignal, 'error', {
    get: () => errorSignal.asReadonly(),
  });

  // Computed isValid signal
  const isValidSignal = signal(errorSignal() === null);
  Object.defineProperty(validatedSignal, 'isValid', {
    get: () => isValidSignal.asReadonly(),
  });

  // Set method with validation
  validatedSignal.set = (value: T) => {
    valueSignal.set(value);
    const error = marker.validator(value);
    errorSignal.set(error);
    isValidSignal.set(error === null);
  };

  // Update method with validation
  validatedSignal.update = (fn: (current: T) => T) => {
    const newValue = fn(valueSignal());
    validatedSignal.set(newValue);
  };

  // Reset method
  validatedSignal.reset = () => {
    validatedSignal.set(marker.defaultValue);
  };

  return validatedSignal;
}

/**
 * Step 7: Register the marker processor
 * This connects the type guard to the materializer
 * NOTE: In a real app, call this once at app startup (e.g., in main.ts)
 */
registerMarkerProcessor(isValidatedMarker, (marker) =>
  createValidatedSignal(marker)
);

// =============================================================================
// CUSTOM ENHANCER EXAMPLE: withLogger() enhancer
// =============================================================================

/**
 * Step 1: Define the interface for what the enhancer adds
 */
export interface WithLogger {
  /** Log a message to the history */
  log(message: string): void;
  /** Get all logged messages */
  history: Signal<string[]>;
  /** Clear all logs */
  clearLogs(): void;
}

/**
 * Step 2: Create the enhancer factory
 * Pattern: (config?) => <T>(tree) => tree & AddedMethods
 */
export function withLogger(config?: { maxHistory?: number }) {
  const maxHistory = config?.maxHistory ?? 100;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & WithLogger => {
    const historySignal = signal<string[]>([]);

    const log = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      historySignal.update((h) => {
        const newHistory = [...h, `[${timestamp}] ${message}`];
        // Trim to max history
        return newHistory.slice(-maxHistory);
      });
    };

    const clearLogs = () => {
      historySignal.set([]);
    };

    // Return tree with added methods
    return Object.assign(tree, {
      log,
      history: historySignal.asReadonly(),
      clearLogs,
    });
  };
}

// =============================================================================
// DEMO COMPONENT
// =============================================================================

/**
 * State interface showing the custom validated marker in use
 */
interface DemoState {
  // Regular signal
  counter: number;

  // Custom validated marker - will be materialized to ValidatedSignal<string>
  username: ValidatedMarker<string>;
  email: ValidatedMarker<string>;
  age: ValidatedMarker<number>;
}

// Validators
const usernameValidator = (value: string): string | null => {
  if (value.length < 3) return 'Username must be at least 3 characters';
  if (value.length > 20) return 'Username must be at most 20 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(value))
    return 'Username can only contain letters, numbers, and underscores';
  return null;
};

const emailValidator = (value: string): string | null => {
  if (!value) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format';
  return null;
};

const ageValidator = (value: number): string | null => {
  if (value < 0) return 'Age cannot be negative';
  if (value > 150) return 'Please enter a realistic age';
  if (!Number.isInteger(value)) return 'Age must be a whole number';
  return null;
};

@Component({
  selector: 'app-custom-extensions-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-extensions-demo.component.html',
  styleUrls: ['./custom-extensions-demo.component.scss'],
})
export class CustomExtensionsDemoComponent {
  // Create tree with custom marker and custom enhancer
  store = signalTree<DemoState>({
    counter: 0,
    username: validated('', usernameValidator),
    email: validated('', emailValidator),
    age: validated(25, ageValidator),
  }).with(withLogger({ maxHistory: 50 }));

  // Form binding helpers
  usernameInput = '';
  emailInput = '';
  ageInput = 25;

  // Track last action for UI feedback
  lastAction = signal('Tree initialized');

  // Getters for template access - cast to materialized types
  get username(): ValidatedSignal<string> {
    return this.store.$.username as unknown as ValidatedSignal<string>;
  }

  get email(): ValidatedSignal<string> {
    return this.store.$.email as unknown as ValidatedSignal<string>;
  }

  get age(): ValidatedSignal<number> {
    return this.store.$.age as unknown as ValidatedSignal<number>;
  }

  get history(): Signal<string[]> {
    return this.store.history;
  }

  constructor() {
    // Initialize inputs from store
    this.usernameInput = this.username();
    this.emailInput = this.email();
    this.ageInput = this.age();

    // Log initial state
    this.store.log('Demo component initialized');
  }

  // Actions
  updateUsername() {
    this.username.set(this.usernameInput);
    this.store.log(`Username updated to: "${this.usernameInput}"`);
    this.lastAction.set(`Set username to "${this.usernameInput}"`);
  }

  updateEmail() {
    this.email.set(this.emailInput);
    this.store.log(`Email updated to: "${this.emailInput}"`);
    this.lastAction.set(`Set email to "${this.emailInput}"`);
  }

  updateAge() {
    this.age.set(this.ageInput);
    this.store.log(`Age updated to: ${this.ageInput}`);
    this.lastAction.set(`Set age to ${this.ageInput}`);
  }

  incrementCounter() {
    this.store.$.counter.update((c) => c + 1);
    this.store.log(`Counter incremented to ${this.store.$.counter()}`);
    this.lastAction.set('Incremented counter');
  }

  resetAll() {
    this.username.reset();
    this.email.reset();
    this.age.reset();
    this.store.$.counter.set(0);

    // Sync inputs
    this.usernameInput = this.username();
    this.emailInput = this.email();
    this.ageInput = this.age();

    this.store.log('All fields reset to defaults');
    this.lastAction.set('Reset all fields');
  }

  clearLogs() {
    this.store.clearLogs();
    this.lastAction.set('Cleared log history');
  }

  // Code examples for display
  readonly markerCode = `// 1. Define symbol and marker type
const VALIDATED_MARKER = Symbol('VALIDATED_MARKER');

export interface ValidatedMarker<T> {
  [VALIDATED_MARKER]: true;
  defaultValue: T;
  validator: (value: T) => string | null;
}

// 2. Create marker factory
export function validated<T>(
  defaultValue: T,
  validator: (value: T) => string | null
): ValidatedMarker<T> {
  return { [VALIDATED_MARKER]: true, defaultValue, validator };
}

// 3. Type guard
export function isValidatedMarker(value: unknown): value is ValidatedMarker<unknown> {
  return Boolean(value && typeof value === 'object' &&
    VALIDATED_MARKER in value && (value as any)[VALIDATED_MARKER] === true);
}

// 4. Materializer
export function createValidatedSignal<T>(marker: ValidatedMarker<T>): ValidatedSignal<T> {
  const valueSignal = signal(marker.defaultValue);
  const errorSignal = signal<string | null>(marker.validator(marker.defaultValue));
  // ... build the ValidatedSignal API
  return validatedSignal;
}

// 5. Register (call once at app startup)
registerMarkerProcessor(isValidatedMarker, createValidatedSignal);`;

  readonly enhancerCode = `// 1. Define interface for added methods
export interface WithLogger {
  log(message: string): void;
  history: Signal<string[]>;
  clearLogs(): void;
}

// 2. Create enhancer factory
export function withLogger(config?: { maxHistory?: number }) {
  const maxHistory = config?.maxHistory ?? 100;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & WithLogger => {
    const historySignal = signal<string[]>([]);

    const log = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      historySignal.update(h => [...h, \`[\${timestamp}] \${message}\`].slice(-maxHistory));
    };

    return Object.assign(tree, {
      log,
      history: historySignal.asReadonly(),
      clearLogs: () => historySignal.set([]),
    });
  };
}`;

  readonly usageCode = `// Use custom marker and enhancer together
const store = signalTree({
  username: validated('', usernameValidator),
  email: validated('', emailValidator),
}).with(withLogger());

// Marker API (after materialization)
store.$.username.set('alice');
store.$.username.isValid();  // true
store.$.username.error();    // null

store.$.email.set('invalid');
store.$.email.isValid();     // false
store.$.email.error();       // 'Invalid email format'

// Enhancer API
store.log('User updated profile');
store.history();  // ['[12:34:56] User updated profile']`;
}
