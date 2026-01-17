import { computed, signal } from '@angular/core';

import { ConnectionState, ConnectionStatus } from './types';

/**
 * Re-export ConnectionStatus for convenience
 */
export { ConnectionStatus } from './types';

/**
 * Creates a reactive connection state object.
 *
 * @returns Connection state with signals for status, error, etc.
 *
 * @example
 * ```typescript
 * const connection = createConnectionState();
 *
 * // Update connection status
 * connection._setStatus(ConnectionStatus.Connected);
 *
 * // Read current status
 * effect(() => {
 *   console.log('Connected:', connection.isConnected());
 * });
 * ```
 */
export interface WritableConnectionState extends ConnectionState {
  /** @internal Set the connection status */
  _setStatus: (status: ConnectionStatus) => void;
  /** @internal Set the error message */
  _setError: (error: string | null) => void;
  /** @internal Increment reconnect attempts */
  _incrementReconnectAttempts: () => void;
  /** @internal Reset reconnect attempts */
  _resetReconnectAttempts: () => void;
  /** @internal Set last connected time */
  _setLastConnectedAt: (date: Date | null) => void;
}

/**
 * Creates a writable connection state for internal use.
 */
export function createConnectionState(): WritableConnectionState {
  const statusSignal = signal<ConnectionStatus>(ConnectionStatus.Disconnected);
  const errorSignal = signal<string | null>(null);
  const lastConnectedAtSignal = signal<Date | null>(null);
  const reconnectAttemptsSignal = signal<number>(0);

  const isConnected = computed(
    () => statusSignal() === ConnectionStatus.Connected
  );

  return {
    status: statusSignal.asReadonly(),
    error: errorSignal.asReadonly(),
    isConnected,
    lastConnectedAt: lastConnectedAtSignal.asReadonly(),
    reconnectAttempts: reconnectAttemptsSignal.asReadonly(),

    // Internal setters
    _setStatus: (status: ConnectionStatus) => {
      statusSignal.set(status);
      if (status === ConnectionStatus.Connected) {
        lastConnectedAtSignal.set(new Date());
        reconnectAttemptsSignal.set(0);
        errorSignal.set(null);
      }
    },
    _setError: (error: string | null) => {
      errorSignal.set(error);
      if (error) {
        statusSignal.set(ConnectionStatus.Error);
      }
    },
    _incrementReconnectAttempts: () => {
      reconnectAttemptsSignal.update((n) => n + 1);
    },
    _resetReconnectAttempts: () => {
      reconnectAttemptsSignal.set(0);
    },
    _setLastConnectedAt: (date: Date | null) => {
      lastConnectedAtSignal.set(date);
    },
  };
}
