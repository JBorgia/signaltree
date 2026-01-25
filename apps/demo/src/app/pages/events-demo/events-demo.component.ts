import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  z,
  type BaseEvent,
  type EventPriority,
  EVENT_PRIORITIES,
  createEventSchema,
  validateEvent,
  isValidEvent,
  EventValidationError,
  createEventFactory,
  generateEventId,
  classifyError,
  isRetryableError,
  generateIdempotencyKey,
} from '@signaltree/events';
import {
  createMockEventBus,
  createTestEvent,
  type MockEventBus,
  type PublishedEvent,
} from '@signaltree/events/testing';

// =============================================================================
// DEMO EVENT TYPES
// =============================================================================

// Define event schemas with Zod for runtime validation
const TradeProposalCreatedSchema = createEventSchema('TradeProposalCreated', {
  tradeId: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  vehicleOfferedId: z.string().uuid(),
  vehicleRequestedId: z.string().uuid().optional(),
  cashDifference: z.number().optional(),
});

type TradeProposalCreated = z.infer<typeof TradeProposalCreatedSchema>;

const TradeAcceptedSchema = createEventSchema('TradeAccepted', {
  tradeId: z.string().uuid(),
  acceptedById: z.string().uuid(),
  acceptedAt: z.string().datetime(),
});

type TradeAccepted = z.infer<typeof TradeAcceptedSchema>;

const UserRegisteredSchema = createEventSchema('UserRegistered', {
  userId: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
});

type UserRegistered = z.infer<typeof UserRegisteredSchema>;

// Union of all demo events
type DemoEvent = TradeProposalCreated | TradeAccepted | UserRegistered;

// =============================================================================
// COMPONENT
// =============================================================================

@Component({
  selector: 'app-events-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events-demo.component.html',
  styleUrls: ['./events-demo.component.scss'],
})
export class EventsDemoComponent {
  // =============================================================================
  // STATE
  // =============================================================================

  // Event Factory Demo
  readonly eventFactory = createEventFactory<DemoEvent>({
    source: 'events-demo',
    environment: 'development',
  });

  readonly generatedEvent = signal<DemoEvent | null>(null);
  readonly factoryLog = signal<string[]>([]);

  // Validation Demo
  readonly validationResult = signal<{
    isValid: boolean;
    errors: string[];
  } | null>(null);
  readonly validationInput = signal(`{
  "type": "TradeProposalCreated",
  "data": {
    "tradeId": "550e8400-e29b-41d4-a716-446655440000",
    "initiatorId": "550e8400-e29b-41d4-a716-446655440001",
    "recipientId": "550e8400-e29b-41d4-a716-446655440002",
    "vehicleOfferedId": "550e8400-e29b-41d4-a716-446655440003"
  }
}`);
  readonly validationLog = signal<string[]>([]);

  // MockEventBus Demo
  readonly mockEventBus: MockEventBus = createMockEventBus({
    simulateAsync: true,
    asyncDelayMs: 100,
  });
  readonly publishedEvents = signal<BaseEvent[]>([]);
  readonly subscriberLogs = signal<string[]>([]);

  // Error Classification Demo
  readonly errorClassificationResult = signal<{
    classification: string;
    reason: string;
    isRetryable: boolean;
    retryConfig: { maxAttempts: number; initialDelayMs: number };
  } | null>(null);
  readonly errorType = signal<
    'network' | 'validation' | 'constraint' | 'timeout' | 'unknown'
  >('network');

  // Idempotency Demo - simplified for demo purposes
  // (Real implementation uses InMemoryIdempotencyStore with BaseEvent objects)
  private readonly processedEventsMap = new Map<string, { processedAt: Date; result: unknown }>();
  readonly idempotencyLog = signal<string[]>([]);
  readonly processedEventIds = signal<string[]>([]);

  // Active tab
  readonly activeTab = signal<
    'factory' | 'validation' | 'eventbus' | 'errors' | 'idempotency'
  >('factory');

  // Computed - priority info display
  readonly priorityInfo = computed(() => {
    return (
      Object.entries(EVENT_PRIORITIES) as [
        EventPriority,
        { sla: number; weight: number }
      ][]
    ).map(([priority, config]) => ({
      priority: priority,
      slaMs: config.sla,
      weight: config.weight,
    }));
  });

