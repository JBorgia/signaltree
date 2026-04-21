---
name: signaltree-events
description: Guides AI agents using @signaltree/events for Zod-validated event schemas, event registries, factories, idempotency, retry classification, and framework subpath integrations (NestJS EventBusModule, Angular WebSocket bridge, testing utilities). Triggers on @signaltree/events, createEventSchema, validateEvent, EventRegistry, EventBusModule, BaseSubscriber, NestJS event bus, Zod schema, idempotency store, retryable error, event factory, CQRS events.
---

# Using @signaltree/events

## When to use this package

Reach for `@signaltree/events` when an application (Angular front-end, NestJS back-end, or both talking to each other) needs a typed event contract with runtime validation, stable IDs/correlation, idempotency, and retry semantics. The core package is **framework-agnostic and ESM-only**: it provides schemas, factories, and utilities. Framework integrations ship as subpath imports — `@signaltree/events/nestjs` for the BullMQ/Redis-backed `EventBusModule` and `BaseSubscriber`, `@signaltree/events/angular` for the WebSocket service and handlers, and `@signaltree/events/testing` for `MockEventBus` and factories. Skip this package if you just need local in-process event emitters; reach for it when the event crosses a process, a queue, or a websocket.

## Install

```bash
npm install @signaltree/events zod
```

Peer range (from `peerDependencies`): `zod ^3 || ^4` is required. `@angular/core ^18 || ^19 || ^20`, `rxjs ^7`, `@nestjs/common ^10 || ^11`, `bullmq ^5`, and `reflect-metadata ^0.1 || ^0.2` are declared as **optional** peers — install only the ones you actually use. Note that the Angular range for this package is broader than the rest of SignalTree (`^18` minimum), reflecting that events is meant to be dropped into existing services.

## Mental model

Three layers, composed as needed:

1. **Schema + validation** — `createEventSchema(type, payloadSchema)` wraps a Zod payload schema with the common `BaseEvent` envelope (`eventId`, `type`, `timestamp`, `actor`, `metadata`, `version`). `validateEvent`, `isValidEvent`, and `parseEvent` use the resulting schema at runtime.
2. **Registry + factory** — `EventRegistry` catalogs known event types for discovery and centralized validation; `createEventFactory(config)` produces a factory that stamps events with consistent actor, correlation, and version metadata.
3. **Transport adapters (subpath)** — `nestjs/EventBusModule` wires a Redis + BullMQ bus with configurable queues, error classification, retry, and idempotency; `angular/` provides a typed WebSocket bridge; `testing/` gives you a `MockEventBus` plus event factories to assert on.

Error classification (`classifyError`, `isRetryableError`) and the `InMemoryIdempotencyStore` are independent utilities you can wire into any transport, not just NestJS.

## Core usage

### Define a schema

```ts
import { createEventSchema, z } from '@signaltree/events';

// createEventSchema takes an event type string and a Zod raw shape
// (field map), not a ZodObject. Use createEventSchemaFromZod when you
// already have a ZodObject to pass through.
export const UserCreatedSchema = createEventSchema('user.created', {
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});

export type UserCreated = z.infer<typeof UserCreatedSchema>;
```

### Validate an incoming payload

```ts
import { isValidEvent, parseEvent, validateEvent } from '@signaltree/events';

// Boolean guard
if (isValidEvent(UserCreatedSchema, incoming)) {
  // `incoming` is now typed as UserCreated
}

// Full parse (throws on failure)
const event = parseEvent(UserCreatedSchema, incoming);

// Detailed result (never throws)
const result = validateEvent(UserCreatedSchema, incoming);
if (!result.success) {
  console.error(result.error.issues);
}
```

### Create events with a factory

```ts
import { createEventFactory } from '@signaltree/events';
import type { UserCreated } from './events/user-created';

// EventFactoryConfig requires `source` and `environment`. Pass a
// `systemActor` for service-originated events.
const factory = createEventFactory<UserCreated>({
  source: 'api-gateway',
  environment: 'production',
  // EventActor.type is 'user' | 'system' | 'admin' | 'webhook'. Use
  // 'system' for service-originated events.
  systemActor: { type: 'system', id: 'api-gateway' },
});

const created = factory.create('user.created', {
  id: crypto.randomUUID(),
  email: 'ada@example.com',
  name: 'Ada Lovelace',
});
// created: { id, type: 'user.created', timestamp, actor, version, data, metadata }
```

