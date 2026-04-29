# M2 Feature Contract — Invoice Editor

**Audit:** 2026-04 SignalTree audit
**Scaffold date:** 2026-04-29
**SignalTree version:** 9.2.1
**NgRx SignalStore version:** @ngrx/signals@^20.1.0 (exact pinned in lock file)
**Angular baseline:** 20.x

---

## Feature description

A nested entity editor representing an Invoice with embedded Line Items.
Both sides (SignalTree and NgRx SignalStore) must implement the **same feature**
from this contract — no shortcuts, no simplifications on either side.

## Domain model

```typescript
interface LineItem {
  id: string;
  description: string;
  quantity: number;           // must be > 0
  unitPrice: number;          // must be >= 0
  taxRate?: number;           // optional 0–1, e.g. 0.1 = 10%
}

interface Invoice {
  id: string;
  customerId: string;
  lineItems: LineItem[];
  discount?: number;          // optional flat discount in currency units
  status: 'draft' | 'sent' | 'paid';
}
```

## Required operations (both sides must implement all)

| # | Operation | Stress test |
|---|---|---|
| O1 | Initialize store with one invoice containing two line items | JSON-init, nested array, optional fields |
| O2 | Add a line item to an existing invoice | Array mutation |
| O3 | Update a line item field (`quantity`, `unitPrice`, `description`) | Deep update, type safety |
| O4 | Update optional `taxRate` (set, then clear to `undefined`) | Optional field |
| O5 | Remove a line item from an invoice | Array mutation |
| O6 | Read `subtotal` per line item (derived: `qty × unitPrice`) | Derived computation |
| O7 | Read `tax` per line item (derived: `subtotal × taxRate`) | Derived, optional field |
| O8 | Read invoice `total` (derived: `Σ(item.subtotal + item.tax) - discount`) | Cross-item derived |
| O9 | Change invoice `status` from `draft` → `sent` | Enum field update |
| O10 | Read all line items reactively (list updates when items added/removed) | Reactive collection |

## Derived state specification

```typescript
// Per line item
lineItemSubtotal(item: LineItem): number => item.quantity * item.unitPrice
lineItemTax(item: LineItem): number => lineItemSubtotal(item) * (item.taxRate ?? 0)
lineItemTotal(item: LineItem): number => lineItemSubtotal(item) + lineItemTax(item)

// Per invoice
invoiceSubtotal(invoice: Invoice): number => sum(lineItemTotal(item) for item in invoice.lineItems)
invoiceTotal(invoice: Invoice): number => invoiceSubtotal(invoice) - (invoice.discount ?? 0)
```

## Test data (same for both sides)

```typescript
const SAMPLE_LINE_ITEMS: LineItem[] = [
  { id: 'li-1', description: 'Widget A', quantity: 2, unitPrice: 50, taxRate: 0.1 },
  { id: 'li-2', description: 'Widget B', quantity: 1, unitPrice: 200 }, // no taxRate
];

const SAMPLE_INVOICE: Invoice = {
  id: 'inv-1',
  customerId: 'cust-42',
  lineItems: SAMPLE_LINE_ITEMS,
  discount: 10,
  status: 'draft',
};

// Expected derived values:
// li-1: subtotal=100, tax=10, total=110
// li-2: subtotal=200, tax=0, total=200
// invoice: subtotal=310, total=300 (after discount=10)
```

## DX notes schema (per measurement-protocol.md §4)

Both implementations must produce a `dx-notes.json` file:

```json
{
  "implementation": "signaltree" | "ngrx-signal-store",
  "feature": "invoice_editor_v1",
  "time_to_first_compiling_invoice_minutes": 0,
  "ts_errors_hit_count": 0,
  "ts_errors_hit_examples": [],
  "retries_to_get_typing_right": 0,
  "workarounds_applied": [],
  "subjective_1to5": 0,
  "subjective_rationale": ""
}
```

## Bundle size format (per measurement-protocol.md §1)

Both implementations must produce a `bundle-size.json` file after production build:

```json
{
  "implementation": "signaltree" | "ngrx-signal-store",
  "raw_bytes": 0,
  "gzip_bytes": 0,
  "brotli_bytes": 0,
  "angular_cli_version": "X.Y.Z",
  "node_version": "X.Y.Z",
  "build_command": "ng build --configuration production",
  "captured_at": "2026-MM-DD"
}
```

**Note:** Bundle size measurement requires a dedicated build run. The scaffold
code is a representative service/store — bundle size comparison is deferred to
M4 unless a build environment is available in this session.

## Second-pair-of-eyes requirement (NgRx side)

Per `specs/design/second-pair-of-eyes.md`: after the NgRx implementation is
written, a fresh Claude session given only NgRx docs must review:
- That the NgRx implementation is idiomatic (not a strawman)
- That `withEntities`, `patchState`, `updateEntity` are used per current NgRx SignalStore docs
- That derived state uses `withComputed` per NgRx conventions

The review transcript lives at `specs/examples/ngrx-signal-store/invoice-editor/second-pair-review.md`.

## Pre-validation result

- [x] NgRx SignalStore can express the invoice schema: `withEntities<Invoice>()` stores Invoice
      with embedded `lineItems: LineItem[]`. Line item updates use `updateEntity` with a
      function change. Derived totals use `withComputed`. **Validated.**
- [x] SignalTree can express the invoice schema: `entityMap<Invoice, string>()` stores invoices.
      Line items are embedded arrays updated via `updateOne(id, { lineItems: newItems })`.
      Derived totals use Angular `computed()`. **Validated.**
- [x] Both sides use the same feature (O1–O10). No simplifications.
