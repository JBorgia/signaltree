# @signaltree/events

Event-driven architecture infrastructure for SignalTree applications. Provides a complete event bus system with validation, subscribers, error classification, and real-time sync.

## Installation

```bash
npm install @signaltree/events zod
```

## Subpath Exports

The package provides four entry points for different use cases:

| Import Path                  | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `@signaltree/events`         | Core types, schemas, validation (framework-agnostic) |
| `@signaltree/events/nestjs`  | NestJS integration (EventBusModule, BaseSubscriber)  |
| `@signaltree/events/angular` | Angular integration (WebSocketService)               |
| `@signaltree/events/testing` | Test utilities (MockEventBus, factories, assertions) |

## Quick Start

### 1. Define Events with Zod Schemas

```typescript
import { createEventSchema, EventPriority, z } from '@signaltree/events';

// Define your event schema
export const TradeProposalCreatedSchema = createEventSchema('TradeProposalCreated', {
  tradeId: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  vehicleOfferedId: z.string().uuid(),
});

export type TradeProposalCreated = z.infer<typeof TradeProposalCreatedSchema>;
```

### 2. Create Events with the Factory

```typescript
import { createEventFactory } from '@signaltree/events';

const eventFactory = createEventFactory({
  source: 'trade-service',
  defaultPriority: 'normal',
});

const event = eventFactory.create('TradeProposalCreated', {
  tradeId: '550e8400-e29b-41d4-a716-446655440000',
  initiatorId: 'user-123',
  recipientId: 'user-456',
  vehicleOfferedId: 'vehicle-789',
});
```

### 3. Validate Events

```typescript
import { validateEvent, isValidEvent, parseEvent } from '@signaltree/events';

// Throws on invalid
const validatedEvent = validateEvent(TradeProposalCreatedSchema, rawEvent);

// Returns boolean
if (isValidEvent(TradeProposalCreatedSchema, rawEvent)) {
  // rawEvent is typed as TradeProposalCreated
}

// Returns { success, data, error }
const result = parseEvent(TradeProposalCreatedSchema, rawEvent);
if (result.success) {
  console.log(result.data);
}
```

## NestJS Integration

### Module Setup

```typescript
import { Module } from '@nestjs/common';
import { EventBusModule } from '@signaltree/events/nestjs';

@Module({
  imports: [
    EventBusModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      queues: ['critical', 'high', 'normal', 'low', 'bulk'],
      defaultQueue: 'normal',
    }),
  ],
})
export class AppModule {}
```

### Publishing Events

```typescript
import { Injectable } from '@nestjs/common';
import { EventBusService } from '@signaltree/events/nestjs';

@Injectable()
export class TradeService {
  constructor(private eventBus: EventBusService) {}

  async createTrade(data: CreateTradeDto) {
    const trade = await this.tradeRepo.create(data);

    await this.eventBus.publish({
      type: 'TradeProposalCreated',
      payload: {
        tradeId: trade.id,
        initiatorId: data.initiatorId,
        recipientId: data.recipientId,
        vehicleOfferedId: data.vehicleOfferedId,
      },
      metadata: {
        source: 'trade-service',
        priority: 'high',
      },
    });

    return trade;
  }
}
```

### Creating Subscribers

```typescript
import { Injectable } from '@nestjs/common';
import { BaseSubscriber, OnEvent } from '@signaltree/events/nestjs';

@Injectable()
export class NotificationSubscriber extends BaseSubscriber {
  readonly subscriberName = 'notification-subscriber';
  readonly subscribedEvents = ['TradeProposalCreated', 'TradeAccepted'];

  @OnEvent('TradeProposalCreated')
  async handleTradeCreated(event: TradeProposalCreated) {
    await this.notificationService.send({
      userId: event.payload.recipientId,
      title: 'New Trade Proposal',
      body: 'You have received a new trade proposal!',
    });

    return { success: true };
  }
}
```

## Angular Integration

### WebSocket Service

```typescript
import { Injectable } from '@angular/core';
import { WebSocketService } from '@signaltree/events/angular';

@Injectable({ providedIn: 'root' })
export class TradeWebSocketService extends WebSocketService {
  constructor() {
    super({
      url: 'ws://localhost:3000/events',
      reconnect: true,
      reconnectInterval: 5000,
    });
  }
}
```

### Optimistic Updates

```typescript
import { OptimisticUpdateManager } from '@signaltree/events/angular';

const manager = new OptimisticUpdateManager();

// Apply optimistic update
const updateId = manager.apply({
  type: 'TradeAccepted',
  rollback: () => this.store.$.trades.revert(),
});

try {
  await this.tradeService.acceptTrade(tradeId);
  manager.confirm(updateId);
} catch (error) {
  manager.rollback(updateId);
}
```

