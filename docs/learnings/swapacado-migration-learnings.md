# SignalTree Events - Learnings from Swapacado Migration

**Date**: January 26, 2025  
**Context**: Migrating Swapacado backend from a local event bus implementation to `@signaltree/events/nestjs`
**Status**: P1 and P2 improvements implemented ✅

> **Note (Feb 2026):** `@signaltree/events` is now **ESM-only**. If you're consuming `@signaltree/events/nestjs` from Node/NestJS, your backend must run in ESM mode (e.g. `package.json` has `"type": "module"`, and TypeScript uses `"module": "NodeNext"` + `"moduleResolution": "NodeNext"`).

---

## Summary

This document captures pain points and improvement opportunities discovered while integrating `@signaltree/events@7.4.1` into a production NestJS application.

---

## Pain Points Identified

### 1. Missing `createEvent()` Helper on EventBusService

**Problem**: The local implementation had a convenient `createEvent()` method on EventBusService:

```typescript
// Local implementation (more ergonomic)
const event = this.eventBus.createEvent<'TradeAccepted', TradeAccepted['data']>(
  'TradeAccepted',
  { tradeId, acceptedById, initiatorId, recipientId, acceptedAt: new Date().toISOString() },
  { actor: { id: acceptedById, type: 'user' }, metadata: { tradeId } }
);
await this.eventBus.publish(event);
```

SignalTree requires manually constructing the full event object:

```typescript
// Current signaltree approach (more verbose)
await this.eventBus.publish<TradeAccepted>({
  type: 'TradeAccepted',
  version: { major: 1, minor: 0 },
  actor: { id: acceptedById, type: 'user' },
  metadata: {
    source: 'swapacado-backend',
    environment: process.env.NODE_ENV || 'development',
    tradeId,
  },
  data: {
    tradeId,
    acceptedById,
    initiatorId,
    recipientId,
    acceptedAt: new Date().toISOString(),
  },
});
```

**Impact**: 
- ~40% more boilerplate code per event publish
- Repeated `source`, `environment`, `version` values across all event publishes
- Higher chance of inconsistency in metadata

**Recommendation**: Add a `createEvent()` convenience method to EventBusService, or provide a pre-configured factory that's injected with defaults:

```typescript
// Option A: Method on EventBusService
const event = this.eventBus.createEvent('TradeAccepted', data, { actor, metadata });

// Option B: Inject EventFactory with defaults
constructor(
  private eventBus: EventBusService,
  private eventFactory: EventFactory, // Pre-configured with source/env
) {}

const event = this.eventFactory.create('TradeAccepted', data, { actor });
await this.eventBus.publish(event);
```

---

### 2. No Built-in Event Fan-Out / Routing

**Problem**: The local implementation had routing rules that automatically fanned out events to multiple queues:

```typescript
// Local implementation
private readonly routingRules = {
  'TradeProposalCreated': ['NOTIFICATIONS', 'EMAILS', 'ANALYTICS'],
  'ListingCreated': ['ANALYTICS', 'SEARCH'],
  // ...
};
```

SignalTree's EventBusModule publishes to a single queue based on priority. Cross-cutting concerns (notifications, analytics, search indexing) require either:
- Multiple explicit publish calls, or
- Subscribers that re-publish to other queues

**Impact**:
- Harder to implement "publish once, process many" patterns
- Business logic polluted with infrastructure concerns

**Recommendation**: Add optional routing configuration to EventBusModule:

```typescript
EventBusModule.forRoot({
  redis: { ... },
  queues: [ ... ],
  routing: {
    // Events matching these patterns also publish to these queues
    'Trade*': ['notifications', 'analytics'],
    'Listing*': ['analytics', 'search'],
  },
});
```

---

### 3. Module Configuration Ergonomics

**Problem**: Configuring EventBusModule requires understanding the queue/priority mapping:

