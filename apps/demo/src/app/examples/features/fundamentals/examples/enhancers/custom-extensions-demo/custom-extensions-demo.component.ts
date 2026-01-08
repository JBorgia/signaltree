import { CommonModule } from '@angular/common';
import { Component, computed, Signal, signal, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ISignalTree, registerMarkerProcessor, signalTree } from '@signaltree/core';

// =============================================================================
// PART 1: CUSTOM MARKER - validated() with real-time validation
// =============================================================================

// 1. Define unique symbol for marker identification
const VALIDATED_MARKER = Symbol('VALIDATED_MARKER');

// 2. Marker interface - the placeholder in state definition
export interface ValidatedMarker<T> {
  [VALIDATED_MARKER]: true;
  defaultValue: T;
  validator: (value: T) => string | null;
}

// 3. Materialized interface - what the marker becomes after tree creation
export interface ValidatedSignal<T> {
  (): T;
  value: WritableSignal<T>;
  error: Signal<string | null>;
  isValid: Signal<boolean>;
  set(value: T): void;
  update(fn: (current: T) => T): void;
  reset(): void;
}

// 4. Marker factory function
export function validated<T>(
  defaultValue: T,
  validator: (value: T) => string | null
): ValidatedMarker<T> {
  return { [VALIDATED_MARKER]: true, defaultValue, validator };
}

// 5. Type guard for marker detection
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

// 6. Materializer - creates the actual signal structure
export function createValidatedSignal<T>(
  marker: ValidatedMarker<T>
): ValidatedSignal<T> {
  const valueSignal = signal<T>(marker.defaultValue);
  const errorSignal = signal<string | null>(
    marker.validator(marker.defaultValue)
  );
  const isValidSignal = computed(() => errorSignal() === null);

  // Create callable function that returns current value
  const validatedSignal = (() => valueSignal()) as ValidatedSignal<T>;

  // Attach properties
  Object.defineProperty(validatedSignal, 'value', {
    value: valueSignal,
    writable: false,
    enumerable: true,
  });

  Object.defineProperty(validatedSignal, 'error', {
    get: () => errorSignal.asReadonly(),
    enumerable: true,
  });

  Object.defineProperty(validatedSignal, 'isValid', {
    get: () => isValidSignal,
    enumerable: true,
  });

  // Attach methods
  validatedSignal.set = (value: T) => {
    valueSignal.set(value);
    errorSignal.set(marker.validator(value));
  };

  validatedSignal.update = (fn: (current: T) => T) => {
    const newValue = fn(valueSignal());
    validatedSignal.set(newValue);
  };

  validatedSignal.reset = () => validatedSignal.set(marker.defaultValue);

  return validatedSignal;
}

// 7. Register the marker processor (called once at startup)
registerMarkerProcessor(isValidatedMarker, createValidatedSignal);

// =============================================================================
// PART 2: CUSTOM ENHANCER - withAnalytics() for tracking state changes
// =============================================================================