  constructor() {
    // Set up MockEventBus subscriptions
    this.mockEventBus.subscribe('TradeProposalCreated', (event: BaseEvent) => {
      this.logSubscriber(
        `[TradeProposalCreated] Trade ${
          (event as TradeProposalCreated).data.tradeId
        } proposed`
      );
    });

    this.mockEventBus.subscribe('TradeAccepted', (event: BaseEvent) => {
      this.logSubscriber(
        `[TradeAccepted] Trade ${
          (event as TradeAccepted).data.tradeId
        } accepted`
      );
    });

    this.mockEventBus.subscribeAll((event: BaseEvent) => {
      this.logSubscriber(`[*] Received event: ${event.type}`);
    });
  }

  // =============================================================================
  // TAB NAVIGATION
  // =============================================================================

  setActiveTab(
    tab: 'factory' | 'validation' | 'eventbus' | 'errors' | 'idempotency'
  ) {
    this.activeTab.set(tab);
  }

  // =============================================================================
  // EVENT FACTORY DEMO
  // =============================================================================

  createTradeProposalEvent() {
    const event = this.eventFactory.create<TradeProposalCreated>(
      'TradeProposalCreated',
      {
        tradeId: crypto.randomUUID(),
        initiatorId: crypto.randomUUID(),
        recipientId: crypto.randomUUID(),
        vehicleOfferedId: crypto.randomUUID(),
        cashDifference: Math.floor(Math.random() * 5000),
      },
      {
        priority: 'high',
        actor: { id: 'demo-user', type: 'user', name: 'Demo User' },
        aggregate: { type: 'Trade', id: crypto.randomUUID() },
      }
    );

    this.generatedEvent.set(event);
    this.logFactory(`Created TradeProposalCreated event with ID: ${event.id}`);
  }

  createChainedEvents() {
    // Create initial event
    const proposalEvent = this.eventFactory.create<TradeProposalCreated>(
      'TradeProposalCreated',
      {
        tradeId: crypto.randomUUID(),
        initiatorId: crypto.randomUUID(),
        recipientId: crypto.randomUUID(),
        vehicleOfferedId: crypto.randomUUID(),
      },
      { priority: 'high' }
    );

    this.logFactory(
      `1. Created proposal event: ${proposalEvent.id.slice(0, 8)}...`
    );

    // Create follow-up event from the proposal (maintains correlation)
    const acceptEvent = this.eventFactory.createFromCause<TradeAccepted>(
      'TradeAccepted',
      {
        tradeId: proposalEvent.data.tradeId,
        acceptedById: proposalEvent.data.recipientId,
        acceptedAt: new Date().toISOString(),
      },
      proposalEvent
    );

    this.logFactory(
      `2. Created accept event: ${acceptEvent.id.slice(
        0,
        8
      )}... (caused by ${acceptEvent.causationId?.slice(0, 8)}...)`
    );
    this.logFactory(
      `   Correlation ID maintained: ${acceptEvent.correlationId?.slice(
        0,
        8
      )}...`
    );

    this.generatedEvent.set(acceptEvent);
  }

  generateId() {
    const id = generateEventId();
    this.logFactory(`Generated UUID v7: ${id}`);
    this.logFactory(`  - Time-sortable: events can be ordered by ID`);
  }

  private logFactory(message: string) {
    this.factoryLog.update((log) => [...log, message]);
  }

  clearFactoryLog() {
    this.factoryLog.set([]);
    this.generatedEvent.set(null);
  }

  // =============================================================================
  // VALIDATION DEMO
  // =============================================================================

