---
name: signaltree-events
description: Guides AI agents using @signaltree/events for Zod-validated event schemas, event registries, factories, idempotency, retry classification, and framework subpath integrations (NestJS EventBusModule, Angular WebSocket bridge, entityMap batch-op bridge, optimistic updates, testing utilities). Triggers on @signaltree/events, createEventSchema, validateEvent, EventRegistry, EventBusModule, BaseSubscriber, NestJS event bus, Zod schema, idempotency store, retryable error, event factory, CQRS events, entityEventHandler, OptimisticUpdateManager, applyOptimisticEntityChange, optimistic update rollback.
---

# Using @signaltree/events

Use when an app needs typed event contracts with runtime validation, stable IDs/correlation, idempotency, and retry semantics across a process boundary (queue, WebSocket, service bus). Skip for local in-process emitters.

Three layers, composable independently:
1. Schema + validation — `createEventSchema`, `validateEvent`, `isValidEvent`, `parseEvent`
2. Registry + factory — `EventRegistry`, `createEventFactory`
3. Transport adapters (subpath) — `/nestjs` (BullMQ/Redis), `/angular` (WebSocket bridge), `/testing` (`MockEventBus`)

Install:

```bash
npm install @signaltree/events zod
```

**Zod is required at runtime** even without authoring schemas. Peer: `zod ^3 || ^4` required. Optional peers (install only what you use): `@angular/core ^18+`, `rxjs ^7`, `@nestjs/common ^10||^11`, `bullmq ^5`, `reflect-metadata ^0.1||^0.2`. Angular range is `^18` (broader than rest of SignalTree). ESM-only — use dynamic `import()` in CommonJS consumers.

Define a schema:

```ts
import { createEventSchema, z } from '@signaltree/events';

// createEventSchema: type string + Zod raw shape (field map)
// createEventSchemaFromZod: type string + already-built ZodObject
export const UserCreatedSchema = createEventSchema('user.created', {
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});
export type UserCreated = z.infer<typeof UserCreatedSchema>;
```

Validate:

```ts
import { createEventSchema, isValidEvent, parseEvent, validateEvent, z } from '@signaltree/events';

declare const incoming: unknown;

const UserCreatedSchema = createEventSchema('user.created', {
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});

if (isValidEvent(UserCreatedSchema, incoming)) { /* typed */ }
const event = parseEvent(UserCreatedSchema, incoming);   // throws on fail
const result = validateEvent(UserCreatedSchema, incoming); // never throws; result.success + result.error.issues
```

Factory (`source` and `environment` required; `systemActor.type` must be `'user'|'system'|'admin'|'webhook'`):

```ts
import { createEventFactory } from '@signaltree/events';

const factory = createEventFactory<UserCreated>({
  source: 'api-gateway',
  environment: 'production',
  systemActor: { type: 'system', id: 'api-gateway' },
});
const created = factory.create('user.created', { id: crypto.randomUUID(), email: 'ada@example.com', name: 'Ada Lovelace' });
```

Retry + idempotency (`defaultTtlMs`, not `ttlMs`; `check` takes `(event, consumer, options?)`):

```ts
import { classifyError, isRetryableError, InMemoryIdempotencyStore, BaseEvent } from '@signaltree/events';

declare const incomingEvent: BaseEvent<string, unknown>;
declare function processEvent(e: BaseEvent<string, unknown>): Promise<void>;

try { await processEvent(incomingEvent); }
catch (err) { if (isRetryableError(err)) { /* enqueue retry */ } }

const store = new InMemoryIdempotencyStore({ defaultTtlMs: 60_000 });
const result = await store.check(incomingEvent, 'welcome-email-subscriber');
if (result.isDuplicate) return;
```

`InMemoryIdempotencyStore` is process-local — use Redis-backed store for multi-instance deployments.

NestJS (`/nestjs` subpath — requires `@nestjs/common`, `bullmq`, `reflect-metadata`):

```ts
import { EventBusModule } from '@signaltree/events/nestjs';

@Module({
  imports: [EventBusModule.forRoot({ redis: { host: 'localhost', port: 6379 }, preset: 'priority-based' })],
})
export class AppModule {}
```

Subscribers extend `BaseSubscriber<T>` with `config: SubscriberConfig` (`name`, `eventTypes`, `priority`, `concurrency`) and `handle(event): Promise<ProcessingResult>`.

Use `forRootAsync` when Redis config requires async loading.

