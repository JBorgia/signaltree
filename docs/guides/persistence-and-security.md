# Persistence and Security

This guide covers the threat model and hardening patterns for `stored()` — SignalTree's localStorage marker. Read it before persisting anything beyond UI preferences.

`stored()` is intentionally simple: it auto-syncs a signal to `localStorage` with versioning and migration support. It is **not** a secrets store, and it is **not** a substitute for a server-side store of record. The trade-off is documented here so you can decide what to put through it and what to keep elsewhere.

---

## What `stored()` does

```typescript
import { signalTree, stored } from '@signaltree/core';

const tree = signalTree({
  theme: stored<'light' | 'dark'>('app.theme', 'light'),
});

tree.$.theme.set('dark'); // auto-saves to localStorage
```

Default behavior, all of which is configurable:

| Aspect            | Default                  | Configurable via         |
| ----------------- | ------------------------ | ------------------------ |
| Backend           | `localStorage`           | `options.storage`        |
| Format on disk    | `JSON.stringify` of `{ __v, data }` | `options.serialize` / `deserialize` |
| Write debounce    | 100 ms                   | `options.debounceMs`     |
| Versioning        | `__v: 1`                 | `options.version`        |
| Migration         | None                     | `options.migrate`        |
| Migration failure | Falls back to default    | `options.clearOnMigrationFailure` |

---

## Threat model

What `localStorage` exposes, by definition of the platform — not unique to SignalTree:

- **Same-origin JavaScript can read and write all stored values.** That includes browser extensions with content-script access to your origin, any compromised or malicious dependency loaded into the page, and any successful XSS payload.
- **Storage is plaintext on disk.** Anyone with filesystem access to the browser profile (e.g. a co-located user account, a malicious app on the same machine, a stolen laptop without disk encryption) can read it directly.
- **Storage is not isolated per browser tab.** Two tabs on the same origin share the same data.
- **There is no integrity guarantee.** Any of the above actors can not only read but tamper with stored values; on next read your app will deserialize attacker-controlled data.

What `localStorage` does **not** expose:

- Cross-origin reads. A page on `https://example.com` cannot read `localStorage` written by `https://signaltree.example`.
- Server-side reads. localStorage is browser-local; the server only sees what the client explicitly sends.

In short: treat `localStorage` as **trusted for UX continuity, untrusted for confidentiality or integrity**.

---

## What `stored()` is appropriate for

✅ UI state that should survive a refresh: theme, panel layouts, last-opened tab, sidebar collapse state.
✅ Non-sensitive user preferences: locale, sort order, per-list view modes.
✅ Caches that the app would be happy to lose at any moment: last-viewed item id, draft form values where loss is annoying but not damaging.
✅ Tutorial / onboarding flags: "user dismissed welcome banner".

These share a property: **a malicious read or tamper is annoying, not damaging**. If an attacker reads or rewrites them, the worst case is a confusing UI.

---

## What `stored()` is NOT appropriate for

⚠️ **Auth tokens, refresh tokens, session tokens.** Use HTTP-only cookies set by the server. localStorage tokens are stealable by any XSS payload — that's the canonical attack pattern. SignalTree gives you no protection here.
⚠️ **API keys for third-party services.** Same reasoning. If the user's API key for an external service is in localStorage, it's stolen the moment any malicious script runs in your origin.
⚠️ **PII you can't afford to leak.** Names, addresses, emails, phone numbers, anything covered by GDPR/CCPA/similar — defaults expose it to the same attack surface as tokens.
⚠️ **Anything you'd be uncomfortable showing in the browser's DevTools console.** That's the audit test.
⚠️ **State that must be authoritative.** If your app's correctness depends on a value being right, the source of truth has to live server-side. localStorage is a hint, not a record.

If you're building a marketplace, a chat app, or anything with real user accounts: tokens go in HTTP-only cookies, sensitive profile data stays server-side, and `stored()` is for layout preferences only.

---

## Hardening patterns

If you've decided you do need to persist something more sensitive than UI prefs, here are the available extension points. **None of these make `stored()` safe for tokens or secrets** — they just narrow specific gaps.

### 1. Switch storage backends

`options.storage` accepts any object that satisfies the DOM `Storage` interface, or `null` to disable persistence.

```typescript
// sessionStorage: clears when tab closes; reduces persistence-on-disk window.
stored('draft', '', { storage: sessionStorage });

// Disable entirely (e.g., feature-flag persistence off).
stored('draft', '', { storage: null });

// Custom backend — e.g., an IndexedDB-backed Storage shim or a server-synced one.
stored('draft', '', { storage: myCustomStorage });
```

Trade-offs:

- `sessionStorage`: same security profile as `localStorage` (same-origin readable, plaintext) but auto-clears at tab close.
- IndexedDB shim: gives you async storage and larger quotas, but the shim must adapt to `Storage`'s synchronous API — usually means writing to an in-memory cache and asynchronously flushing.
- Server-synced backend: shifts trust to your server. Combine with auth so each request is scoped to the right user.