## Testing Utilities

### MockEventBus

```typescript
import { MockEventBus, createTestEvent } from '@signaltree/events/testing';

describe('TradeService', () => {
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
  });

  afterEach(() => {
    mockEventBus.reset();
  });

  it('should publish TradeProposalCreated event', async () => {
    await service.createTrade(tradeData);

    expect(mockEventBus.wasPublished('TradeProposalCreated')).toBe(true);

    const events = mockEventBus.getPublishedEventsByType('TradeProposalCreated');
    expect(events).toHaveLength(1);
    expect(events[0].payload.tradeId).toBe(expectedTradeId);
  });
});
```

### Event Factories

```typescript
import { createTestEvent, createTestEventBatch } from '@signaltree/events/testing';

const event = createTestEvent('TradeProposalCreated', {
  tradeId: 'test-trade-123',
});

const events = createTestEventBatch('UserLoggedIn', 5, (index) => ({
  userId: `user-${index}`,
}));
```

### Assertions

```typescript
import { assertEventMatches, assertEventSequence } from '@signaltree/events/testing';

assertEventMatches(event, {
  type: 'TradeProposalCreated',
  payload: { tradeId: expect.any(String) },
});

assertEventSequence(events, ['TradeProposalCreated', 'NotificationSent', 'AuditLogCreated']);
```

## Error Classification

Automatic error classification for retry logic:

```typescript
import { classifyError, isRetryableError } from '@signaltree/events';

try {
  await processEvent(event);
} catch (error) {
  const classification = classifyError(error);

  if (classification.classification === 'transient') {
    // Retry with exponential backoff
    await retryWithBackoff(() => processEvent(event), classification.retryConfig);
  } else if (classification.classification === 'permanent') {
    // Send to DLQ
    await dlqService.add(event, error);
  }
}
```

## Idempotency

Prevent duplicate event processing:

```typescript
import { InMemoryIdempotencyStore, generateIdempotencyKey } from '@signaltree/events';

const store = new InMemoryIdempotencyStore({ ttlMs: 24 * 60 * 60 * 1000 });

const key = generateIdempotencyKey(event);
const check = await store.check(key);

if (check.status === 'new') {
  await processEvent(event);
  await store.markProcessed(key, { result: 'success' });
} else if (check.status === 'processed') {
  // Already processed, return cached result
  return check.record.result;
}
```

## Event Registry

Register and discover events:

```typescript
import { createEventRegistry } from '@signaltree/events';

const registry = createEventRegistry();

registry.register({
  type: 'TradeProposalCreated',
  schema: TradeProposalCreatedSchema,
  description: 'Emitted when a new trade proposal is created',
  category: 'trades',
  priority: 'high',
});

// Get catalog of all events
const catalog = registry.getCatalog();

// Validate against registry
const isValid = registry.validate(event);
```

## API Reference

### Core Exports (`@signaltree/events`)

- **Types**: `BaseEvent`, `EventMetadata`, `EventPriority`
- **Schemas**: `createEventSchema`, `BaseEventSchema`, `validateEvent`, `parseEvent`
- **Factory**: `createEventFactory`, `createEvent`, `generateEventId`
- **Registry**: `EventRegistry`, `createEventRegistry`
- **Errors**: `classifyError`, `isRetryableError`, `createErrorClassifier`
- **Idempotency**: `InMemoryIdempotencyStore`, `generateIdempotencyKey`

### NestJS Exports (`@signaltree/events/nestjs`)

- **Module**: `EventBusModule`
- **Services**: `EventBusService`, `DlqService`
- **Subscriber**: `BaseSubscriber`
- **Decorators**: `@OnEvent`
- **Tokens**: `EVENT_BUS_CONFIG`, `EVENT_REGISTRY`

### Angular Exports (`@signaltree/events/angular`)

- **Services**: `WebSocketService`
- **Utilities**: `OptimisticUpdateManager`, `createEventHandler`

### Testing Exports (`@signaltree/events/testing`)

- **Mocks**: `MockEventBus`
- **Factories**: `createTestEvent`, `createTestEventBatch`
- **Assertions**: `assertEventMatches`, `assertEventSequence`
- **Helpers**: `waitForEvent`, `createEventSpy`

## Peer Dependencies

```json
{
  "zod": "^3.0.0",
  "@angular/core": "^18.0.0 || ^19.0.0 || ^20.0.0",
  "rxjs": "^7.0.0",
  "@nestjs/common": "^10.0.0 || ^11.0.0",
  "bullmq": "^5.0.0",
  "reflect-metadata": "^0.1.13 || ^0.2.0"
}
```

All peer dependencies except `zod` are optional - only install what you need for your framework.

## License

MIT © [SignalTree](https://github.com/JBorgia/signaltree)