  validateCurrentInput() {
    const input = this.validationInput();

    try {
      const parsed = JSON.parse(input);
      const eventType = parsed.type;

      // Select the appropriate schema
      let schema;
      switch (eventType) {
        case 'TradeProposalCreated':
          schema = TradeProposalCreatedSchema;
          break;
        case 'TradeAccepted':
          schema = TradeAcceptedSchema;
          break;
        case 'UserRegistered':
          schema = UserRegisteredSchema;
          break;
        default:
          this.validationResult.set({
            isValid: false,
            errors: [`Unknown event type: ${eventType}`],
          });
          return;
      }

      // Validate using the schema - validateEvent throws on failure
      try {
        validateEvent(schema, parsed);
        this.validationResult.set({ isValid: true, errors: [] });
        this.logValidation(`✓ Event is valid: ${eventType}`);
      } catch (validationError: unknown) {
        if (validationError instanceof EventValidationError) {
          const errors: string[] = validationError.issues;
          this.validationResult.set({ isValid: false, errors });
          this.logValidation(
            `✗ Validation failed with ${errors.length} error(s)`
          );
          errors.forEach((e: string) => this.logValidation(`  - ${e}`));
        } else {
          throw validationError;
        }
      }
    } catch (e) {
      this.validationResult.set({
        isValid: false,
        errors: [`JSON parse error: ${(e as Error).message}`],
      });
      this.logValidation(`✗ Failed to parse JSON: ${(e as Error).message}`);
    }
  }

  validateWithIsValid() {
    try {
      const parsed = JSON.parse(this.validationInput());
      const isValid = isValidEvent(TradeProposalCreatedSchema, parsed);
      this.logValidation(
        `isValidEvent() → ${isValid ? 'true (valid)' : 'false (invalid)'}`
      );
    } catch (e) {
      this.logValidation(`Error: ${(e as Error).message}`);
    }
  }

  setInvalidInput() {
    this.validationInput.set(`{
  "type": "TradeProposalCreated",
  "data": {
    "tradeId": "not-a-uuid",
    "initiatorId": "also-not-uuid",
    "recipientId": "",
    "vehicleOfferedId": "123"
  }
}`);
    this.logValidation('Set invalid input (non-UUID values, empty string)');
  }

  setValidInput() {
    this.validationInput.set(`{
  "type": "TradeProposalCreated",
  "data": {
    "tradeId": "550e8400-e29b-41d4-a716-446655440000",
    "initiatorId": "550e8400-e29b-41d4-a716-446655440001",
    "recipientId": "550e8400-e29b-41d4-a716-446655440002",
    "vehicleOfferedId": "550e8400-e29b-41d4-a716-446655440003"
  }
}`);
    this.logValidation('Set valid input');
  }

  private logValidation(message: string) {
    this.validationLog.update((log) => [...log, message]);
  }

  clearValidationLog() {
    this.validationLog.set([]);
    this.validationResult.set(null);
  }

  // =============================================================================
  // MOCK EVENT BUS DEMO
  // =============================================================================

  async publishTradeProposal() {
    const event = createTestEvent<
      'TradeProposalCreated',
      TradeProposalCreated['data']
    >(
      'TradeProposalCreated',
      {
        tradeId: crypto.randomUUID(),
        initiatorId: crypto.randomUUID(),
        recipientId: crypto.randomUUID(),
        vehicleOfferedId: crypto.randomUUID(),
      },
      { priority: 'high' }
    );

    this.logSubscriber(`Publishing TradeProposalCreated...`);
    const result = await this.mockEventBus.publish(event);
    this.logSubscriber(`Published to queue: ${result.queue}`);

    this.updatePublishedEvents();
  }

  async publishTradeAccepted() {
    const event = createTestEvent<'TradeAccepted', TradeAccepted['data']>(
      'TradeAccepted',
      {
        tradeId: crypto.randomUUID(),
        acceptedById: crypto.randomUUID(),
        acceptedAt: new Date().toISOString(),
      }
    );

    this.logSubscriber(`Publishing TradeAccepted...`);
    await this.mockEventBus.publish(event);

    this.updatePublishedEvents();
  }

  checkEventWasPublished() {
    const wasPublished = this.mockEventBus.wasPublished('TradeProposalCreated');
    this.logSubscriber(
      `wasPublished('TradeProposalCreated') → ${wasPublished}`
    );

    const events = this.mockEventBus.getPublishedEventsByType('TradeProposalCreated');
    this.logSubscriber(
      `  Found ${events.length} TradeProposalCreated event(s)`
    );
  }

