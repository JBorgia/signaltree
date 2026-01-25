import { DynamicModule, InjectionToken, Module, OptionalFactoryDependency, Provider, Type } from '@nestjs/common';

import {
    createErrorClassifier,
    createEventRegistry,
    createInMemoryIdempotencyStore,
    ErrorClassifierConfig,
    EventRegistryConfig,
    IdempotencyStore,
} from '..';
import { DlqService } from './dlq.service';
import { EventBusService } from './event-bus.service';
import { ERROR_CLASSIFIER, EVENT_BUS_CONFIG, EVENT_REGISTRY, IDEMPOTENCY_STORE } from './tokens';

/**
 * EventBus Module - NestJS module for event-driven architecture
 *
 * Provides:
 * - BullMQ queue integration
 * - Event publishing with priority routing
 * - Idempotency and retry handling
 * - DLQ management
 */
/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  maxRetriesPerRequest?: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Queue name */
  name: string;
  /** Priority levels routed to this queue */
  priorities: string[];
  /** Concurrency for this queue */
  concurrency?: number;
  /** Rate limit per interval */
  rateLimit?: {
    max: number;
    duration: number; // in ms
  };
}

/**
 * EventBus module configuration
 */
export interface EventBusModuleConfig {
  /** Redis connection config */
  redis: RedisConfig;

  /** Queue configuration (defaults to priority-based queues) */
  queues?: QueueConfig[];

  /** Event registry configuration */
  registry?: EventRegistryConfig;

  /** Custom idempotency store (defaults to in-memory) */
  idempotencyStore?: IdempotencyStore;

  /** Error classifier configuration */
  errorClassifier?: ErrorClassifierConfig;

  /** Enable DLQ (default: true) */
  enableDlq?: boolean;

  /** DLQ queue name (default: 'dead-letter') */
  dlqQueueName?: string;

  /** Global concurrency limit */
  globalConcurrency?: number;

  /** Enable metrics (default: true) */
  enableMetrics?: boolean;

  /** Metrics prefix */
  metricsPrefix?: string;
}

/**
 * Default queue configuration based on priorities
 */
const DEFAULT_QUEUES: QueueConfig[] = [
  { name: 'events-critical', priorities: ['critical'], concurrency: 10 },
  { name: 'events-high', priorities: ['high'], concurrency: 8 },
  { name: 'events-normal', priorities: ['normal'], concurrency: 5 },
  { name: 'events-low', priorities: ['low'], concurrency: 3 },
  {
    name: 'events-bulk',
    priorities: ['bulk'],
    concurrency: 2,
    rateLimit: { max: 100, duration: 1000 },
  },
];

/**
 * Async configuration options
 */
export interface EventBusModuleAsyncConfig {
  imports?: Type<unknown>[];
  useFactory: (
    ...args: unknown[]
  ) => Promise<EventBusModuleConfig> | EventBusModuleConfig;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
}

@Module({})
export class EventBusModule {
  /**
   * Register the EventBus module with configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EventBusModule.forRoot({
   *       redis: { host: 'localhost', port: 6379 },
   *       queues: [
   *         { name: 'critical', priorities: ['critical'], concurrency: 10 },
   *         { name: 'normal', priorities: ['high', 'normal'], concurrency: 5 },
   *       ],
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(config: EventBusModuleConfig): DynamicModule {
    const providers = EventBusModule.createProviders(config);

    return {
      module: EventBusModule,
      global: true,
      providers,
      exports: [
        EventBusService,
        DlqService,
        EVENT_BUS_CONFIG,
        EVENT_REGISTRY,
        IDEMPOTENCY_STORE,
        ERROR_CLASSIFIER,
      ],
    };
  }

  /**
   * Register the EventBus module with async configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EventBusModule.forRootAsync({
   *       imports: [ConfigModule],
   *       useFactory: (configService: ConfigService) => ({
   *         redis: {
   *           host: configService.get('REDIS_HOST'),
   *           port: configService.get('REDIS_PORT'),
   *         },
   *       }),
   *       inject: [ConfigService],
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(asyncConfig: EventBusModuleAsyncConfig): DynamicModule {
    const configProvider: Provider = {
      provide: EVENT_BUS_CONFIG,
      useFactory: asyncConfig.useFactory,
      inject: (asyncConfig.inject ?? []) as (
        | InjectionToken
        | OptionalFactoryDependency
      )[],
    };

    const registryProvider: Provider = {
      provide: EVENT_REGISTRY,
      useFactory: (config: EventBusModuleConfig) => {
        return createEventRegistry(config.registry);
      },
      inject: [EVENT_BUS_CONFIG],
    };

    const idempotencyProvider: Provider = {
      provide: IDEMPOTENCY_STORE,
      useFactory: (config: EventBusModuleConfig) => {
        return config.idempotencyStore ?? createInMemoryIdempotencyStore();
      },
      inject: [EVENT_BUS_CONFIG],
    };

    const errorClassifierProvider: Provider = {
      provide: ERROR_CLASSIFIER,
      useFactory: (config: EventBusModuleConfig) => {
        return createErrorClassifier(config.errorClassifier);
      },
      inject: [EVENT_BUS_CONFIG],
    };

    return {
      module: EventBusModule,
      global: true,
      imports: asyncConfig.imports ?? [],
      providers: [
        configProvider,
        registryProvider,
        idempotencyProvider,
        errorClassifierProvider,
        EventBusService,
        DlqService,
      ],
      exports: [
        EventBusService,
        DlqService,
        EVENT_BUS_CONFIG,
        EVENT_REGISTRY,
        IDEMPOTENCY_STORE,
        ERROR_CLASSIFIER,
      ],
    };
  }

  private static createProviders(config: EventBusModuleConfig): Provider[] {
    const queues = config.queues ?? DEFAULT_QUEUES;
    const fullConfig: EventBusModuleConfig = {
      ...config,
      queues,
      enableDlq: config.enableDlq ?? true,
      dlqQueueName: config.dlqQueueName ?? 'dead-letter',
      enableMetrics: config.enableMetrics ?? true,
      metricsPrefix: config.metricsPrefix ?? 'signaltree_events',
    };

    return [
      {
        provide: EVENT_BUS_CONFIG,
        useValue: fullConfig,
      },
      {
        provide: EVENT_REGISTRY,
        useFactory: () => createEventRegistry(config.registry),
      },
      {
        provide: IDEMPOTENCY_STORE,
        useValue: config.idempotencyStore ?? createInMemoryIdempotencyStore(),
      },
      {
        provide: ERROR_CLASSIFIER,
        useFactory: () => createErrorClassifier(config.errorClassifier),
      },
      EventBusService,
      DlqService,
    ];
  }
}
