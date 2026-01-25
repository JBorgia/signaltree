import { computed, DestroyRef, inject, Injectable, OnDestroy, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';

import { BaseEvent } from '../core/types';

/**
 * WebSocket Service - Base class for real-time event synchronization
 *
 * Provides:
 * - WebSocket connection management
 * - Automatic reconnection with exponential backoff
 * - Presence tracking
 * - SignalTree integration
 */
/**
 * WebSocket connection states
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * WebSocket configuration
 */
export interface WebSocketConfig {
  /** WebSocket URL */
  url: string;
  /** Reconnection settings */
  reconnect?: {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    maxAttempts: number;
  };
  /** Heartbeat settings */
  heartbeat?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
  };
  /** Auth token getter */
  getAuthToken?: () => string | null | Promise<string | null>;
  /** Protocols */
  protocols?: string[];
}

/**
 * WebSocket message wrapper
 */
export interface WebSocketMessage<T = unknown> {
  type:
    | 'event'
    | 'ack'
    | 'error'
    | 'ping'
    | 'pong'
    | 'subscribe'
    | 'unsubscribe';
  payload?: T;
  eventType?: string;
  correlationId?: string;
  timestamp?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<
  Pick<WebSocketConfig, 'reconnect' | 'heartbeat'>
> = {
  reconnect: {
    enabled: true,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    maxAttempts: 10,
  },
  heartbeat: {
    enabled: true,
    intervalMs: 30000,
    timeoutMs: 5000,
  },
};

/**
 * Base WebSocket service for real-time event synchronization
 *
 * Extend this class in your application and wire it to your SignalTree store.
 *
 * @example
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class AppWebSocketService extends WebSocketService {
 *   private readonly store = inject(AppStore);
 *
 *   constructor() {
 *     super({
 *       url: environment.wsUrl,
 *       getAuthToken: () => this.store.$.session.token(),
 *     });
 *
 *     // Subscribe to events
 *     this.onEvent<TradeProposalCreated>('TradeProposalCreated').subscribe(event => {
 *       this.store.$.trades.entities.upsertOne(event.data);
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class WebSocketService implements OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  // Signals for reactive state
  private readonly _connectionState = signal<ConnectionState>('disconnected');
  private readonly _lastError = signal<Error | null>(null);
  private readonly _reconnectAttempts = signal(0);
  private readonly _lastMessageTime = signal<Date | null>(null);

  // Public readonly signals
  readonly connectionState: Signal<ConnectionState> =
    this._connectionState.asReadonly();
  readonly lastError: Signal<Error | null> = this._lastError.asReadonly();
  readonly isConnected = computed(
    () => this._connectionState() === 'connected'
  );
  readonly isReconnecting = computed(
    () => this._connectionState() === 'reconnecting'
  );

  // WebSocket subject
  private socket$?: WebSocketSubject<WebSocketMessage>;
  private readonly messageSubject = new Subject<WebSocketMessage>();

  // Subscriptions tracking
  private readonly subscribedEvents = new Set<string>();
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  // Config
  protected readonly config: WebSocketConfig & typeof DEFAULT_CONFIG;

  constructor(config: WebSocketConfig) {
    this.config = {
      ...config,
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect },
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...config.heartbeat },
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (
      this._connectionState() === 'connected' ||
      this._connectionState() === 'connecting'
    ) {
      return;
    }

    this._connectionState.set('connecting');
    this._lastError.set(null);

    try {
      // Get auth token if needed
      let url = this.config.url;
      if (this.config.getAuthToken) {
        const token = await this.config.getAuthToken();
        if (token) {
          url = `${url}${
            url.includes('?') ? '&' : '?'
          }token=${encodeURIComponent(token)}`;
        }
      }

      // Create WebSocket
      const wsConfig: WebSocketSubjectConfig<WebSocketMessage> = {
        url,
        openObserver: {
          next: () => this.handleOpen(),
        },
        closeObserver: {
          next: (event) => this.handleClose(event),
        },
        protocol: this.config.protocols,
      };

      this.socket$ = webSocket(wsConfig);

      // Subscribe to messages
      this.socket$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (message) => this.handleMessage(message),
        error: (error) => this.handleError(error),
        complete: () => this.handleComplete(),
      });
    } catch (error) {
      this._connectionState.set('error');
      this._lastError.set(
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.socket$) {
      this.socket$.complete();
      this.socket$ = undefined;
    }

    this._connectionState.set('disconnected');
    this.subscribedEvents.clear();
  }

  /**
   * Send a message
   */
  send(message: WebSocketMessage): void {
    if (!this.socket$ || this._connectionState() !== 'connected') {
      console.warn('WebSocket not connected, message not sent:', message);
      return;
    }

    this.socket$.next(message);
  }

