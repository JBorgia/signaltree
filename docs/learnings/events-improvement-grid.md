# SignalTree Events - Improvement Grid

**Generated**: January 26, 2025  
**Source**: Real-world integration learnings from Swapacado migration

---

## Improvement Summary Grid

| # | Improvement | Priority | Effort | Impact | Status | Category |
|---|-------------|----------|--------|--------|--------|----------|
| 1 | Add `createEvent()` helper on EventBusService | P1 | Low | High | ✅ Done | DX - Publishing |
| 2 | Queue configuration presets | P1 | Low | Medium | ✅ Done | DX - Configuration |
| 3 | Add `publishEvent()` convenience method | P1 | Low | High | ✅ Done | DX - Publishing |
| 4 | Event fan-out / routing rules | P2 | Medium | High | ⏳ Backlog | Architecture |
| 5 | Type inference for event type from generic | P2 | Medium | Medium | ⏳ Backlog | Type Safety |
| 6 | Module-level source/environment config | P1 | Low | High | ✅ Done | DX - Configuration |
| 7 | MockEventBus parity with EventBusService | P2 | Low | Medium | ✅ Done | Testing |
| 8 | Health check endpoint integration | P2 | Low | Medium | ⏳ Backlog | Operations |
| 9 | OpenTelemetry trace propagation | P2 | Medium | High | ⏳ Backlog | Observability |
| 10 | Event schema evolution helpers | P3 | High | Medium | ⏳ Backlog | Architecture |
| 11 | Subscriber decorator improvements | P2 | Medium | Medium | ⏳ Backlog | DX - Subscribers |
| 12 | Typed event map for registry | P2 | Medium | High | ⏳ Backlog | Type Safety |
| 13 | Circuit breaker for queue failures | P3 | Medium | Medium | ⏳ Backlog | Resilience |
| 14 | Event replay utilities | P3 | High | Medium | ⏳ Backlog | Operations |
| 15 | Metrics export to Prometheus | P2 | Medium | Medium | ⏳ Backlog | Observability |
| 16 | Event batching with windowing | P3 | High | Medium | ⏳ Backlog | Performance |

---

## Detailed Improvements

### ✅ 1. Add `createEvent()` Helper on EventBusService (IMPLEMENTED)

**Problem**: Every event publish required manually constructing a full BaseEvent with id, timestamp, version, actor, metadata, etc.

**Solution Implemented**: Added `createEvent()` method to EventBusService that auto-fills:
- `id` (UUID v7)
- `timestamp` (ISO 8601)
- `correlationId`
- `version` (defaults to `{ major: 1, minor: 0 }`)
- `metadata.source` (from module config)
- `metadata.environment` (from `NODE_ENV`)

```typescript
// Before
await this.eventBus.publish({
  type: 'TradeAccepted',
  version: { major: 1, minor: 0 },
  actor: { id: userId, type: 'user' },
  metadata: { source: 'my-service', environment: 'development' },
  data: { tradeId, acceptedById },
});

// After
const event = this.eventBus.createEvent('TradeAccepted', { tradeId, acceptedById }, {
  actor: { id: userId, type: 'user' },
});
await this.eventBus.publish(event);
```

---

### ✅ 2. Queue Configuration Presets (IMPLEMENTED)

**Problem**: Configuring queues required verbose array definition with priority mappings.

**Solution Implemented**: Added `preset` option and `QUEUE_PRESETS` constant:

```typescript
// Before - verbose
EventBusModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
  queues: [
    { name: 'events-critical', priorities: ['critical'], concurrency: 10 },
    { name: 'events-high', priorities: ['high'], concurrency: 8 },
    // ... 3 more queues
  ],
});

// After - simple preset
EventBusModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
  preset: 'priority-based', // or 'single-queue', 'minimal'
});
```

Available presets:
- `'priority-based'` - 5 separate queues per priority (production recommended)
- `'single-queue'` - 1 queue with priority numbers (simpler)
- `'minimal'` - 1 queue, low concurrency (development)

---

### ✅ 3. Add `publishEvent()` Convenience Method (IMPLEMENTED)

**Problem**: Two-step pattern of `createEvent()` then `publish()` is still verbose for simple cases.

**Solution Implemented**: Added `publishEvent()` that combines both:

```typescript
// Single call to create and publish
await this.eventBus.publishEvent('TradeAccepted', { tradeId, acceptedById }, {
  actor: { id: userId, type: 'user' },
  priority: 'high',
});
```

---

### ⏳ 4. Event Fan-Out / Routing Rules

**Problem**: Publishing to multiple queues for cross-cutting concerns requires manual code.

