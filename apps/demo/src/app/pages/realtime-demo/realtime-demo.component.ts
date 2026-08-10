import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { entityMap, signalTree } from '@signaltree/core';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
}

interface User {
  id: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  avatar: string;
}

// =============================================================================
// SIMULATED REALTIME ADAPTER
// =============================================================================

type RealtimeCallback = (event: {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: unknown;
  oldRecord?: unknown;
}) => void;

class SimulatedRealtimeAdapter {
  private callbacks: Map<string, RealtimeCallback[]> = new Map();
  private isConnected = signal(false);
  private connectionStatusCallbacks: ((connected: boolean) => void)[] = [];

  connect() {
    setTimeout(() => {
      this.isConnected.set(true);
      this.connectionStatusCallbacks.forEach((cb) => cb(true));
    }, 500);
  }

  disconnect() {
    this.isConnected.set(false);
    this.connectionStatusCallbacks.forEach((cb) => cb(false));
    this.callbacks.clear();
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionStatusCallbacks.push(callback);
    return () => {
      const idx = this.connectionStatusCallbacks.indexOf(callback);
      if (idx >= 0) this.connectionStatusCallbacks.splice(idx, 1);
    };
  }

  subscribe(table: string, callback: RealtimeCallback) {
    if (!this.callbacks.has(table)) {
      this.callbacks.set(table, []);
    }
    this.callbacks.get(table)!.push(callback);
    return () => {
      const cbs = this.callbacks.get(table);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    };
  }

  // Simulate incoming events
  simulateEvent(
    table: string,
    type: 'INSERT' | 'UPDATE' | 'DELETE',
    record: unknown,
    oldRecord?: unknown
  ) {
    const cbs = this.callbacks.get(table);
    if (cbs) {
      cbs.forEach((cb) => cb({ type, record, oldRecord }));
    }
  }