  /**
   * Subscribe to a specific event type
   *
   * @example
   * ```typescript
   * this.onEvent<TradeProposalCreated>('TradeProposalCreated').subscribe(event => {
   *   console.log('Trade created:', event);
   * });
   * ```
   */
  onEvent<T extends BaseEvent>(eventType: T['type']): Observable<T> {
    // Track subscription
    if (!this.subscribedEvents.has(eventType)) {
      this.subscribedEvents.add(eventType);

      // Send subscribe message if connected
      if (this._connectionState() === 'connected') {
        this.send({
          type: 'subscribe',
          eventType,
        });
      }
    }

    return this.messageSubject.pipe(
      filter((msg) => msg.type === 'event' && msg.eventType === eventType),
      map((msg) => msg.payload as T)
    );
  }

  /**
   * Unsubscribe from an event type
   */
  offEvent(eventType: string): void {
    if (this.subscribedEvents.has(eventType)) {
      this.subscribedEvents.delete(eventType);

      if (this._connectionState() === 'connected') {
        this.send({
          type: 'unsubscribe',
          eventType,
        });
      }
    }
  }

  /**
   * Get all messages (for debugging/logging)
   */
  get messages$(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable();
  }

  /**
   * Wait for connection to be established
   */
  async waitForConnection(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._connectionState() === 'connected') {
        resolve();
        return;
      }

      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this._connectionState() === 'connected') {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }
      }, 100);
    });
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.messageSubject.complete();
  }

  // =====================================================================
  // Protected methods for subclass customization
  // =====================================================================

  /**
   * Called when connection is established
   * Override in subclass to perform initialization
   */
  protected onConnected(): void {
    // Override in subclass
  }

  /**
   * Called when connection is lost
   * Override in subclass to handle cleanup
   */
  protected onDisconnected(): void {
    // Override in subclass
  }

  /**
   * Called when an event is received
   * Override in subclass to dispatch to store
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onEventReceived(_event: BaseEvent): void {
    // Override in subclass
  }

  // =====================================================================
  // Private handlers
  // =====================================================================

  private handleOpen(): void {
    this._connectionState.set('connected');
    this._reconnectAttempts.set(0);
    this._lastError.set(null);

    // Re-subscribe to events
    for (const eventType of this.subscribedEvents) {
      this.send({
        type: 'subscribe',
        eventType,
      });
    }

    // Start heartbeat
    if (this.config.heartbeat.enabled) {
      this.startHeartbeat();
    }

    this.onConnected();
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();

    if (event.wasClean) {
      this._connectionState.set('disconnected');
    } else {
      this._connectionState.set('error');
      this._lastError.set(
        new Error(`Connection closed: ${event.reason || 'Unknown reason'}`)
      );
    }

    this.onDisconnected();

    // Attempt reconnection if enabled
    if (this.config.reconnect.enabled && !event.wasClean) {
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    this._lastMessageTime.set(new Date());
    this.messageSubject.next(message);

    switch (message.type) {
      case 'event':
        if (message.payload) {
          this.onEventReceived(message.payload as BaseEvent);
        }
        break;

      case 'pong':
        // Heartbeat response received
        break;

      case 'error':
        console.error('Server error:', message.payload);
        break;
    }
  }

  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this._lastError.set(err);
    this._connectionState.set('error');
    console.error('WebSocket error:', err);

    // Attempt reconnection
    if (this.config.reconnect.enabled) {
      this.scheduleReconnect();
    }
  }

  private handleComplete(): void {
    this._connectionState.set('disconnected');
    this.onDisconnected();
  }

  // =====================================================================
  // Reconnection logic
  // =====================================================================

  private scheduleReconnect(): void {
    const attempts = this._reconnectAttempts();
    const maxAttempts = this.config.reconnect.maxAttempts;

    if (attempts >= maxAttempts) {
      console.error(`Max reconnection attempts (${maxAttempts}) reached`);
      this._connectionState.set('error');
      return;
    }

    this._connectionState.set('reconnecting');
    this._reconnectAttempts.set(attempts + 1);

    // Exponential backoff
    const delayMs = Math.min(
      this.config.reconnect.initialDelayMs * Math.pow(2, attempts),
      this.config.reconnect.maxDelayMs
    );

    console.log(
      `Reconnecting in ${delayMs}ms (attempt ${attempts + 1}/${maxAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  // =====================================================================
  // Heartbeat logic
  // =====================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this._connectionState() === 'connected') {
        this.send({ type: 'ping' });
      }
    }, this.config.heartbeat.intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }
}
