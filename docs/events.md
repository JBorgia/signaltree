# @signaltree/events

Event-driven architecture infrastructure for SignalTree applications. Provides a complete event bus system with validation, subscribers, and real-time sync.

## Installation

```bash
npm install @signaltree/events zod
# or
pnpm add @signaltree/events zod
```

## Module Format (ESM-only)

`@signaltree/events` ships as **pure ESM**.

- ✅ Works in ESM environments (modern bundlers, Vite, Angular, Node ESM)
- ❌ **Does not support** CommonJS `require()` (you'll get `ERR_REQUIRE_ESM`)

If you're using the NestJS entry (`@signaltree/events/nestjs`) from Node, make sure your backend runs in ESM mode, for example:

- `package.json`: set `"type": "module"`
- `tsconfig.json`: set `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`

## Subpaths

The package is organized into subpaths for tree-shaking and to separate framework-specific code:

| Subpath                      | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `@signaltree/events`         | Core types, schemas, validation (framework-agnostic) |
| `@signaltree/events/nestjs`  | NestJS integration (EventBusModule, BaseSubscriber)  |
| `@signaltree/events/angular` | Angular integration (WebSocketService)               |
| `@signaltree/events/testing` | Test utilities (MockEventBus, event factories)       |

## Quick Start

### 1. Define Event Schemas

Use Zod for runtime validation of your events:

```typescript
import { createEventSchema, z } from '@signaltree/events';

// Define your domain events with schemas
export const TradeProposalCreatedSchema = createEventSchema('TradeProposalCreated', {
  tradeId: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  vehicleOfferedId: z.string().uuid(),
  vehicleRequestedId: z.string().uuid().optional(),
  cashDifference: z.number().optional(),
});

// TypeScript type is inferred from schema
export type TradeProposalCreated = z.infer<typeof TradeProposalCreatedSchema>;
```

### 2. Create Events with Factory

```typescript
import { createEventFactory } from '@signaltree/events';

const factory = createEventFactory({
  source: 'trade-service',
  environment: process.env.NODE_ENV ?? 'development',
});

// Create a typed event
const event = factory.create<TradeProposalCreated>(
  'TradeProposalCreated',
  {
    tradeId: '550e8400-e29b-41d4-a716-446655440000',
    initiatorId: 'user-1',
    recipientId: 'user-2',
    vehicleOfferedId: 'vehicle-1',
  },
  {
    priority: 'high',
    actor: { id: 'user-1', type: 'user', name: 'John Doe' },
    aggregate: { type: 'Trade', id: '550e8400-e29b-41d4-a716-446655440000' },
  }
);
```

### 3. Validate Events

```typescript
import { validateEvent, isValidEvent, EventValidationError } from '@signaltree/events';

// Validate and throw on failure
try {
  const validEvent = validateEvent(TradeProposalCreatedSchema, rawEvent);
  // validEvent is typed as TradeProposalCreated
} catch (error) {
  if (error instanceof EventValidationError) {
    console.error('Validation failed:', error.issues);
  }
}

// Or check without throwing
if (isValidEvent(TradeProposalCreatedSchema, rawEvent)) {
  // rawEvent is narrowed to TradeProposalCreated
}
```

---

## Core Concepts

### BaseEvent Interface

All events must conform to the `BaseEvent` interface:

```typescript
interface BaseEvent<TType extends string = string, TData = unknown> {
  /** Unique event ID (UUID v7 recommended - time-sortable) */
  id: string;

  /** Event type in PascalCase (e.g., 'TradeProposalCreated') */
  type: TType;

  /** Schema version for event evolution */
  version: EventVersion;

  /** When the event occurred (ISO 8601) */
  timestamp: string;

  /** Request/trace ID for distributed tracing */
  correlationId: string;

  /** ID of the event that caused this event */
  causationId?: string;

  /** Who/what triggered this event */
  actor: EventActor;

  /** Event metadata for tracing and audit */
  metadata: EventMetadata;

  /** Event-specific payload */
  data: TData;

  /** Priority for queue routing */
  priority?: EventPriority;

  /** Aggregate information for event sourcing */
  aggregate?: { type: string; id: string };
}
```

### Event Priority

Events can be assigned priorities that map to SLAs and queue routing:

| Priority   | SLA (ms) | Weight | Use Case                        |
| ---------- | -------- | ------ | ------------------------------- |
| `critical` | 100      | 10     | System alerts, security events  |
| `high`     | 500      | 7      | User-facing operations, trades  |
| `normal`   | 2000     | 5      | Standard business events        |
| `low`      | 30000    | 3      | Background tasks, notifications |
| `bulk`     | 300000   | 1      | Batch operations, analytics     |

```typescript
import { EVENT_PRIORITIES } from '@signaltree/events';

// Access priority configuration
const criticalSLA = EVENT_PRIORITIES.critical.sla; // 100ms
```

### Event Actor

The actor represents who/what triggered the event:

```typescript
interface EventActor {
  /** User, system, or admin ID */
  id: string;
  /** Type of actor */
  type: 'user' | 'system' | 'admin' | 'webhook';
  /** Optional display name for audit */
  name?: string;
}
```

---

## Event Factory

The event factory provides consistent event creation with UUID v7 generation and correlation ID management.

### Creating a Factory

```typescript
import { createEventFactory } from '@signaltree/events';

const factory = createEventFactory<MyEventUnion>({
  source: 'my-service',
  environment: 'production',
  systemActor: { id: 'system', type: 'system', name: 'My Service' },
});
```

### Creating Events

```typescript
// Basic event creation
const event = factory.create<TradeProposalCreated>(
  'TradeProposalCreated',
  { tradeId: '123', initiatorId: 'user-1', recipientId: 'user-2', vehicleOfferedId: 'v-1' },
  {
    priority: 'high',
    actor: { id: 'user-1', type: 'user' },
  }
);

// Chain events with causation tracking
const acceptEvent = factory.createFromCause<TradeAccepted>(
  'TradeAccepted',
  { tradeId: '123', acceptedById: 'user-2', acceptedAt: new Date().toISOString() },
  event // The proposal event becomes the cause
);

// acceptEvent.causationId === event.id
// acceptEvent.correlationId === event.correlationId
```

### UUID v7 Generation

Events use UUID v7 for time-sortable IDs:

```typescript
import { generateEventId } from '@signaltree/events';

const id = generateEventId();
// Example: '018e4b5c-a1b2-7000-8000-abcdef123456'
// - First 48 bits: Unix timestamp in milliseconds
// - Next 4 bits: Version (7)
// - Remaining: Random
```

---

## Validation

### Creating Schemas

Use `createEventSchema` to define event schemas with Zod:

```typescript
import { createEventSchema, z } from '@signaltree/events';

const UserRegisteredSchema = createEventSchema('UserRegistered', {
  userId: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  referralCode: z.string().optional(),
});

type UserRegistered = z.infer<typeof UserRegisteredSchema>;
```

### Validation Functions

```typescript
import { validateEvent, isValidEvent, parseEvent, EventValidationError } from '@signaltree/events';

// Throws on invalid event
const valid = validateEvent(UserRegisteredSchema, event);

// Returns boolean (type guard)
if (isValidEvent(UserRegisteredSchema, event)) {
  // event is typed as UserRegistered
}

// Returns Zod SafeParseResult
const result = parseEvent(UserRegisteredSchema, event);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.issues);
}
```

### EventValidationError

When validation fails, `EventValidationError` provides detailed information:

```typescript
try {
  validateEvent(schema, event);
} catch (error) {
  if (error instanceof EventValidationError) {
    // Get formatted error messages
    error.issues.forEach((issue) => console.log(issue));
    // e.g., "data.email: Invalid email"

    // Access the underlying Zod error
    console.log(error.zodError.issues);

    // Access the original event
    console.log(error.event);
  }
}
```

---

## Error Classification

Classify errors to determine retry behavior:

```typescript
import { classifyError, isRetryableError, DEFAULT_RETRY_CONFIGS } from '@signaltree/events';

try {
  await processEvent(event);
} catch (error) {
  const classification = classifyError(error);

  if (classification.classification === 'transient') {
    // Retry with backoff
    const config = classification.retryConfig;
    console.log(`Will retry up to ${config.maxAttempts} times`);
  } else if (classification.classification === 'poison') {
    // Send to Dead Letter Queue
    console.log('Sending to DLQ:', classification.reason);
  } else {
    // Permanent error - don't retry
    console.log('Permanent failure:', classification.reason);
  }

  // Quick check
  if (isRetryableError(error)) {
    await retryWithBackoff(processEvent, event);
  }
}
```

### Classification Types

| Classification | Retry | Examples                                         |
| -------------- | ----- | ------------------------------------------------ |
| `transient`    | Yes   | Network errors, timeouts, rate limits, deadlocks |
| `permanent`    | No    | Validation errors, auth failures, not found      |
| `poison`       | No    | Schema errors, deserialization failures          |
| `unknown`      | Maybe | Default for unrecognized errors                  |

### Custom Error Classifiers

```typescript
import { createErrorClassifier } from '@signaltree/events';

const classifier = createErrorClassifier({
  transientPatterns: [/custom_retry_pattern/i, /my_service_busy/i],
  permanentPatterns: [/my_validation_error/i],
  poisonPatterns: [/corrupt_payload/i],
});

const result = classifier.classify(error);
```

---

## Idempotency

Prevent duplicate event processing:

```typescript
import { createInMemoryIdempotencyStore, generateIdempotencyKey } from '@signaltree/events';

const store = createInMemoryIdempotencyStore({
  maxSize: 10000, // Maximum records to keep
  ttlMs: 86400000, // 24 hour TTL
});

async function processEvent(event: BaseEvent) {
  const key = generateIdempotencyKey(event.id, 'my-consumer');

  // Check for duplicate
  const check = await store.check(key);
  if (check.alreadyProcessed) {
    console.log('Duplicate event, skipping');
    return check.result; // Return cached result
  }

  // Process the event
  try {
    const result = await doWork(event);
    await store.record(key, { success: true, result });
    return result;
  } catch (error) {
    await store.record(key, { success: false, error: String(error) });
    throw error;
  }
}
```

---

## Testing Utilities

Import from `@signaltree/events/testing`:

### MockEventBus

An in-memory event bus for unit tests:

```typescript
import { createMockEventBus, createTestEvent } from '@signaltree/events/testing';

describe('TradeService', () => {
  let eventBus: MockEventBus;

  beforeEach(() => {
    eventBus = createMockEventBus({
      simulateAsync: true, // Simulate async behavior
      asyncDelayMs: 10, // Delay between operations
    });
  });

  afterEach(() => {
    eventBus.clear();
  });

  it('should publish trade proposal event', async () => {
    // Subscribe to events
    const received: TradeProposalCreated[] = [];
    eventBus.subscribe<TradeProposalCreated>('TradeProposalCreated', (event) => {
      received.push(event);
    });

    // Publish event
    await eventBus.publish(
      createTestEvent('TradeProposalCreated', {
        tradeId: '123',
        initiatorId: 'user-1',
        recipientId: 'user-2',
        vehicleOfferedId: 'v-1',
      })
    );

    // Assert
    expect(received).toHaveLength(1);
    expect(received[0].data.tradeId).toBe('123');

    // Assertion helpers
    expect(eventBus.wasPublished('TradeProposalCreated')).toBe(true);
    expect(eventBus.getPublishedEvents()).toHaveLength(1);
    expect(eventBus.getPublishedEvents('TradeProposalCreated')).toHaveLength(1);
  });
});
```

### MockEventBus Methods

| Method                              | Description                          |
| ----------------------------------- | ------------------------------------ |
| `publish(event, options?)`          | Publish an event                     |
| `publishBatch(events, options?)`    | Publish multiple events              |
| `subscribe(type, handler)`          | Subscribe to event type              |
| `subscribeAll(handler)`             | Subscribe to all events              |
| `getPublishedEvents(type?)`         | Get all or filtered published events |
| `getLastPublishedEvent(type?)`      | Get last published event             |
| `wasPublished(type)`                | Check if event type was published    |
| `wasPublishedWith(type, predicate)` | Check with custom predicate          |
| `clear()`                           | Clear all state                      |

### Test Event Factory

Create events for testing with sensible defaults:

```typescript
import { createTestEvent, createTestEventFactory } from '@signaltree/events/testing';

// Quick creation with defaults
const event = createTestEvent(
  'TradeProposalCreated',
  {
    tradeId: '123',
    initiatorId: 'user-1',
    recipientId: 'user-2',
    vehicleOfferedId: 'v-1',
  },
  {
    priority: 'high',
    actor: { id: 'test-user', type: 'user' },
  }
);

// Factory for consistent test data
const factory = createTestEventFactory<MyEvents>();
const events = factory.createMany('TradeProposalCreated', [{ tradeId: '1' /* ... */ }, { tradeId: '2' /* ... */ }, { tradeId: '3' /* ... */ }]);
```

---

## NestJS Integration

Import from `@signaltree/events/nestjs`:

### EventBusModule Setup

```typescript
import { Module } from '@nestjs/common';
import { EventBusModule } from '@signaltree/events/nestjs';

@Module({
  imports: [
    EventBusModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
      },
      queues: ['critical', 'high', 'normal', 'low', 'bulk'],
      defaultQueue: 'normal',
    }),
  ],
})
export class AppModule {}
```

### Event Subscribers

```typescript
import { Injectable } from '@nestjs/common';
import { BaseSubscriber, OnEvent } from '@signaltree/events/nestjs';
import { TradeProposalCreated } from './events';

@Injectable()
export class TradeSubscriber extends BaseSubscriber {
  @OnEvent('TradeProposalCreated')
  async handleTradeProposal(event: TradeProposalCreated): Promise<void> {
    console.log('Trade proposed:', event.data.tradeId);

    // Process the event...
    await this.notifyParties(event);
  }

  private async notifyParties(event: TradeProposalCreated): Promise<void> {
    // Implementation...
  }
}
```

### Publishing Events

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { EventBus, EVENT_BUS } from '@signaltree/events/nestjs';

@Injectable()
export class TradeService {
  constructor(@Inject(EVENT_BUS) private readonly eventBus: EventBus) {}

  async createProposal(dto: CreateProposalDto): Promise<Trade> {
    const trade = await this.repository.create(dto);

    await this.eventBus.publish({
      type: 'TradeProposalCreated',
      data: {
        tradeId: trade.id,
        initiatorId: dto.initiatorId,
        recipientId: dto.recipientId,
        vehicleOfferedId: dto.vehicleOfferedId,
      },
    });

    return trade;
  }
}
```

---

## Angular Integration

Import from `@signaltree/events/angular`:

```typescript
import { Injectable, inject } from '@angular/core';
import { WebSocketService } from '@signaltree/events/angular';

@Injectable({ providedIn: 'root' })
export class TradeRealtimeService {
  private ws = inject(WebSocketService);

  readonly tradeUpdates$ = this.ws.subscribe<TradeEvent>('trade:*');

  connect(): void {
    this.ws.connect('wss://api.example.com/ws');
  }

  disconnect(): void {
    this.ws.disconnect();
  }
}
```

---

## API Reference

### Core Exports (`@signaltree/events`)

#### Types

- `BaseEvent<TType, TData>` - Base event interface
- `EventMetadata` - Event metadata interface
- `EventActor` - Actor interface
- `EventPriority` - Priority type (`'critical' | 'high' | 'normal' | 'low' | 'bulk'`)
- `EventVersion` - Version interface (`{ major: number; minor: number }`)

#### Constants

- `EVENT_PRIORITIES` - Priority configuration map
- `DEFAULT_EVENT_VERSION` - Default version `{ major: 1, minor: 0 }`

#### Validation

- `createEventSchema(type, dataSchema)` - Create event schema
- `validateEvent(schema, event)` - Validate and throw
- `isValidEvent(schema, event)` - Type guard
- `parseEvent(schema, event)` - Safe parse
- `EventValidationError` - Validation error class
- `BaseEventSchema` - Base schema for events
- `EventActorSchema` - Schema for actors
- `EventMetadataSchema` - Schema for metadata

#### Factory

- `createEventFactory(config)` - Create event factory
- `createEvent(type, data, options?)` - Create single event
- `generateEventId()` - Generate UUID v7
- `generateCorrelationId()` - Generate correlation ID

#### Error Classification

- `classifyError(error)` - Classify an error
- `isRetryableError(error)` - Check if retryable
- `createErrorClassifier(config)` - Custom classifier
- `DEFAULT_RETRY_CONFIGS` - Default retry configurations

#### Idempotency

- `createInMemoryIdempotencyStore(config)` - Create store
- `generateIdempotencyKey(eventId, consumer)` - Generate key
- `IdempotencyStore` - Store interface

### Testing Exports (`@signaltree/events/testing`)

- `createMockEventBus(options?)` - Create mock bus
- `MockEventBus` - Mock bus class
- `createTestEvent(type, data, options?)` - Create test event
- `createTestEventFactory()` - Create test factory
- `TestEventFactory` - Factory interface

---

## Best Practices

### Event Naming

- Use **past tense** (events are facts that happened)
- Use **PascalCase**
- Be **domain-specific**

```typescript
// ✅ Good
'TradeProposalCreated';
'VehicleInspectionCompleted';
'PaymentProcessed';

// ❌ Bad
'CreateTradeProposal'; // Imperative
'trade_created'; // Wrong case
'Event'; // Too generic
```

### Event Data

- Include **all necessary context** (don't require additional queries)
- Use **IDs instead of full objects** for relationships
- Keep payloads **reasonably sized**

```typescript
// ✅ Good
{
  type: 'TradeAccepted',
  data: {
    tradeId: '123',
    acceptedById: 'user-2',
    acceptedAt: '2024-01-15T10:30:00Z',
    // Include denormalized data if commonly needed
    tradeTitle: '2022 Tesla Model 3 for 2021 BMW X5',
  }
}

// ❌ Bad - too minimal, requires additional queries
{
  type: 'TradeAccepted',
  data: { tradeId: '123' }
}
```

### Error Handling

Always use try/catch and classify errors:

```typescript
async function handleEvent(event: BaseEvent): Promise<void> {
  try {
    await processEvent(event);
  } catch (error) {
    if (isRetryableError(error)) {
      throw error; // Let the queue retry
    }

    // Log permanent failures
    logger.error('Permanent failure processing event', {
      eventId: event.id,
      eventType: event.type,
      error,
    });

    // Don't rethrow - acknowledge the message
  }
}
```

---

## Live Demo

Visit the [Events Demo](/events) in the SignalTree demo application to see interactive examples of:

- Event creation with factories
- Schema validation with Zod
- MockEventBus for testing
- Error classification
- Idempotency checking
