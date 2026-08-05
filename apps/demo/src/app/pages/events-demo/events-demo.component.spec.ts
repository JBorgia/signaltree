import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventsDemoComponent } from './events-demo.component';

describe('EventsDemoComponent', () => {
  let component: EventsDemoComponent;
  let fixture: ComponentFixture<EventsDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventsDemoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EventsDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('event factory', () => {
    it('createTradeProposalEvent() creates a valid, logged event', () => {
      component.createTradeProposalEvent();

      const event = component.generatedEvent();
      expect(event?.type).toBe('TradeProposalCreated');
      expect(event?.id).toBeTruthy();
      expect(component.factoryLog().length).toBe(1);
      expect(component.factoryLog()[0]).toContain(event?.id);
    });

    it('createChainedEvents() links the follow-up event by causation + correlation', () => {
      component.createChainedEvents();

      const acceptEvent = component.generatedEvent();
      expect(acceptEvent?.type).toBe('TradeAccepted');
      expect(acceptEvent?.causationId).toBeTruthy();
      expect(acceptEvent?.correlationId).toBeTruthy();
      expect(component.factoryLog().length).toBe(3);
    });

    it('generateId() logs a fresh UUID v7', () => {
      component.generateId();
      expect(component.factoryLog()[0]).toContain('Generated UUID v7:');
    });

    it('clearFactoryLog() clears the log and the generated event', () => {
      component.createTradeProposalEvent();
      component.clearFactoryLog();

      expect(component.factoryLog()).toEqual([]);
      expect(component.generatedEvent()).toBeNull();
    });
  });

  describe('schema validation', () => {
    it('validates the default (valid) input and logs success', () => {
      component.validateCurrentInput();

      expect(component.validationResult()).toEqual({ isValid: true, errors: [] });
      expect(component.validationLog().at(-1)).toContain('Event is valid');
    });

    it('setInvalidInput() + validateCurrentInput() surfaces schema errors', () => {
      component.setInvalidInput();
      component.validateCurrentInput();

      const result = component.validationResult();
      expect(result?.isValid).toBe(false);
      expect(result?.errors.length).toBeGreaterThan(0);
    });

    it('validateWithIsValid() logs a boolean verdict', () => {
      component.setValidInput();
      component.validateWithIsValid();
      expect(component.validationLog().at(-1)).toContain('true (valid)');

      component.setInvalidInput();
      component.validateWithIsValid();
      expect(component.validationLog().at(-1)).toContain('false (invalid)');
    });

    it('clearValidationLog() resets the log and result', () => {
      component.validateCurrentInput();
      component.clearValidationLog();

      expect(component.validationLog()).toEqual([]);
      expect(component.validationResult()).toBeNull();
    });
  });

  describe('mock event bus', () => {
    it('publishTradeProposal() publishes, notifies subscribers, and records the event', async () => {
      await component.publishTradeProposal();

      expect(component.publishedEvents().length).toBe(1);
      expect(component.publishedEvents()[0].type).toBe('TradeProposalCreated');

      const logs = component.subscriberLogs();
      expect(logs.some((l) => l.includes('[TradeProposalCreated]'))).toBe(true);
      expect(logs.some((l) => l.includes('[*] Received event:'))).toBe(true);
    });

    it('checkEventWasPublished() reflects prior publishes', async () => {
      await component.publishTradeProposal();
      component.checkEventWasPublished();

      const logs = component.subscriberLogs();
      expect(logs.some((l) => l.includes("wasPublished('TradeProposalCreated') → true"))).toBe(
        true
      );
    });

    it('clearEventBus() resets published events and logs', async () => {
      await component.publishTradeProposal();
      component.clearEventBus();

      expect(component.publishedEvents()).toEqual([]);
      expect(component.subscriberLogs().at(-1)).toBe('Event bus cleared');
    });
  });

  describe('error classification', () => {
    it('classifies a network error as retryable (transient)', () => {
      component.setErrorType('network');
      component.classifySelectedError();

      const result = component.errorClassificationResult();
      expect(result?.classification).toBe('transient');
      expect(result?.isRetryable).toBe(true);
    });

    it('classifies a unique-constraint violation as permanent and non-retryable', () => {
      component.setErrorType('constraint');
      component.classifySelectedError();

      const result = component.errorClassificationResult();
      expect(result?.classification).toBe('permanent');
      expect(result?.isRetryable).toBe(false);
    });

    it('classifies a timeout as retryable (transient)', () => {
      component.setErrorType('timeout');
      component.classifySelectedError();

      const result = component.errorClassificationResult();
      expect(result?.classification).toBe('transient');
      expect(result?.isRetryable).toBe(true);
    });
  });

  describe('idempotency', () => {
    it('processes an event once, then detects the duplicate on reprocess', async () => {
      await component.processEventWithIdempotency();
      expect(component.processedEventIds().length).toBe(1);
      expect(component.idempotencyLog().at(-1)).toContain('recorded as processed');

      await component.reprocessLastEvent();
      expect(component.idempotencyLog().join('\n')).toContain('Duplicate detected!');
    });

    it('clearIdempotencyStore() clears the store and processed ids', async () => {
      await component.processEventWithIdempotency();
      component.clearIdempotencyStore();

      expect(component.processedEventIds()).toEqual([]);
      // A cleared store no longer recognizes any id as a duplicate.
      await component.reprocessLastEvent();
      expect(component.idempotencyLog().at(-1)).toBe(
        'No events have been processed yet'
      );
    });
  });

  describe('entity bridge (events -> entityMap)', () => {
    it('seedOrders() populates the two seed orders', () => {
      expect(component.entityDemoTree.$.orders.all().length).toBe(2);
      expect(component.orderEventLog().at(-1)).toContain('Seeded 2 orders.');
    });

    it('dispatchOrderBatch() coalesces 3 creates + 1 update + 1 cancel into one flush', () => {
      component.dispatchOrderBatch();

      const orders = component.entityDemoTree.$.orders.all();
      // 2 seeded + 3 created - 1 cancelled = 4
      expect(orders.length).toBe(4);

      const updated = orders.find((o) => o.id === 'ORD-001');
      expect(updated?.status).toBe('shipped');
      expect(orders.some((o) => o.id === 'ORD-002')).toBe(false);
    });

    it('applies, confirms, and rolls back an optimistic shipment update', () => {
      component.applyOptimisticShipment();
      expect(component.optimisticStatus()).toBe('pending');
      expect(
        component.entityDemoTree.$.orders.byId('ORD-001')()?.status
      ).toBe('shipped');

      component.confirmOptimisticShipment();
      expect(component.optimisticStatus()).toBe('confirmed');
      expect(component.optimisticPatch()).toBeNull();
    });

    it('rollbackOptimisticShipment() restores the previous snapshot', () => {
      const before = component.entityDemoTree.$.orders.byId('ORD-001')();
      expect(before?.status).toBe('pending');

      component.applyOptimisticShipment();
      component.rollbackOptimisticShipment();

      expect(component.optimisticStatus()).toBe('rolled-back');
      expect(
        component.entityDemoTree.$.orders.byId('ORD-001')()?.status
      ).toBe('pending');
    });

    it('clearOrderEventLog() empties the log', () => {
      component.clearOrderEventLog();
      expect(component.orderEventLog()).toEqual([]);
    });
  });
});
