import { describe, expect, it } from 'vitest';

import { ConnectionStatus, createConnectionState } from './connection-state';

describe('createConnectionState()', () => {
  describe('initial state', () => {
    it('should start disconnected', () => {
      const connection = createConnectionState();

      expect(connection.status()).toBe(ConnectionStatus.Disconnected);
      expect(connection.isConnected()).toBe(false);
      expect(connection.error()).toBe(null);
      expect(connection.reconnectAttempts()).toBe(0);
      expect(connection.lastConnectedAt()).toBe(null);
    });
  });

  describe('status transitions', () => {
    it('should update status via _setStatus', () => {
      const connection = createConnectionState();

      connection._setStatus(ConnectionStatus.Connecting);
      expect(connection.status()).toBe(ConnectionStatus.Connecting);
      expect(connection.isConnected()).toBe(false);

      connection._setStatus(ConnectionStatus.Connected);
      expect(connection.status()).toBe(ConnectionStatus.Connected);
      expect(connection.isConnected()).toBe(true);
    });

    it('should clear error and reconnect attempts on successful connection', () => {
      const connection = createConnectionState();

      // Simulate failed reconnection attempts
      connection._setError('Connection failed');
      connection._incrementReconnectAttempts();
      connection._incrementReconnectAttempts();
      connection._incrementReconnectAttempts();

      expect(connection.error()).toBe('Connection failed');
      expect(connection.reconnectAttempts()).toBe(3);

      // Now connect successfully
      connection._setStatus(ConnectionStatus.Connected);

      expect(connection.error()).toBe(null);
      expect(connection.reconnectAttempts()).toBe(0);
      expect(connection.isConnected()).toBe(true);
    });

    it('should set lastConnectedAt on successful connection', () => {
      const connection = createConnectionState();

      expect(connection.lastConnectedAt()).toBe(null);

      const beforeConnect = new Date();
      connection._setStatus(ConnectionStatus.Connected);
      const afterConnect = new Date();

      const lastConnected = connection.lastConnectedAt();
      expect(lastConnected).not.toBe(null);
      expect(lastConnected!.getTime()).toBeGreaterThanOrEqual(
        beforeConnect.getTime()
      );
      expect(lastConnected!.getTime()).toBeLessThanOrEqual(
        afterConnect.getTime()
      );
    });
  });

  describe('error handling', () => {
    it('should set error and transition to error status', () => {
      const connection = createConnectionState();

      connection._setError('Network error');

      expect(connection.error()).toBe('Network error');
      expect(connection.status()).toBe(ConnectionStatus.Error);
      expect(connection.isConnected()).toBe(false);
    });

    it('should clear error when set to null', () => {
      const connection = createConnectionState();

      connection._setError('Some error');
      expect(connection.error()).toBe('Some error');

      connection._setError(null);
      expect(connection.error()).toBe(null);
    });
  });

  describe('reconnect attempts', () => {
    it('should increment reconnect attempts', () => {
      const connection = createConnectionState();

      expect(connection.reconnectAttempts()).toBe(0);

      connection._incrementReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(1);

      connection._incrementReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(2);

      connection._incrementReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(3);
    });

    it('should reset reconnect attempts', () => {
      const connection = createConnectionState();

      connection._incrementReconnectAttempts();
      connection._incrementReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(2);

      connection._resetReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(0);
    });
  });

  describe('lastConnectedAt', () => {
    it('should allow manual setting of lastConnectedAt', () => {
      const connection = createConnectionState();

      const customDate = new Date('2024-06-15T10:30:00Z');
      connection._setLastConnectedAt(customDate);

      expect(connection.lastConnectedAt()).toBe(customDate);
    });

    it('should allow clearing lastConnectedAt', () => {
      const connection = createConnectionState();

      connection._setStatus(ConnectionStatus.Connected);
      expect(connection.lastConnectedAt()).not.toBe(null);

      connection._setLastConnectedAt(null);
      expect(connection.lastConnectedAt()).toBe(null);
    });
  });

  describe('connection lifecycle', () => {
    it('should handle full connect/disconnect/reconnect cycle', () => {
      const connection = createConnectionState();

      // Initial state
      expect(connection.status()).toBe(ConnectionStatus.Disconnected);
      expect(connection.isConnected()).toBe(false);

      // Connecting
      connection._setStatus(ConnectionStatus.Connecting);
      expect(connection.status()).toBe(ConnectionStatus.Connecting);
      expect(connection.isConnected()).toBe(false);

      // Connected
      connection._setStatus(ConnectionStatus.Connected);
      expect(connection.status()).toBe(ConnectionStatus.Connected);
      expect(connection.isConnected()).toBe(true);
      const firstConnected = connection.lastConnectedAt();

      // Disconnect with error
      connection._setError('Lost connection');
      expect(connection.status()).toBe(ConnectionStatus.Error);
      expect(connection.isConnected()).toBe(false);

      // Reconnecting
      connection._setStatus(ConnectionStatus.Reconnecting);
      connection._incrementReconnectAttempts();
      expect(connection.status()).toBe(ConnectionStatus.Reconnecting);
      expect(connection.reconnectAttempts()).toBe(1);

      // Reconnect fails
      connection._setError('Reconnect failed');
      connection._incrementReconnectAttempts();
      expect(connection.reconnectAttempts()).toBe(2);

      // Finally reconnects
      connection._setStatus(ConnectionStatus.Connected);
      expect(connection.isConnected()).toBe(true);
      expect(connection.reconnectAttempts()).toBe(0);
      expect(connection.error()).toBe(null);
      // New lastConnectedAt should be >= first (may be same timestamp in fast tests)
      expect(connection.lastConnectedAt()!.getTime()).toBeGreaterThanOrEqual(
        firstConnected!.getTime()
      );
    });
  });
});