**Proposed Solution**: Add routing configuration to EventBusModule:

```typescript
EventBusModule.forRoot({
  redis: { ... },
  preset: 'priority-based',
  routing: {
    // Pattern matching for automatic multi-queue publishing
    'Trade*': ['notifications', 'analytics'],
    'Listing*': ['analytics', 'search-indexing'],
    '*': ['audit-log'], // All events to audit
  },
});
```

**Effort**: Medium - Requires queue multiplexing logic
**Impact**: High - Cleaner separation of concerns

---

### ⏳ 5. Type Inference for Event Type from Generic

**Problem**: When publishing with a generic like `publish<TradeAccepted>()`, still need to specify `type: 'TradeAccepted'`.

**Proposed Solution**: Use TypeScript's mapped types to infer `type` field from the generic:

```typescript
// Define events with literal type
interface TradeAccepted extends BaseEvent<'TradeAccepted', { tradeId: string }> {}

// Type field auto-populated
await this.eventBus.publish<TradeAccepted>({
  // type: inferred from generic
  data: { tradeId },
  actor: { id: userId, type: 'user' },
});
```

**Effort**: Medium - Requires generic type gymnastics
**Impact**: Medium - Less redundancy, better autocomplete

---

### ✅ 6. Module-Level Source/Environment Config (IMPLEMENTED)

**Problem**: `createEvent()` originally used `metricsPrefix` as source. Should be explicit config.

**Solution Implemented**: Added `source` and `environment` to EventBusModuleConfig:

```typescript
EventBusModule.forRoot({
  redis: { host: 'localhost', port: 6379 },
  source: 'swapacado-backend',  // Used in event metadata
  environment: 'production',     // Used in event metadata
});
```

Events created via `createEvent()` or `publishEvent()` automatically use these values.

---

### ✅ 7. MockEventBus Parity with EventBusService (IMPLEMENTED)

**Problem**: MockEventBus lacked `createEvent()` and `publishEvent()` methods.

**Solution Implemented**: Added both methods to MockEventBus with matching signatures:

```typescript
const mockBus = createMockEventBus({
  source: 'test-service',
  environment: 'test',
});

// Same API as EventBusService
const event = mockBus.createEvent('TradeAccepted', { tradeId });
await mockBus.publishEvent('TradeAccepted', { tradeId }, { actor: { id: 'user-1', type: 'user' } });
```

---

### ⏳ 8. Health Check Endpoint Integration

**Problem**: No easy way to expose event bus health for Kubernetes probes or monitoring.

**Proposed Solution**: Export a health check function:

```typescript
import { EventBusHealthIndicator } from '@signaltree/events/nestjs';

// In NestJS Terminus health checks
@Controller('health')
export class HealthController {
  constructor(private eventBusHealth: EventBusHealthIndicator) {}

  @Get()
  check() {
    return this.eventBusHealth.check({
      queues: true,     // Check queue connections
      redis: true,      // Check Redis connection
      workers: true,    // Check subscriber workers
    });
  }
}
```

**Effort**: Low - Wrap existing isReady checks
**Impact**: Medium - Production readiness

---

### ⏳ 9. OpenTelemetry Trace Propagation

**Problem**: Event processing loses trace context from HTTP requests.

**Proposed Solution**: Auto-inject and extract OpenTelemetry context:

```typescript
// Automatically carried in event metadata
await this.eventBus.publishEvent('Order', data);
// metadata.traceId, metadata.spanId auto-populated from OTel context

// In subscriber - context restored
async handle(event: OrderCreated) {
  // Current span is linked to original trace
}
```

**Effort**: Medium - OTel context API integration
**Impact**: High - Distributed tracing works end-to-end

---

### ⏳ 10. Event Schema Evolution Helpers

**Problem**: Handling multiple versions of events (v1 → v2 migration) requires manual code.

**Proposed Solution**: Version migration decorators:

```typescript
@Injectable()
export class OrderSubscriber extends BaseSubscriber {
  @MigrateEvent('OrderCreated', { from: '1.0', to: '2.0' })
  migrateV1ToV2(event: OrderCreatedV1): OrderCreatedV2 {
    return { ...event, newField: calculateDefault(event) };
  }
  
  async handle(event: OrderCreatedV2) {
    // Always receives latest version
  }
}
```

**Effort**: High - Version registry, migration pipeline
**Impact**: Medium - Long-term maintainability

---

### ⏳ 11. Subscriber Decorator Improvements

**Problem**: `@OnEvent()` decorator exists but doesn't integrate well with class-based subscribers.

**Proposed Solution**: Allow decorator-based handlers within BaseSubscriber:

