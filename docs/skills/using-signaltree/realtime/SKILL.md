---
name: signaltree-realtime
description: Guides AI agents wiring @signaltree/realtime so DB change events (INSERT/UPDATE/DELETE) automatically sync into SignalTree entityMap slices, via Supabase, custom WebSocket adapters, or any RealtimeAdapter. Covers connection state signals, reconnect logic, and entity transforms. Triggers on @signaltree/realtime, supabaseRealtime, createRealtimeEnhancer, RealtimeAdapter, entityMap sync, connection state, Supabase realtime, Firebase realtime, WebSocket adapter, INSERT UPDATE DELETE sync.
---

# Using @signaltree/realtime

## When to use this package

Reach for `@signaltree/realtime` whenever an Angular application holds entity collections in a SignalTree `entityMap` and the source of truth is a database that emits change events — Supabase Realtime (Postgres logical replication), Firebase RTDB/Firestore listeners, or any custom WebSocket stream. The enhancer eliminates the usual manual dance (subscribe, map payload to entity, call `upsertOne`/`removeOne`, handle reconnect, handle unsubscribe) by wiring event → entityMap mutation automatically. For request/response CRUD flows or static data, skip it; reach for it when you need UI that reacts to back-end changes within milliseconds without polling.

## Install

```bash
npm install @signaltree/core @signaltree/realtime
# Plus the adapter you need, e.g. Supabase:
npm install @supabase/supabase-js
```

Peer range (from `peerDependencies`): `@angular/core ^20`, `@signaltree/core ^9`. `@supabase/supabase-js ^2` is declared as an **optional** peer — install it only if you use the Supabase adapter. Firebase is supported through the generic `createRealtimeEnhancer` API; there is no bundled Firebase adapter today.

## Mental model

The package is built around a `RealtimeAdapter` interface (connect, disconnect, subscribe, isConnected, onConnectionChange). `createRealtimeEnhancer(adapter, config, options?)` returns a SignalTree enhancer that:

1. Calls `adapter.connect()` on a microtask after the enhancer attaches to the tree.
2. Subscribes to each configured path — `config` is `{ [entityPathInTree]: RealtimeSubscription }`.
3. On each event, walks `tree.$` to the configured path, verifies it is an `entityMap` (has `upsertOne` and `removeOne`), optionally runs `transform`, and calls:
   - `INSERT` / `UPDATE` → `upsertOne(entity, { selectId })`
   - `DELETE` → `removeOne(selectId(old))`
4. Exposes a `realtime` object on the enhanced tree with `{ connection, reconnect, disconnect, subscribe, unsubscribe }`. `connection.status` is a signal of `'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR'`.
5. Auto-reconnects with exponential backoff up to `maxReconnectAttempts`, bumping `connection.reconnectAttempts`.

The Supabase adapter (`supabaseRealtime`) is a thin wrapper: it builds a `SupabaseRealtimeConfig` from the same shape and composes `createRealtimeEnhancer` internally.

## Core usage

### Supabase

```ts
import { signalTree, entityMap } from '@signaltree/core';
import { supabaseRealtime } from '@signaltree/realtime/supabase';
import { createClient } from '@supabase/supabase-js';

interface Listing {
  id: number;
  title: string;
  price: number;
  status: 'active' | 'archived';
}

interface Message {
  id: string;
  body: string;
  sentAt: string;
}

const supabase = createClient(
  import.meta.env['VITE_SUPABASE_URL'],
  import.meta.env['VITE_SUPABASE_ANON_KEY']
);

const tree = signalTree({
  listings: entityMap<Listing, number>(),
  messages: entityMap<Message, string>(),
}).with(
  supabaseRealtime(supabase, {
    listings: {
      table: 'listings',
      event: '*',
      filter: 'status=eq.active',
    },
    messages: {
      table: 'messages',
      event: 'INSERT',
    },
  })
);
```

### Reacting to connection state

```ts
import { effect } from '@angular/core';

effect(() => {
  const status = tree.realtime.connection.status();
  if (status === 'ERROR') {
    console.warn('Realtime error:', tree.realtime.connection.error());
  }
});

// Or a computed you can bind to a template
const isLive = tree.realtime.connection.isConnected;
// <div [class.live]="isLive()">…</div>
```

