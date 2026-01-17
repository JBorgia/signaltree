# @signaltree/realtime

Real-time data synchronization enhancers for SignalTree. Provides seamless integration with Supabase Realtime, with a generic adapter pattern for Firebase and custom WebSocket implementations.

## Installation

```bash
npm install @signaltree/realtime @supabase/supabase-js
# or
pnpm add @signaltree/realtime @supabase/supabase-js
```

## Quick Start

```typescript
import { signalTree, entityMap } from '@signaltree/core';
import { supabaseRealtime } from '@signaltree/realtime/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Listing {
  id: number;
  title: string;
  price: number;
  status: 'active' | 'sold' | 'draft';
}

// Create tree with realtime sync
const tree = signalTree({
  listings: entityMap<Listing, number>(),
}).with(
  supabaseRealtime(supabase, {
    listings: {
      table: 'listings',
      event: '*', // Listen for INSERT, UPDATE, DELETE
    },
  })
);

// EntityMaps automatically sync with the database!
// When someone inserts a listing, it appears in tree.$.listings.all()
```

## Features

### Automatic EntityMap Sync

The realtime enhancer maps database events to entityMap operations:

| Database Event | EntityMap Operation |
| -------------- | ------------------- |
| INSERT         | `upsertOne()`       |
| UPDATE         | `upsertOne()`       |
| DELETE         | `removeOne()`       |

### Connection State

Access reactive connection state:

```typescript
// Check connection status
effect(() => {
  if (tree.realtime.connection.isConnected()) {
    console.log('Connected to realtime!');
  }
});

// Monitor errors
effect(() => {
  const error = tree.realtime.connection.error();
  if (error) {
    console.error('Connection error:', error);
  }
});

// Check reconnection attempts
effect(() => {
  const attempts = tree.realtime.connection.reconnectAttempts();
  console.log(`Reconnect attempt: ${attempts}`);
});
```

### Manual Control

```typescript
// Manually disconnect
tree.realtime.disconnect();

// Reconnect
tree.realtime.reconnect();

// Dynamic subscriptions
const cleanup = tree.realtime.subscribe('newPath', {
  table: 'some_table',
  event: 'INSERT',
});

// Later: unsubscribe
cleanup();
// or
tree.realtime.unsubscribe('newPath');
```

### Filtering

Use Supabase PostgREST filters:

```typescript
.with(supabaseRealtime(supabase, {
  activeListings: {
    table: 'listings',
    event: '*',
    filter: 'status=eq.active'
  },
  myListings: {
    table: 'listings',
    event: '*',
    filter: `user_id=eq.${currentUserId}`
  },
  recentMessages: {
    table: 'messages',
    event: 'INSERT',
    filter: `created_at=gt.${oneDayAgo.toISOString()}`
  }
}))
```

### Data Transformation

Transform snake_case database fields to camelCase:

```typescript
interface Listing {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

.with(supabaseRealtime(supabase, {
  listings: {
    table: 'listings',
    event: '*',
    transform: (row: any) => ({
      id: row.id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    })
  }
}))
```

### Custom ID Selection

If your entity ID field isn't `id`:

```typescript
interface Item {
  itemCode: string;
  name: string;
}

.with(supabaseRealtime(supabase, {
  items: {
    table: 'items',
    event: '*',
    selectId: (item: Item) => item.itemCode
  }
}))
```

## Configuration Options

```typescript
supabaseRealtime(supabase, config, {
  // Auto-reconnect on disconnect (default: true)
  autoReconnect: true,

  // Initial reconnect delay in ms (default: 1000)
  // Uses exponential backoff
  reconnectDelay: 1000,

  // Max reconnect attempts (default: 10)
  maxReconnectAttempts: 10,

  // Log events in dev mode (default: true in dev)
  debug: true,
});
```

## Custom Adapters

Create adapters for other realtime providers:

```typescript
import { createRealtimeEnhancer, RealtimeAdapter } from '@signaltree/realtime';

const customAdapter: RealtimeAdapter = {
  async connect() {
    // Connect to your WebSocket server
  },

  disconnect() {
    // Clean up connections
  },

  subscribe(config, callback) {
    // Set up subscription
    // Call callback(event) when data changes
    return () => {
      // Cleanup function
    };
  },

  isConnected() {
    return true; // Return connection state
  },

  onConnectionChange(callback) {
    // Set up connection state listener
    return () => {
      // Cleanup
    };
  }
};

const tree = signalTree({ ... })
  .with(createRealtimeEnhancer(customAdapter, config));
```

## TypeScript

Full type inference is provided:

```typescript
// The tree type includes the realtime property
const tree = signalTree({
  listings: entityMap<Listing, number>()
}).with(supabaseRealtime(supabase, { ... }));

// Fully typed
tree.realtime.connection.isConnected();  // Signal<boolean>
tree.realtime.connection.error();        // Signal<string | null>
tree.$.listings.all();                   // Signal<Listing[]>
```

## Requirements

- Angular 20+
- @signaltree/core 7.0+
- @supabase/supabase-js 2.0+ (for Supabase integration)

## License

MIT