  getIsConnected() {
    return this.isConnected();
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

@Component({
  selector: 'app-realtime-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, CodeTabsComponent],
  templateUrl: './realtime-demo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './realtime-demo.component.scss',
})
export class RealtimeDemoComponent implements OnDestroy {
  // Connection state
  readonly connectionStatus = signal<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  readonly lastEvent = signal<string | null>(null);
  readonly eventLog = signal<string[]>([]);

  // Simulated realtime adapter
  private readonly adapter = new SimulatedRealtimeAdapter();
  private cleanupFns: (() => void)[] = [];

  // SignalTree store with entityMaps
  readonly store = signalTree({
    messages: entityMap<Message, string>({ selectId: (m) => m.id }),
    users: entityMap<User, string>({ selectId: (u) => u.id }),
  }).derived(($) => ({
    // Computed: online users
    onlineUsers: computed(() =>
      $.users.all().filter((u) => u.status === 'online')
    ),
    // Computed: recent messages (last 10)
    recentMessages: computed(() =>
      [...$.messages.all()]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
    ),
    // Computed: message count
    messageCount: computed(() => $.messages.all().length),
    // Computed: user count by status
    userCountByStatus: computed(() => ({
      online: $.users.all().filter((u) => u.status === 'online').length,
      away: $.users.all().filter((u) => u.status === 'away').length,
      offline: $.users.all().filter((u) => u.status === 'offline').length,
    })),
  }));

  // Form inputs
  readonly newMessage = signal('');
  readonly newUsername = signal('');

  // Simulation controls
  readonly autoSimulate = signal(false);
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Set up connection status tracking
    this.cleanupFns.push(
      this.adapter.onConnectionChange((connected) => {
        this.connectionStatus.set(connected ? 'connected' : 'disconnected');
        this.logEvent(
          connected
            ? 'Connected to realtime server'
            : 'Disconnected from server'
        );
      })
    );
  }

  ngOnDestroy() {
    this.disconnect();
    this.cleanupFns.forEach((fn) => fn());
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  connect() {
    this.connectionStatus.set('connecting');
    this.adapter.connect();

    // Subscribe to messages table
    this.cleanupFns.push(
      this.adapter.subscribe('messages', (event) => {
        this.logEvent(
          `Message ${event.type}: ${(event.record as Message).content?.slice(
            0,
            30
          )}...`
        );

        switch (event.type) {
          case 'INSERT':
            this.store.$.messages.upsertOne(event.record as Message);
            break;
          case 'UPDATE':
            this.store.$.messages.upsertOne(event.record as Message);
            break;
          case 'DELETE':
            this.store.$.messages.removeOne(
              (event.oldRecord as Message)?.id || (event.record as Message).id
            );
            break;
        }
      })
    );

    // Subscribe to users table
    this.cleanupFns.push(
      this.adapter.subscribe('users', (event) => {
        this.logEvent(`User ${event.type}: ${(event.record as User).username}`);

        switch (event.type) {
          case 'INSERT':
            this.store.$.users.upsertOne(event.record as User);
            break;
          case 'UPDATE':
            this.store.$.users.upsertOne(event.record as User);
            break;
          case 'DELETE':
            this.store.$.users.removeOne(
              (event.oldRecord as User)?.id || (event.record as User).id
            );
            break;
        }
      })
    );

    // Add some initial users
    setTimeout(() => {
      this.simulateUserJoin('Alice');
      this.simulateUserJoin('Bob');
      this.simulateUserJoin('Charlie');
    }, 600);
  }

  disconnect() {
    this.adapter.disconnect();
    this.autoSimulate.set(false);
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  // =============================================================================
  // MANUAL ACTIONS
  // =============================================================================

  sendMessage() {
    const content = this.newMessage().trim();
    if (!content) return;

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: 'current-user',
      username: 'You',
      content,
      timestamp: Date.now(),
      type: 'text',
    };

    // Simulate server echo
    this.adapter.simulateEvent('messages', 'INSERT', message);
    this.newMessage.set('');
  }

  addUser() {
    const username = this.newUsername().trim();
    if (!username) return;

    this.simulateUserJoin(username);
    this.newUsername.set('');
  }

  // =============================================================================
  // SIMULATION
  // =============================================================================

  private simulateUserJoin(username: string) {
    const user: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username,
      status: 'online',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    };
    this.adapter.simulateEvent('users', 'INSERT', user);
  }

  simulateIncomingMessage() {
    const users = this.store.$.users
      .all()
      .filter((u) => u.id !== 'current-user');
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const messages = [
      'Hey everyone! 👋',
      "How's it going?",
      'Just checking in...',
      'Anyone online?',
      'Great weather today!',
      "What's new?",
      'LOL 😂',
      'Interesting...',
      'I agree!',
      'Let me think about that...',
    ];

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: randomUser.id,
      username: randomUser.username,
      content: messages[Math.floor(Math.random() * messages.length)],
      timestamp: Date.now(),
      type: 'text',
    };

    this.adapter.simulateEvent('messages', 'INSERT', message);
  }

  simulateUserStatusChange() {
    const users = this.store.$.users.all();
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const statuses: User['status'][] = ['online', 'away', 'offline'];
    const newStatus = statuses[Math.floor(Math.random() * statuses.length)];

    this.adapter.simulateEvent('users', 'UPDATE', {
      ...randomUser,
      status: newStatus,
    });
  }

  simulateUserLeave() {
    const users = this.store.$.users.all();
    if (users.length === 0) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];