```typescript
EventBusModule.forRootAsync({
  useFactory: (config) => ({
    redis: { ... },
    queues: [
      { name: 'events-critical', priorities: ['critical'] },
      { name: 'events-high', priorities: ['high'] },
      { name: 'events-normal', priorities: ['normal'] },
      { name: 'events-low', priorities: ['low'] },
      { name: 'events-bulk', priorities: ['bulk'] },
    ],
  }),
});
```

**Impact**: 
- Verbose configuration for common patterns
- Easy to misconfigure (e.g., forget a priority level)

**Recommendation**: Provide a preset for common configurations:

```typescript
// Simple preset
EventBusModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
  preset: 'priority-based', // Creates standard 5-queue setup
});

// Or keep queues but have sensible defaults
EventBusModule.forRoot({
  redis: { ... },
  // queues defaults to priority-based if not specified
});
```

---

### 4. Type Inference for Event Data

**Problem**: When calling `publish<T>()`, the event object still requires all fields to be manually typed:

```typescript
await this.eventBus.publish<TradeAccepted>({
  type: 'TradeAccepted', // Redundant - could infer from generic
  version: { major: 1, minor: 0 }, // Always the same
  // ...
});
```

**Recommendation**: Allow the generic type to drive defaults:

```typescript
// If TradeAccepted has a static 'type' property, use it
await this.eventBus.publish<TradeAccepted>({
  actor: { ... },
  data: { ... }, // Only required fields
});
// type, version auto-populated from TradeAccepted type definition
```

---

## What Worked Well

### 1. Global Module Pattern
The `@Global()` decorator on EventBusModule meant we didn't need to import it in every feature module - EventBusService was available everywhere.

### 2. BaseSubscriber Pattern
The `BaseSubscriber` class with built-in idempotency, error classification, and DLQ handling is excellent. It reduced subscriber boilerplate significantly.

### 3. Registry-Based Validation
The EventRegistry with Zod schemas catches invalid events early. This prevented several bugs during migration.

### 4. Partial Event Acceptance
The `publish()` method accepting `Omit<T, 'id' | 'timestamp'>` and filling in defaults is convenient - it just needs more defaults.

---

## Suggested Improvements Priority

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| P1 | Add `createEvent()` helper | Low | High |
| P2 | Default queue configuration preset | Low | Medium |
| P3 | Event routing/fan-out support | Medium | High |
| P4 | Better type inference | Medium | Medium |

---

## Code Examples for Reference

### Before (Local Implementation)
```typescript
private async publishTradeAcceptedEvent(tradeId: string, acceptedById: string, initiatorId: string, recipientId: string) {
  const event = this.eventBus.createEvent<'TradeAccepted', TradeAccepted['data']>(
    'TradeAccepted',
    { tradeId, acceptedById, initiatorId, recipientId, acceptedAt: new Date().toISOString() },
    { actor: { id: acceptedById, type: 'user' }, metadata: { tradeId } }
  );
  await this.eventBus.publish(event);
}
```

### After (SignalTree)
```typescript
private async publishTradeAcceptedEvent(tradeId: string, acceptedById: string, initiatorId: string, recipientId: string) {
  await this.eventBus.publish<TradeAccepted>({
    type: 'TradeAccepted',
    version: { major: 1, minor: 0 },
    actor: { id: acceptedById, type: 'user' },
    metadata: {
      source: 'swapacado-backend',
      environment: process.env.NODE_ENV || 'development',
      tradeId,
    },
    data: { tradeId, acceptedById, initiatorId, recipientId, acceptedAt: new Date().toISOString() },
  });
}
```

### Ideal (Proposed)
```typescript
private async publishTradeAcceptedEvent(tradeId: string, acceptedById: string, initiatorId: string, recipientId: string) {
  await this.eventBus.publish('TradeAccepted', 
    { tradeId, acceptedById, initiatorId, recipientId, acceptedAt: new Date().toISOString() },
    { actor: { id: acceptedById, type: 'user' }, metadata: { tradeId } }
  );
}
```

---

## Next Steps

1. Create GitHub issues for each improvement
2. Prototype `createEvent()` helper in a branch
3. Consider publishing these learnings to SignalTree docs