### 2. Custom `serialize` / `deserialize` for encryption-at-rest

Every read and write goes through these functions. You can plug in encryption — typically Web Crypto with a key derived from a server-issued session secret.

```typescript
import { stored } from '@signaltree/core';

async function deriveKey(): Promise<CryptoKey> {
  // In real code: derive from a server-issued, per-session secret.
  // Do NOT bake a static key into client code — it offers no protection.
  // ...
}

const key = await deriveKey();

const encryptedSerialize = (value: unknown): string => {
  // ... AES-GCM encrypt JSON.stringify(value) using `key`, base64-encode the ciphertext+IV.
};

const encryptedDeserialize = (raw: string): unknown => {
  // ... reverse of above; throw if MAC verification fails.
};

stored('draft', defaultDraft, {
  serialize: encryptedSerialize,
  deserialize: encryptedDeserialize,
});
```

**Important caveats:**

- `serialize` is **synchronous**. Web Crypto is async. You'll need to either pre-derive the key + use a sync XOR/AES-CTR fallback (weaker), or refactor to write through a queue that batches encrypted writes asynchronously. There's no clean path that gives you both `stored()`'s ergonomics and Web Crypto AEAD.
- **Encryption-at-rest does not protect against an in-page attacker.** If an attacker can run JS in your origin, they can call your decrypt function with the ciphertext and read the plaintext just as the app does. This pattern is for defense against a co-located OS user reading the browser profile, not against XSS.
- A static key embedded in client JS is **not** encryption — anyone reading the page source has the key. Only per-user, server-issued keys provide real protection.

### 3. Namespace isolation with `createStorageKeys`

```typescript
import { stored, createStorageKeys, clearStoragePrefix } from '@signaltree/core';

const STORAGE = createStorageKeys('myApp', {
  ui: {
    theme: 'theme',
    layout: 'layout',
  },
} as const);

signalTree({
  theme: stored(STORAGE.ui.theme, 'light'),     // key: "myApp:ui:theme"
  layout: stored(STORAGE.ui.layout, 'compact'), // key: "myApp:ui:layout"
});

// On logout / account switch:
clearStoragePrefix('myApp');
```

This doesn't add security, but it makes it possible to **purge cleanly on logout** — which matters if any persisted preferences are user-specific. Always clear on logout; never let preferences from one user bleed into another's session.

### 4. Versioning and safe migration

If you change the shape of a stored value, the user's browser still has the old shape. Without a migration, your code may deserialize old data into a new shape and crash or misbehave on whatever code reads it next.

```typescript
stored('settings', defaultSettings, {
  version: 2,
  migrate: (old, oldVersion) => {
    if (oldVersion === 1) return { ...(old as V1), newField: 'default' };
    throw new Error(`unknown version ${oldVersion}`);
  },
  clearOnMigrationFailure: true, // Fall back to defaultSettings if migrate() throws.
});
```

The integrity question matters too: if an attacker tampers with the on-disk value, your `migrate` function receives attacker-controlled `old`. Always treat it like untrusted input — validate types and bounds, don't trust shape, and prefer `clearOnMigrationFailure: true` for non-essential state so a malformed value doesn't propagate.

---

## Cross-tab synchronization

`stored()` does **not** subscribe to the browser's `storage` event, so changes made in one tab are not automatically reflected in others. If you need cross-tab sync, call `.reload()` on the relevant signal — for example, when the tab becomes visible:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tree.$.theme.reload();
  }
});
```

For richer cross-tab patterns (e.g., reactive sync as soon as another tab writes), wire a `BroadcastChannel` listener to call `.reload()`, or wrap a custom storage backend that emits its own events.

---

## Logout and account switching

Always clear stored values when a user logs out or switches accounts. Otherwise:

- Per-user UI prefs from the previous account leak into the new session.
- Stale "last viewed" / "draft" data may surface in the wrong context.
- If you ever stored anything user-scoped that you shouldn't have, this is the only chance to remove it.

```typescript
import { clearStoragePrefix } from '@signaltree/core';

function logout() {
  clearStoragePrefix('myApp');
  // ... then redirect / reset auth state
}
```

If you persist values without a shared prefix, `tree.$.theme.clear()` works per-signal — but a prefix scan is more reliable for "wipe everything for this user."

---

## Quick checklist

Before calling `stored(key, default, options)`, ask yourself:

- [ ] Would I be comfortable if this value appeared in `console.log(localStorage)` on a user's machine?
- [ ] Is there a backend record of truth, or is localStorage authoritative? (If authoritative — reconsider.)
- [ ] Is this value scoped to a user, and do I clear it on logout?
- [ ] If the shape changes, do I have a `version` + `migrate` plan?
- [ ] Would an attacker tampering with this value cause more than a UI glitch? (If yes — validate aggressively in your reads, or store server-side.)

If any answer is "no, but it's fine," fine. If any answer is "no, and I'm not sure" — reconsider before shipping.
