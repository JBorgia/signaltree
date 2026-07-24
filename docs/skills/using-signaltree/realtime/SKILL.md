---
name: signaltree-realtime
description: Guides AI agents wiring @signaltree/realtime so DB change events (INSERT/UPDATE/DELETE) automatically sync into SignalTree entityMap slices, via Supabase, custom WebSocket adapters, or any RealtimeAdapter. Covers connection state signals, reconnect logic, and entity transforms. Triggers on @signaltree/realtime, supabaseRealtime, realtime, RealtimeAdapter, entityMap sync, connection state, Supabase realtime, Firebase realtime, WebSocket adapter, INSERT UPDATE DELETE sync.
---

# Using @signaltree/realtime

Use when an Angular app holds entity collections in `entityMap` slices and the source of truth emits DB change events (Supabase Realtime, Firebase, custom WebSocket). Eliminates manual subscribe → map → `upsertOne`/`removeOne` → reconnect dance. For request/response CRUD or static data, skip it.

**Don't apply in SSR** — guard with `isPlatformBrowser()` or initialize in a client-only provider.

Install:

```bash
npm install @signaltree/core @signaltree/realtime
# Supabase adapter:
npm install @supabase/supabase-js
```

Peer: `@angular/core ^20`, `@signaltree/core ^9`. `@supabase/supabase-js ^2` optional — install only for Supabase adapter.

Supabase:

```ts
import { signalTree, entityMap } from '@signaltree/core';
import { supabaseRealtime } from '@signaltree/realtime/supabase';
import { createClient } from '@supabase/supabase-js';

interface Listing { id: number; title: string; status: string }
interface Message { id: string; text: string }

const supabase = createClient(
  import.meta.env['VITE_SUPABASE_URL'],
  import.meta.env['VITE_SUPABASE_ANON_KEY']
);

const tree = signalTree({
  listings: entityMap<Listing, number>(),
  messages: entityMap<Message, string>(),
}).with(
  supabaseRealtime(supabase, {
    listings: { table: 'listings', event: '*', filter: 'status=eq.active' },
    messages: { table: 'messages', event: 'INSERT' },
  })
);
```

Entity mutation rules: `INSERT`/`UPDATE` → `upsertOne(entity, { selectId })`. `DELETE` → `removeOne(selectId(old))`. `selectId` defaults to `(entity) => entity.id`; override in subscription config for non-`id` PKs.

`event` values: `'INSERT' | 'UPDATE' | 'DELETE' | '*'`. `'*'` = all three.

Connection state — `tree.realtime.connection.status` is a signal of `'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR'`:

```ts
effect(() => {
  const status = tree.realtime.connection.status();
  if (status === 'ERROR') console.warn('Realtime error:', tree.realtime.connection.error());
});

const isLive = tree.realtime.connection.isConnected; // signal<boolean>
```

Transform rows (e.g., snake_case → camelCase):

```ts skip
supabaseRealtime(supabase, {
  listings: {
    table: 'listings',
    event: '*',
    transform: (row): Listing => ({ id: row['id'] as number, title: row['title'] as string, /* ...more fields */ }),
  },
})
```

Custom adapter (non-Supabase):

```ts
import { signalTree, entityMap } from '@signaltree/core';
import { realtime } from '@signaltree/realtime';

interface Todo { id: string; title: string }
type RealtimeAdapter = Parameters<typeof realtime>[0];

const myAdapter: RealtimeAdapter = {
  async connect() { /* open socket */ },
  disconnect() { /* close socket */ },
  subscribe(_config, _callback) { return () => { /* cleanup */ }; },
  isConnected() { return true; },
  onConnectionChange(_cb) { return () => { /* cleanup */ }; },
};

const tree = signalTree({ todos: entityMap<Todo, string>() }).with(
  realtime(myAdapter, { todos: { table: 'todos', event: '*' } })
);
```

Dynamic subscriptions (add after initial connect):

```ts
const cleanup = tree.realtime.subscribe('newPath', config);
tree.realtime.unsubscribe('newPath');
cleanup(); // or via returned CleanupFn
```

`tree.realtime.reconnect()` — force disconnect → fresh connect, resets `reconnectAttempts` to 0. Use after long background wake-up.

Reconnect options (on `realtime`): `autoReconnect` (default `true`), `reconnectDelay` (default 1000ms, exponential backoff), `maxReconnectAttempts` (default 10).

Gotchas:
- Only `entityMap` slices auto-sync. Plain signals or object paths log a dev warning and are ignored.
- Subscriptions keyed by tree path, not table. Same table → two paths = two independent channels. Two subscriptions at same tree path: second overwrites first.
- Supabase `filter` is passed verbatim to Supabase Realtime — not a JS filter. Use `transform` for JS-level cross-row filtering.
- Supabase adapter fires connection callback only after first `SUBSCRIBED` status. Brief `CONNECTING` window before data is normal.
- `reconnectAttempts()` climbing indefinitely = server rejecting connection (check Postgres publication or RLS).
- `entityMap` must exist at configured path at enhancer-apply time. Dynamic paths: use `tree.realtime.subscribe(path, config)` once the slice exists.

Related: `using-signaltree` (root), `spec-auditing`, `compression`