    // System message about leaving
    const systemMsg: Message = {
      id: `msg-${Date.now()}-sys`,
      userId: 'system',
      username: 'System',
      content: `${randomUser.username} has left the chat`,
      timestamp: Date.now(),
      type: 'system',
    };
    this.adapter.simulateEvent('messages', 'INSERT', systemMsg);
    this.adapter.simulateEvent('users', 'DELETE', randomUser);
  }

  toggleAutoSimulation() {
    const newValue = !this.autoSimulate();
    this.autoSimulate.set(newValue);

    if (newValue) {
      this.simulationInterval = setInterval(() => {
        const actions = [
          () => this.simulateIncomingMessage(),
          () => this.simulateIncomingMessage(),
          () => this.simulateUserStatusChange(),
        ];
        const randomAction =
          actions[Math.floor(Math.random() * actions.length)];
        randomAction();
      }, 2000);
    } else if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  clearMessages() {
    this.store.$.messages.clear();
    this.logEvent('Cleared all messages');
  }

  private logEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.lastEvent.set(message);
    this.eventLog.update((log) =>
      [`[${timestamp}] ${message}`, ...log].slice(0, 50)
    );
  }

  clearEventLog() {
    this.eventLog.set([]);
    this.lastEvent.set(null);
  }

  // =============================================================================
  // CODE EXAMPLES
  // =============================================================================

  readonly realtimeCodeFiles: CodeFile[] = [
    {
      label: 'Realtime Enhancer',
      language: 'typescript',
      source: `import { realtime } from '@signaltree/realtime';
import { createSupabaseAdapter } from '@signaltree/realtime/supabase';
import { signalTree, entityMap } from '@signaltree/core';

// Create adapter for your backend (client only — no extra options)
const adapter = createSupabaseAdapter(supabaseClient);

// Config maps tree paths to table subscriptions
const realtimeEnhancer = realtime(adapter, {
  messages: {
    table: 'messages',
    event: '*',                    // INSERT, UPDATE, DELETE
    selectId: (m: Message) => m.id,
  },
  users: {
    table: 'users',
    event: '*',
  },
}, {
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 10,
});

// Apply to your tree — connects automatically on .with()
const store = signalTree({
  messages: entityMap<Message, string>({ selectId: m => m.id }),
  users: entityMap<User, string>({ selectId: u => u.id }),
}).with(realtimeEnhancer);

// Connection state lives under store.realtime.connection
store.realtime.connection.status();          // ConnectionStatus
store.realtime.connection.isConnected();     // Signal<boolean>
store.realtime.connection.error();           // Signal<string | null>
store.realtime.connection.lastConnectedAt(); // Signal<Date | null>

// Manual control (no store.realtime.connect() — connect happens
// automatically; reconnect() tears down and reconnects)
store.realtime.reconnect();
store.realtime.disconnect();

// Dynamic subscribe/unsubscribe for paths not in the initial config
store.realtime.subscribe('messages', { table: 'messages', event: 'INSERT' });
store.realtime.unsubscribe('messages');`,
    },
  ];

  readonly adapterCodeFiles: CodeFile[] = [
    {
      label: 'Custom Adapter',
      language: 'typescript',
      source: `// The RealtimeAdapter interface — implement this for any backend
interface RealtimeAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Subscribe to a table/channel
  subscribe<T>(
    config: RealtimeSubscription<T>,
    callback: (event: RealtimeEvent<T>) => void
  ): () => void;  // Returns unsubscribe function

  // Connection status changes
  onConnectionChange(
    callback: (connected: boolean, error?: Error) => void
  ): () => void;
}

// RealtimeSubscription — per-path config passed to the enhancer
interface RealtimeSubscription<T> {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;                   // e.g. 'status=eq.active'
  schema?: string;                   // defaults to 'public'
  selectId?: (entity: T) => string | number;
  transform?: (row: unknown) => T;   // e.g. snake_case -> camelCase
}

// RealtimeEvent structure delivered to your callback
interface RealtimeEvent<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  new?: T;             // present for INSERT/UPDATE
  old?: Partial<T>;    // present for UPDATE/DELETE
  table: string;
  schema?: string;
  timestamp?: Date;
}

// Supabase adapter (included) — takes only the client
import { createSupabaseAdapter } from '@signaltree/realtime/supabase';
const adapter = createSupabaseAdapter(supabaseClient);

// Custom adapter example
const myAdapter: RealtimeAdapter = {
  async connect() { await websocket.connect(); },
  disconnect() { websocket.close(); },
  isConnected() { return websocket.readyState === WebSocket.OPEN; },
  subscribe(config, callback) {
    // Subscribe to your websocket/SSE/polling source for config.table
    return () => { /* cleanup */ };
  },
  onConnectionChange(callback) {
    // Track connection status: callback(true) / callback(false, err)
    return () => { /* cleanup */ };
  },
};`,
    },
  ];
}
