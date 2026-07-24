# Migrating to SignalTree v13

v13 applies RFC 0007's packaging principle — *independent dependency/runtime
→ its own package; a within-tree mechanic (needs only `@signaltree/core` +
`@signaltree/shared`) → core* — to two capabilities that were filed under the
wrong package, and adds a signal-native undo/redo feature plus an
events↔`entityMap` bridge. Most apps touch at most one of the items below;
every deprecated API has a direct, mechanical replacement and is **retained**
(not removed) in this release.

## 1. `createAuditTracker`/`createAuditCallback` moved to `@signaltree/core` (breaking import path)

Neither function ever depended on `@angular/forms` — only on
`@signaltree/shared`'s `getChanges` and the core tree type — so under RFC
0007's principle they're a within-tree mechanic, not a forms concern. Update
the import:

```ts
// before (v12)
import { createAuditTracker, createAuditCallback, AuditEntry } from '@signaltree/ng-forms/audit';

// after (v13)
import { createAuditTracker, createAuditCallback, AuditEntry } from '@signaltree/core';
```

The old `@signaltree/ng-forms/audit` path still re-exports the same
functions/types as a `@deprecated` back-compat shim — this is a find-and-replace,
not a rewrite. Behavior is unchanged; only the canonical import moved.

## 2. New: `history()` for `form()` markers — supersedes `withFormHistory` (additive)

Nothing breaks here, but if you're using `withFormHistory` on a
`createFormTree`, or want undo/redo on a `form()` marker (which
`withFormHistory` could never reach — it's `FormGroup`-only and structurally
cannot attach to a `signalForm()` `FieldTree`), switch to core's `history()`:

```ts
// before (createFormTree + withFormHistory)
import { createFormTree, withFormHistory } from '@signaltree/ng-forms';

const formTree = createFormTree({ name: '', email: '' });
const withHistory = withFormHistory(formTree, { capacity: 20 });
withHistory.undo();

// after (form() marker + core history())
import { signalTree, form, history } from '@signaltree/core';

const tree = signalTree({
  contact: form<{ name: string; email: string }>({
    initial: { name: '', email: '' },
    history: history({ capacity: 20 }), // + exclude?: (keyof T)[] for sensitive fields
  }),
});
tree.$.contact.history?.undo();
```

`history()` attaches to the marker's values signal — the same signal
`signalForm()` uses as its Angular Signal Forms `FieldTree` model — so
undo/redo drive both the marker API and a bound field tree from one engine,
including edits made through the field tree. `exclude` is a security
feature: excluded fields never enter the snapshot buffer, so undo can never
resurrect a stripped secret. A raw object passed as `history` (not
`history()`'s return value) throws `[ST2006]` at the `form()` call site.
`withFormHistory` is `@deprecated` since v13 but retained for
`createFormTree` users; it will be removed with the legacy `FormGroup`
bridge.

## 3. New: the `form()` marker's built-in `wizard` config — supersedes `createWizardForm` (additive)

`createWizardForm` is `@deprecated` since v13 (retained, unremoved) — it's
built on `createFormTree` and has no `signalForm()` bridge. If you're
starting a new multi-step form, prefer the `form()` marker's `wizard` config,
which is `signalForm()`-compatible:

```ts
// before (createWizardForm)
import { createWizardForm } from '@signaltree/ng-forms';

const wizard = createWizardForm(
  [{ fields: ['email', 'password'] }, { fields: ['firstName', 'lastName'] }],
  { email: '', password: '', firstName: '', lastName: '' }
);
await wizard.nextStep();

// after (form() marker's wizard config)
import { signalTree, form } from '@signaltree/core';

const tree = signalTree({
  signup: form<{ email: string; password: string; firstName: string; lastName: string }>({
    initial: { email: '', password: '', firstName: '', lastName: '' },
    wizard: {
      steps: ['credentials', 'profile'],
      stepFields: { credentials: ['email', 'password'], profile: ['firstName', 'lastName'] },
    },
  }),
});
await tree.$.signup.wizard!.next();
```

Existing `createFormTree`-based wizards keep working unchanged.

## 4. New: events↔`entityMap` bridge (`@signaltree/events/angular`, additive)

If you hand-wrote a per-event `upsertOne`/`updateOne`/`removeOne` loop to
apply a batch of domain events onto a `@signaltree/core` `entityMap`,
`entityEventHandler` now does that in one pass with `entityMap`'s own batch
ops:

```ts
import { entityEventHandler } from '@signaltree/events/angular';

const flush = entityEventHandler(store.$.trades.entities, {
  match: (e) =>
    e.type === 'TradeCreated' ? 'upsert' :
    e.type === 'TradeStatusChanged' ? 'update' :
    e.type === 'TradeCancelled' ? 'remove' : null,
  upsert: (e) => (e.type === 'TradeCreated' ? e.data.trade : undefined),
  update: (e) => (e.type === 'TradeStatusChanged' ? { id: e.data.tradeId, changes: { status: e.data.status } } : undefined),
  remove: (e) => (e.type === 'TradeCancelled' ? e.data.tradeId : undefined),
});

flush(eventsReceivedThisTick); // one upsertMany/updateMany/removeMany per batch, not per event
```

And if you hand-wrote a `rollback` closure for a single-entity optimistic
update, `applyOptimisticEntityChange` now derives it from the entityMap's
current entry:

```ts
import { OptimisticUpdateManager, applyOptimisticEntityChange } from '@signaltree/events/angular';

const manager = new OptimisticUpdateManager();
const { data, previousData, rollback } = applyOptimisticEntityChange(
  store.$.trades.entities,
  tradeId,
  { status: 'accepted' }
);
manager.apply({ id: crypto.randomUUID(), correlationId, type: 'UpdateTradeStatus', data, previousData: previousData ?? data, timeoutMs: 5000, rollback });
```

`OptimisticUpdateManager`'s public API is unchanged; it's now O(n) instead of
O(n²) for a burst of N pending updates internally.

## Nothing else changed

Core state APIs (`signalTree`, `$` path access, `.set`/`.update`,
`.derived()`, markers `entityMap`/`status`/`stored`/`form`, `defineStore`,
`asReadonly`), the `entityMap` loader (`loader()`, v12), and the
`signalForm()` bridge are unchanged. Angular support is 20 / 21 / 22.

See [RFC 0007](../rfcs/0007-packaging-principle-and-ng-forms-reslice.md) for
the packaging principle and the measured classification behind items 1–2.