### Transforming rows (e.g., snake_case → camelCase)

```ts
import type { Listing } from './listing';

tree.with(
  supabaseRealtime(supabase, {
    listings: {
      table: 'listings',
      event: '*',
      transform: (row): Listing => {
        const r = row as Record<string, unknown>;
        return {
          id: r['id'] as number,
          title: r['title'] as string,
          price: r['price'] as number,
          status: r['status'] as Listing['status'],
        };
      },
    },
  })
);
```

### Custom adapter (non-Supabase WebSocket)

```ts
import { signalTree, entityMap } from '@signaltree/core';
import { createRealtimeEnhancer } from '@signaltree/realtime';

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

// `RealtimeAdapter` is the contract `createRealtimeEnhancer` expects.
// It isn't re-exported from the root barrel today — derive the shape from
// the function's parameter type so the example keeps compiling as the
// package evolves.
type RealtimeAdapter = Parameters<typeof createRealtimeEnhancer>[0];

const myAdapter: RealtimeAdapter = {
  async connect() {
    /* open socket */
  },
  disconnect() {
    /* close socket */
  },
  subscribe(_config, _callback) {
    // forward incoming messages as RealtimeEvent<T>
    return () => {
      /* cleanup */
    };
  },
  isConnected() {
    return true;
  },
  onConnectionChange(_cb) {
    // notify on connect/disconnect/error
    return () => {
      /* cleanup */
    };
  },
};

const tree = signalTree({ todos: entityMap<Todo, string>() }).with(
  createRealtimeEnhancer(myAdapter, {
    todos: { table: 'todos', event: '*' },
  })
);
```

## Advanced / less-obvious

- **Dynamic subscriptions.** `tree.realtime.subscribe(path, config)` adds a subscription after initial connect (useful for routed views that need their own feed). The call returns a cleanup `CleanupFn`; pair it with `tree.realtime.unsubscribe(path)` on teardown.
- **Manual reconnect.** `tree.realtime.reconnect()` forces a disconnect + fresh connect and resets the `reconnectAttempts` counter. Use it after a long background tab wake-up where the exponential backoff has stalled.
- **`selectId` is entity-defined.** If the entity type has a non-`id` primary key, pass `selectId: (e) => e.uuid` in the subscription config. It defaults to `(entity) => entity.id`.
- **Filters flow through to Supabase.** `filter: 'user_id=eq.${userId}'` is passed verbatim to Supabase Realtime; it is not a JavaScript filter. For cross-row JS filtering, use `transform` to drop rows by returning a shape the entityMap already has or ignore via a route-level layer.
- **Only `entityMap` slices auto-sync.** If the configured path resolves to a plain signal or an object, the enhancer logs a dev warning and ignores the subscription. Make sure every mapped path was created with `entityMap<T, K>()`.
- **Enhancer options.** `createRealtimeEnhancer(adapter, config, { autoReconnect, reconnectDelay, maxReconnectAttempts, debug })` — `autoReconnect` defaults to `true`, `reconnectDelay` to 1000ms with exponential backoff up to `maxReconnectAttempts` (default 10). Set `debug: false` in production to silence console logs.

## Gotchas

- The Supabase adapter fires the presence-based connection callback only after the first `SUBSCRIBED` status. A brief `CONNECTING` window before any data arrives is normal.
- Subscriptions are keyed by tree path, not by table. Pointing two config entries at the same table is legal and creates two independent channels with their own filters.
- `RealtimeSubscription['event']` accepts `'INSERT' | 'UPDATE' | 'DELETE' | '*'`. `'*'` subscribes to all three.
- Reconnect attempts reset to 0 on a successful connect; if you see `reconnectAttempts()` climbing indefinitely, the server is rejecting the connection (often a Postgres publication or RLS issue).
- SSR: do not apply the enhancer during server render. Guard with `isPlatformBrowser(...)` or initialize the tree in a client-only provider; otherwise `WebSocket` will be undefined.
- The enhancer depends on the tree having an `entityMap` at each configured path **at enhancer-apply time**. Adding an entityMap later will not be discovered automatically; use `tree.realtime.subscribe(path, config)` once the slice exists.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.