// 1. Interface for what the enhancer adds to the tree
export interface AnalyticsEvent {
  type: 'state_change' | 'action' | 'custom';
  path?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface WithAnalytics {
  trackEvent(
    type: AnalyticsEvent['type'],
    data?: Record<string, unknown>
  ): void;
  events: Signal<AnalyticsEvent[]>;
  clearEvents(): void;
  eventCount: Signal<number>;
  lastEvent: Signal<AnalyticsEvent | null>;
}

// 2. Configuration interface
export interface AnalyticsConfig {
  maxEvents?: number;
  enabled?: boolean;
}

// 3. Enhancer factory function - returns enhancer directly (like batching())
export function withAnalytics(
  config: AnalyticsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & WithAnalytics {
  const maxEvents = config.maxEvents ?? 100;
  const enabled = config.enabled ?? true;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & WithAnalytics => {
    if (!enabled) {
      // Return no-op implementation if disabled
      const noopEvents = signal<AnalyticsEvent[]>([]);
      return Object.assign(tree, {
        trackEvent: () => {
          /* no-op when disabled */
        },
        events: noopEvents.asReadonly(),
        clearEvents: () => {
          /* no-op when disabled */
        },
        eventCount: computed(() => 0),
        lastEvent: computed(() => null),
      } as WithAnalytics);
    }

    const eventsSignal = signal<AnalyticsEvent[]>([]);

    const trackEvent = (
      type: AnalyticsEvent['type'],
      data?: Record<string, unknown>
    ) => {
      const event: AnalyticsEvent = {
        type,
        timestamp: Date.now(),
        data,
      };

      eventsSignal.update((events) => {
        const updated = [...events, event];
        return updated.slice(-maxEvents); // Keep only last N events
      });
    };

    const clearEvents = () => eventsSignal.set([]);

    const eventCount = computed(() => eventsSignal().length);
    const lastEvent = computed(() => {
      const events = eventsSignal();
      return events.length > 0 ? events[events.length - 1] : null;
    });

    // Use Object.assign to preserve tree identity and type inference
    return Object.assign(tree, {
      trackEvent,
      events: eventsSignal.asReadonly(),
      clearEvents,
      eventCount,
      lastEvent,
    } as WithAnalytics);
  };
}

// =============================================================================
// PART 3: ANOTHER CUSTOM ENHANCER - withLogger() that uses analytics
// =============================================================================

export interface WithLogger {
  log(message: string, level?: 'info' | 'warn' | 'error'): void;
  logs: Signal<LogEntry[]>;
  clearLogs(): void;
}

export interface LogEntry {
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: number;
}

// Enhancer that depends on analytics - tree must have WithAnalytics methods
export function withLogger(
  config: { maxLogs?: number } = {}
): <T>(
  tree: ISignalTree<T> & WithAnalytics
) => ISignalTree<T> & WithAnalytics & WithLogger {
  const maxLogs = config.maxLogs ?? 50;

  return <T>(
    tree: ISignalTree<T> & WithAnalytics
  ): ISignalTree<T> & WithAnalytics & WithLogger => {
    const logsSignal = signal<LogEntry[]>([]);

    const log = (
      message: string,
      level: 'info' | 'warn' | 'error' = 'info'
    ) => {
      const entry: LogEntry = {
        message,
        level,
        timestamp: Date.now(),
      };

      logsSignal.update((logs) => [...logs, entry].slice(-maxLogs));

      // Also track in analytics since we depend on it
      tree.trackEvent('custom', { log: message, level });
    };

    const clearLogs = () => logsSignal.set([]);

    return Object.assign(tree, {
      log,
      logs: logsSignal.asReadonly(),
      clearLogs,
    } as WithLogger);
  };
}

// =============================================================================
// COMPONENT DEMO
// =============================================================================

@Component({
  selector: 'app-custom-extensions-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-extensions-demo.component.html',
  styleUrls: ['./custom-extensions-demo.component.scss'],
})
export class CustomExtensionsDemoComponent {
  // Simple store - demonstrate enhancers
  store = signalTree({
    email: '',
    username: '',
    age: 0,
    submitCount: 0,
    lastSubmitted: null as string | null,
  }).with(withAnalytics({ maxEvents: 50 }));

  // Logger state (added via enhancer in constructor)
  private _logs = signal<LogEntry[]>([]);
  logs = this._logs.asReadonly();

  constructor() {
    // Manually add logger since it depends on analytics
    const loggerEnhancer = withLogger({ maxLogs: 20 });
    const enhanced = loggerEnhancer(
      this.store as unknown as ISignalTree<unknown> & WithAnalytics
    );
    // Store references to logger methods
    this._logs = enhanced.logs as unknown as typeof this._logs;
    (this.store as unknown as WithLogger).log = enhanced.log;
    (this.store as unknown as WithLogger).clearLogs = enhanced.clearLogs;
  }

  // Helper methods for template
  log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    (this.store as unknown as WithLogger).log(message, level);
  }

  clearLogs() {
    (this.store as unknown as WithLogger).clearLogs();
  }

  // Validators (simple functions)
  emailError = computed(() => {
    const email = this.store.$.email();
    if (!email) return 'Email is required';
    if (!email.includes('@')) return 'Must contain @';
    if (!email.includes('.')) return 'Must contain a domain';
    return null;
  });

  usernameError = computed(() => {
    const username = this.store.$.username();
    if (!username) return 'Username is required';
    if (username.length < 3) return 'Must be at least 3 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return 'Only letters, numbers, underscores';
    return null;
  });

  ageError = computed(() => {
    const age = this.store.$.age();
    if (age < 0) return 'Age cannot be negative';
    if (age < 18) return 'Must be 18 or older';
    if (age > 120) return 'Invalid age';
    return null;
  });

  allFieldsValid = computed(
    () => !this.emailError() && !this.usernameError() && !this.ageError()
  );

  // Actions
  onEmailChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.store.$.email.set(value);
    this.store.trackEvent('state_change', { field: 'email', value });
  }

  onUsernameChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.store.$.username.set(value);
    this.store.trackEvent('state_change', { field: 'username', value });
  }

  onAgeChange(event: Event) {
    const value = Number((event.target as HTMLInputElement).value) || 0;
    this.store.$.age.set(value);
    this.store.trackEvent('state_change', { field: 'age', value });
  }

  submitForm() {
    if (!this.allFieldsValid()) {
      this.log('Form validation failed', 'warn');
      return;
    }

    this.store.$.submitCount.update((c) => c + 1);
    this.store.$.lastSubmitted.set(new Date().toLocaleTimeString());

    this.store.trackEvent('action', {
      action: 'form_submit',
      data: {
        email: this.store.$.email(),
        age: this.store.$.age(),
        username: this.store.$.username(),
      },
    });

    this.log('Form submitted successfully!', 'info');
  }

  resetForm() {
    this.store.$.email.set('');
    this.store.$.username.set('');
    this.store.$.age.set(0);
    this.store.trackEvent('action', { action: 'form_reset' });
    this.log('Form reset', 'info');
  }

  // Code examples for display
  markerCode = `// 1. Define symbol and interfaces
const VALIDATED_MARKER = Symbol('VALIDATED_MARKER');

interface ValidatedMarker<T> {
  [VALIDATED_MARKER]: true;
  defaultValue: T;
  validator: (value: T) => string | null;
}

interface ValidatedSignal<T> {
  (): T;
  error: Signal<string | null>;
  isValid: Signal<boolean>;
  set(value: T): void;
  reset(): void;
}

// 2. Factory function
function validated<T>(
  defaultValue: T,
  validator: (value: T) => string | null
): ValidatedMarker<T> {
  return { [VALIDATED_MARKER]: true, defaultValue, validator };
}

// 3. Type guard
function isValidatedMarker(value: unknown): value is ValidatedMarker<unknown> {
  return Boolean(
    value && typeof value === 'object' &&
    VALIDATED_MARKER in value &&
    (value as any)[VALIDATED_MARKER] === true
  );
}

// 4. Materializer creates the signal
function createValidatedSignal<T>(marker: ValidatedMarker<T>): ValidatedSignal<T> {
  const valueSignal = signal<T>(marker.defaultValue);
  const errorSignal = signal<string | null>(marker.validator(marker.defaultValue));
  const isValidSignal = computed(() => errorSignal() === null);

  const validatedSignal = (() => valueSignal()) as ValidatedSignal<T>;

  validatedSignal.set = (value: T) => {
    valueSignal.set(value);
    errorSignal.set(marker.validator(value));
  };

  validatedSignal.reset = () => validatedSignal.set(marker.defaultValue);

  Object.defineProperty(validatedSignal, 'error', { get: () => errorSignal.asReadonly() });
  Object.defineProperty(validatedSignal, 'isValid', { get: () => isValidSignal });

  return validatedSignal;
}

// 5. Register at app startup
registerMarkerProcessor(isValidatedMarker, createValidatedSignal);`;

  enhancerCode = `// 1. Define interface for added methods
interface WithAnalytics {
  trackEvent(type: string, data?: Record<string, unknown>): void;
  events: Signal<AnalyticsEvent[]>;
  clearEvents(): void;
}

// 2. Create the enhancer factory (returns a function)
export function withAnalytics(config: { maxEvents?: number } = {}) {
  const maxEvents = config.maxEvents ?? 100;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & WithAnalytics => {
    const eventsSignal = signal<AnalyticsEvent[]>([]);

    const trackEvent = (type: string, data?: Record<string, unknown>) => {
      eventsSignal.update(events =>
        [...events, { type, timestamp: Date.now(), data }].slice(-maxEvents)
      );
    };

    // Object.assign preserves tree identity
    return Object.assign(tree, {
      trackEvent,
      events: eventsSignal.asReadonly(),
      clearEvents: () => eventsSignal.set([]),
    });
  };
}

// 3. Enhancer that depends on another enhancer
export function withLogger(config: { maxLogs?: number } = {}) {
  const maxLogs = config.maxLogs ?? 50;

  // Input type requires WithAnalytics to be present
  return <T>(tree: ISignalTree<T> & WithAnalytics): ISignalTree<T> & WithAnalytics & WithLogger => {
    const logsSignal = signal<LogEntry[]>([]);

    const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      logsSignal.update(logs => [...logs, { message, level, timestamp: Date.now() }].slice(-maxLogs));
      tree.trackEvent('custom', { log: message, level }); // Uses analytics!
    };

    return Object.assign(tree, {
      log,
      logs: logsSignal.asReadonly(),
      clearLogs: () => logsSignal.set([]),
    });
  };
}`;

  usageCode = `// Using custom markers and enhancers together
const store = signalTree({
  // Custom validated marker
  email: validated('', emailValidator),
  age: validated(0, ageValidator),

  // Regular state
  submitCount: 0,
})
  .with(withAnalytics({ maxEvents: 50 }))
  .with(withLogger({ maxLogs: 20 }));

// Access validated signal APIs
store.$.email.set('user@example.com');
store.$.email.isValid();  // true
store.$.email.error();    // null

// Access enhancer APIs
store.trackEvent('action', { type: 'submit' });
store.log('User signed up!', 'info');
store.events();  // Array of analytics events`;
}