Angular `entityMap` bridge (`/angular` subpath, v13+) — for apps holding entities in a `@signaltree/core` `entityMap`, don't hand-write a per-event `upsertOne`/`updateOne`/`removeOne` loop over an event batch; `entityEventHandler` maps the batch onto `entityMap`'s own batch ops (one `upsertMany`/`updateMany`/`removeMany` call, not one per event):

```ts
import { entityEventHandler } from '@signaltree/events/angular';
// entities: a @signaltree/core entityMap accessor, e.g. store.$.trades.entities

const flush = entityEventHandler(entities, {
  match: (e) =>
    e.type === 'TradeCreated' ? 'upsert' :
    e.type === 'TradeStatusChanged' ? 'update' :
    e.type === 'TradeCancelled' ? 'remove' : null,
  upsert: (e) => (e.type === 'TradeCreated' ? e.data.trade : undefined),
  update: (e) => (e.type === 'TradeStatusChanged' ? { id: e.data.tradeId, changes: { status: e.data.status } } : undefined),
  remove: (e) => (e.type === 'TradeCancelled' ? e.data.tradeId : undefined),
});

flush(eventsReceivedThisTick); // call with a buffered batch (your own timer/size trigger)
```

Coalescing within one batch: same-id `upsert`/`update` touches fold in arrival order (later fields win); removal always wins over any upsert/update to the same id in the same batch; structurally-identical `update` deltas collapse into one `updateMany` call; stale `remove`s (id no longer present) are silently dropped, not thrown. `mapping.match` is optional — if omitted, the op is inferred by trying `upsert`, then `update`, then `remove` extractors in order.

Optimistic updates (`/angular` subpath) — `OptimisticUpdateManager` tracks pending optimistic writes with automatic timeout-rollback; `applyOptimisticEntityChange(entities, id, change)` (v13+) derives the manager-ready `rollback` closure automatically from the entityMap's CURRENT entry instead of a hand-written closure per call site:

```ts
import { OptimisticUpdateManager, applyOptimisticEntityChange } from '@signaltree/events/angular';

const manager = new OptimisticUpdateManager();
const { data, previousData, rollback } = applyOptimisticEntityChange(entities, tradeId, { status: 'accepted' });

manager.apply({
  id: crypto.randomUUID(),
  correlationId,
  type: 'UpdateTradeStatus',
  data,
  previousData: previousData ?? data,
  timeoutMs: 5000,
  rollback, // restores previousData via upsertOne, or removeOne if this was a fresh create
});

manager.confirm(correlationId);              // server accepted
manager.rollback(correlationId, new Error()); // server rejected / explicit rollback
```

`OptimisticUpdateManager` is O(n) for a burst of N pending updates (mutates an internal `Map` in place + a version-counter signal, not a clone per op).

Testing (`/testing` subpath):

```ts
import { createEventFactory, BaseEvent } from '@signaltree/events';
import { MockEventBus } from '@signaltree/events/testing';

type UserCreated = BaseEvent<'user.created', { id: string; email: string; name: string }>;
declare const factory: ReturnType<typeof createEventFactory<UserCreated>>;
const created = factory.create('user.created', { id: crypto.randomUUID(), email: 'ada@example.com', name: 'Ada' });

const bus = new MockEventBus();
await bus.publish(created);
bus.getPublishedEvents();               // all recorded events
bus.getPublishedEventsByType('user.created');
bus.getPublishedCount('user.created');
```

Gotchas:
- Zod required — install explicitly even without schema authoring.
- `/nestjs` peers (`bullmq`, `reflect-metadata`) are optional in `peerDependenciesMeta`; package manager won't prompt. Install only for that subpath.
- `EventBusModule.forRoot` needs Redis at config time; use `forRootAsync` for async config.
- `createEventSchema` accepts a shape map (field map); `createEventSchemaFromZod` accepts a pre-built ZodObject — both normalize equivalently.
- `InMemoryIdempotencyStore` is process-local; swap to Redis-backed store for multi-instance.
- Angular peer range for this package is `^18` (not `^20`); note when consuming in older Angular apps alongside other SignalTree packages.
- Pair `entityEventHandler` with `batchedHandler(flush, flushIntervalMs, maxBatchSize)` (both from `@signaltree/events/angular`) to coalesce a live stream: `const onEvent = batchedHandler(entityEventHandler(entities, mapping), 50, 200)`. Or buffer yourself and call `flush(batch)` directly.

Related: `using-signaltree` (root), `spec-auditing`, `compression`