  clearEventBus() {
    this.mockEventBus.reset();
    this.publishedEvents.set([]);
    this.logSubscriber('Event bus cleared');
  }

  private updatePublishedEvents() {
    this.publishedEvents.set(
      this.mockEventBus
        .getPublishedEvents()
        .map((pe: PublishedEvent) => pe.event)
    );
  }

  private logSubscriber(message: string) {
    this.subscriberLogs.update((log) => [...log, message]);
  }

  clearSubscriberLogs() {
    this.subscriberLogs.set([]);
  }

  // =============================================================================
  // ERROR CLASSIFICATION DEMO
  // =============================================================================

  classifySelectedError() {
    let error: Error;

    switch (this.errorType()) {
      case 'network':
        error = new Error('ECONNREFUSED: Connection refused');
        break;
      case 'validation':
        error = new Error('Validation failed: email is required');
        (error as Error & { code: string }).code = 'VALIDATION_ERROR';
        break;
      case 'constraint':
        error = new Error('Unique constraint violation: email already exists');
        (error as Error & { code: string }).code = 'P2002'; // Prisma unique violation
        break;
      case 'timeout':
        error = new Error('Request timeout after 30000ms');
        error.name = 'TimeoutError';
        break;
      default:
        error = new Error('Something went wrong');
    }

    const classification = classifyError(error);
    const retryable = isRetryableError(error);

    this.errorClassificationResult.set({
      classification: classification.classification,
      reason: classification.reason,
      isRetryable: retryable,
      retryConfig: {
        maxAttempts: classification.retryConfig?.maxAttempts ?? 0,
        initialDelayMs: classification.retryConfig?.initialDelayMs ?? 0,
      },
    });
  }

  setErrorType(
    type: 'network' | 'validation' | 'constraint' | 'timeout' | 'unknown'
  ) {
    this.errorType.set(type);
  }

  // =============================================================================
  // IDEMPOTENCY DEMO
  // =============================================================================

  async processEventWithIdempotency() {
    const eventId = generateEventId();
    const idempotencyKey = generateIdempotencyKey(
      { id: eventId } as BaseEvent,
      'process-trade'
    );

    this.logIdempotency(`Processing event ${eventId.slice(0, 8)}...`);
    this.logIdempotency(`Idempotency key: ${idempotencyKey.slice(0, 24)}...`);

    // Check if already processed
    const existing = this.processedEventsMap.get(idempotencyKey);

    if (existing) {
      this.logIdempotency(
        `✗ Event already processed at ${existing.processedAt.toISOString()}`
      );
      return;
    }

    // "Process" the event
    this.logIdempotency(`✓ Processing event (first time)...`);

    // Record as processed
    this.processedEventsMap.set(idempotencyKey, {
      processedAt: new Date(),
      result: { processed: true },
    });

    this.processedEventIds.update((ids) => [...ids, eventId]);
    this.logIdempotency(`✓ Event recorded as processed`);
  }

  async reprocessLastEvent() {
    const ids = this.processedEventIds();
    if (ids.length === 0) {
      this.logIdempotency('No events have been processed yet');
      return;
    }

    const lastEventId = ids[ids.length - 1];
    const idempotencyKey = generateIdempotencyKey(
      { id: lastEventId } as BaseEvent,
      'process-trade'
    );

    this.logIdempotency(
      `Attempting to re-process event ${lastEventId.slice(0, 8)}...`
    );

    const existing = this.processedEventsMap.get(idempotencyKey);

    if (existing) {
      this.logIdempotency(
        `✗ Duplicate detected! Event was processed at ${existing.processedAt.toISOString()}`
      );
      this.logIdempotency(
        `  Original result: ${JSON.stringify(existing.result)}`
      );
    } else {
      this.logIdempotency(`? Unexpectedly not found in store`);
    }
  }

  clearIdempotencyStore() {
    this.processedEventsMap.clear();
    this.processedEventIds.set([]);
    this.logIdempotency('Idempotency store cleared');
  }

  private logIdempotency(message: string) {
    this.idempotencyLog.update((log) => [...log, message]);
  }

  clearIdempotencyLog() {
    this.idempotencyLog.set([]);
  }
}