```typescript
@Injectable()
export class TradeSubscriber extends BaseSubscriber {
  protected readonly config = { name: 'trade-sub', eventTypes: ['Trade*'] };

  @OnEvent('TradeProposalCreated')
  handleCreated(event: TradeProposalCreated): ProcessingResult {
    return { success: true };
  }

  @OnEvent('TradeAccepted')
  handleAccepted(event: TradeAccepted): ProcessingResult {
    return { success: true };
  }
}
```

**Effort**: Medium - Decorator + reflection metadata
**Impact**: Medium - Cleaner subscriber code

---

### ⏳ 12. Typed Event Map for Registry

**Problem**: EventRegistry doesn't provide type-safe event lookups.

**Proposed Solution**: Generic event map type:

```typescript
// Define app events map
interface AppEvents {
  TradeProposalCreated: TradeProposalCreated;
  TradeAccepted: TradeAccepted;
  ListingCreated: ListingCreated;
}

// Typed registry
const registry = createEventRegistry<AppEvents>({ events: AppEventSchemas });

// Type-safe publish
await eventBus.publish<'TradeAccepted'>({ data: { tradeId } }); // Full type inference
```

**Effort**: Medium - Generic type constraints
**Impact**: High - Full end-to-end type safety

---

### ⏳ 13. Circuit Breaker for Queue Failures

**Problem**: Redis outages cause publish failures with no graceful degradation.

**Proposed Solution**: Built-in circuit breaker:

```typescript
EventBusModule.forRoot({
  redis: { ... },
  circuitBreaker: {
    failureThreshold: 5,      // Open after 5 failures
    resetTimeoutMs: 30000,    // Try again after 30s
    fallback: 'memory-queue', // Queue in memory during outage
  },
});
```

**Effort**: Medium - State machine, fallback queue
**Impact**: Medium - Improved resilience

---

### ⏳ 14. Event Replay Utilities

**Problem**: Replaying events from DLQ or for testing requires manual scripting.

**Proposed Solution**: Built-in replay command:

```typescript
// Replay from DLQ
await dlqService.replayAll({ 
  filter: { eventType: 'Trade*', since: new Date('2025-01-01') },
  targetQueue: 'events-normal',
});

// Replay specific events
await eventBus.replay(eventIds, { delay: 100 }); // Rate-limited replay
```

**Effort**: High - DLQ querying, replay orchestration
**Impact**: Medium - Operational recovery

---

### ⏳ 15. Metrics Export to Prometheus

**Problem**: Metrics are collected but not easily exported.

**Proposed Solution**: Prometheus exporter endpoint:

```typescript
import { EventBusMetricsController } from '@signaltree/events/nestjs';

// GET /metrics/events returns Prometheus format:
// signaltree_events_published_total{queue="events-high",type="TradeCreated"} 142
// signaltree_events_processing_duration_seconds_bucket{...} 0.25
```

**Effort**: Medium - Prometheus client integration
**Impact**: Medium - Production observability

---

### ⏳ 16. Event Batching with Windowing

**Problem**: High-frequency events (analytics, metrics) flood queues.

**Proposed Solution**: Configurable batching/windowing:

```typescript
// Batch multiple events into one job
await eventBus.publishBatched('PageView', views, {
  windowMs: 5000,      // Collect for 5 seconds
  maxBatchSize: 100,   // Or until 100 events
});

// Subscriber receives batch
async handle(events: PageView[]): Promise<ProcessingResult> {
  await this.analytics.bulkInsert(events);
}
```

**Effort**: High - Time-based aggregation, batch job format
**Impact**: Medium - Throughput for high-volume events

---

## Implementation Roadmap

### Phase 1 - Quick Wins (Done ✅)
- [x] `createEvent()` helper
- [x] Queue presets
- [x] `publishEvent()` convenience method
- [x] Module-level source/environment config
- [x] MockEventBus parity

### Phase 2 - DX Polish (Next Sprint)
- [ ] Health check integration
- [ ] Typed event map for registry
- [ ] Subscriber decorator improvements

### Phase 3 - Production Hardening
- [ ] OpenTelemetry integration
- [ ] Circuit breaker
- [ ] Prometheus metrics

### Phase 4 - Advanced Features
- [ ] Event routing/fan-out
- [ ] Schema evolution helpers
- [ ] Event replay utilities
- [ ] Batching with windowing

---

## Legend

- **Priority**: P1 (Critical), P2 (Important), P3 (Nice to have)
- **Effort**: Low (< 1 day), Medium (1-3 days), High (> 3 days)
- **Impact**: High (major DX/perf), Medium (noticeable), Low (minor)
- **Status**: ✅ Done, ⏳ Backlog, 🚧 In Progress