### Retry and idempotency utilities

```ts
import {
  classifyError,
  isRetryableError,
  InMemoryIdempotencyStore,
} from '@signaltree/events';
import type { BaseEvent } from '@signaltree/events';

declare const event: BaseEvent;
declare function processEvent(e: BaseEvent): Promise<void>;

try {
  await processEvent(event);
} catch (err) {
  const classification = classifyError(err);
  if (isRetryableError(err)) {
    // enqueue a retry with backoff
  }
}

// InMemoryIdempotencyStoreConfig uses `defaultTtlMs`, not `ttlMs`.
const idempotencyStore = new InMemoryIdempotencyStore({
  defaultTtlMs: 60_000,
});
// `check` takes (event, consumer, options?). The result exposes `isDuplicate`.
const result = await idempotencyStore.check(event, 'welcome-email-subscriber');
if (result.isDuplicate) return;
```

## Advanced / less-obvious

### NestJS integration via `@signaltree/events/nestjs`

```ts
import { Module } from '@nestjs/common';
import { EventBusModule } from '@signaltree/events/nestjs';

@Module({
  imports: [
    EventBusModule.forRoot({
      redis: { host: 'localhost', port: 6379 },
      // `queues` takes QueueConfig[]; or use `preset: 'priority-based'`
      // for the canonical 5-queue layout.
      preset: 'priority-based',
    }),
  ],
})
export class AppModule {}
```

Subscribers extend `BaseSubscriber` and expose a `config` plus a `handle`
that returns a `ProcessingResult`:

```ts
import { Injectable } from '@nestjs/common';
import {
  BaseSubscriber,
  type ProcessingResult,
  type SubscriberConfig,
} from '@signaltree/events/nestjs';
import type { UserCreated } from './events/user-created';

@Injectable()
export class WelcomeEmailSubscriber extends BaseSubscriber<UserCreated> {
  protected readonly config: SubscriberConfig = {
    name: 'welcome-email-subscriber',
    eventTypes: ['user.created'],
    priority: 'normal',
    concurrency: 5,
  };

  async handle(event: UserCreated): Promise<ProcessingResult> {
    // …send email, etc.
    return { success: true };
  }
}
```

`EventBusModule` uses BullMQ under the hood; queues map to priorities and the `DlqService` provides dead-letter queue inspection.

### Testing with `@signaltree/events/testing`

```ts
import { MockEventBus } from '@signaltree/events/testing';
import type { BaseEvent } from '@signaltree/events';

declare const created: BaseEvent;
declare const expect: any; // vitest/jest global in real tests

const bus = new MockEventBus();
await bus.publish(created);
// Accessors for recorded events: getPublishedEvents(),
// getPublishedEventsByType(type), getPublishedCount(type?).
expect(bus.getPublishedEvents()).toHaveLength(1);
expect(bus.getPublishedEvents()[0].event.type).toBe('user.created');
```

### ESM-only

The package is `"type": "module"`. In CommonJS consumers (rare in modern Angular / NestJS apps, but occasionally in legacy Node tools), use dynamic `import()` or migrate the consumer to ESM.

## Gotchas

- **Zod is required, not optional.** Even if you do not author a schema directly, the registry and factories rely on Zod at runtime. Install it explicitly.
- The `@nestjs/common`, `bullmq`, `reflect-metadata`, `@angular/core`, and `rxjs` peer deps are **optional** in `peerDependenciesMeta`. Package managers will not prompt you to install them. Install only the ones matching the subpath you import — `/nestjs` needs the NestJS + BullMQ + reflect-metadata triple, `/angular` needs `@angular/core` + `rxjs`.
- `EventBusModule.forRoot` expects a Redis instance reachable at config time. Use `forRootAsync` if you need to await config loading.
- `createEventSchema(type, payloadSchema)` accepts either a Zod schema **or** a plain object shape — under the hood it normalizes both via `createEventSchemaFromZod`. Prefer passing the Zod schema explicitly for clarity.
- `InMemoryIdempotencyStore` is process-local. For multi-instance deployments, swap in a Redis-backed store that implements the `IdempotencyStore` interface.
- The broader Angular peer range (`^18+`) is intentional, but the rest of the SignalTree ecosystem requires `^20`. If you target an older Angular, pin your other SignalTree packages accordingly.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.
