/**
 * Injection tokens for the EventBus module
 */

export const EVENT_BUS_CONFIG = Symbol('EVENT_BUS_CONFIG');
export const EVENT_REGISTRY = Symbol('EVENT_REGISTRY');
export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');
export const ERROR_CLASSIFIER = Symbol('ERROR_CLASSIFIER');
export const DLQ_SERVICE = Symbol('DLQ_SERVICE');
