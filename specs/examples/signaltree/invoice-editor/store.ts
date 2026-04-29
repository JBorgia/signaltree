/**
 * M2 Scaffold — SignalTree implementation of Invoice Editor
 *
 * Feature contract: specs/examples/feature-contract.md
 * Audit: 2026-04 SignalTree audit
 * SignalTree version: 9.2.1
 * Angular baseline: 20.x
 *
 * IMPORTANT: This scaffold uses ONLY confirmed-working API (per M1 findings):
 *   - entityMap() + no .with(entities()) — entities() throws at runtime (F-002)
 *   - .set()/.update() syntax — callable syntax requires build transform (F-009)
 *   - updateOne(id, changes) for mutations — EntityNode deep writes silently fail (F-012/F-013)
 *   - .all, .count, .ids as getters (not methods) — (F-015)
 */

import { computed, Injectable } from '@angular/core';
import { signalTree, entityMap } from '@signaltree/core';

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  lineItems: LineItem[];
  discount?: number;
  status: 'draft' | 'sent' | 'paid';
}

// ============================================================================
// TEST DATA (from feature-contract.md)
// ============================================================================

export const SAMPLE_LINE_ITEMS: LineItem[] = [
  { id: 'li-1', description: 'Widget A', quantity: 2, unitPrice: 50, taxRate: 0.1 },
  { id: 'li-2', description: 'Widget B', quantity: 1, unitPrice: 200 },
];

export const SAMPLE_INVOICE: Invoice = {
  id: 'inv-1',
  customerId: 'cust-42',
  lineItems: SAMPLE_LINE_ITEMS,
  discount: 10,
  status: 'draft',
};

// ============================================================================
// STORE DEFINITION
// ============================================================================

@Injectable({ providedIn: 'root' })
export class InvoiceStoreService {
  // O1: Initialize store with one invoice containing two line items
  private readonly tree = signalTree({
    invoices: entityMap<Invoice, string>(),
  });

  readonly $ = this.tree.$;

  constructor() {
    // Seed with sample data
    this.tree.$.invoices.addOne(SAMPLE_INVOICE);
  }

  // ==========================================================================
  // HELPERS — private
  // ==========================================================================

  private getInvoice(invoiceId: string): Invoice | undefined {
    // EntityNode<Invoice>() returns the plain Invoice object.
    // NOTE (F-012/F-013): deep access via node.lineItems() works for reading,
    // but node.lineItems.set(...) throws at runtime. Read via node(), mutate
    // via updateOne(id, changes).
    return this.tree.$.invoices.byId(invoiceId)?.();
  }

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  // O2: Add a line item to an existing invoice
  addLineItem(invoiceId: string, item: LineItem): void {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return;
    this.tree.$.invoices.updateOne(invoiceId, {
      lineItems: [...invoice.lineItems, item],
    });
  }

  // O3: Update a line item field
  updateLineItem(invoiceId: string, itemId: string, changes: Partial<LineItem>): void {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return;
    this.tree.$.invoices.updateOne(invoiceId, {
      lineItems: invoice.lineItems.map((li) =>
        li.id === itemId ? { ...li, ...changes } : li
      ),
    });
  }

  // O4: Set optional taxRate (or clear to undefined)
  setLineItemTaxRate(invoiceId: string, itemId: string, taxRate: number | undefined): void {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return;
    this.tree.$.invoices.updateOne(invoiceId, {
      lineItems: invoice.lineItems.map((li) => {
        if (li.id !== itemId) return li;
        // Clearing optional: remove the key entirely to avoid { taxRate: undefined }
        const updated = { ...li };
        if (taxRate === undefined) {
          delete updated.taxRate;
        } else {
          updated.taxRate = taxRate;
        }
        return updated;
      }),
    });
  }

  // O5: Remove a line item
  removeLineItem(invoiceId: string, itemId: string): void {
    const invoice = this.getInvoice(invoiceId);
    if (!invoice) return;
    this.tree.$.invoices.updateOne(invoiceId, {
      lineItems: invoice.lineItems.filter((li) => li.id !== itemId),
    });
  }

  // O9: Change invoice status
  setInvoiceStatus(invoiceId: string, status: Invoice['status']): void {
    this.tree.$.invoices.updateOne(invoiceId, { status });
  }

  // ==========================================================================
  // DERIVED STATE (O6, O7, O8, O10)
  // ==========================================================================

  // O10: All invoices reactive signal
  readonly invoices = computed(() => this.tree.$.invoices.all());

  // Per-invoice derived signals (factory pattern)
  invoiceSignals(invoiceId: string) {
    // O6/O7/O8: Derived from invoice's lineItems array
    // NOTE: tree.$.invoices.byId(invoiceId) returns EntityNode<Invoice>.
    // Calling it () returns the Invoice. Re-read inside computed() to register dependency.
    const invoice = computed(() => this.tree.$.invoices.byId(invoiceId)?.() ?? null);

    const lineItems = computed(() => invoice()?.lineItems ?? []);

    // O6: subtotal per line item
    const lineItemSubtotals = computed(() =>
      lineItems().map((li) => ({
        id: li.id,
        subtotal: li.quantity * li.unitPrice,
      }))
    );

    // O7: tax per line item
    const lineItemTaxes = computed(() =>
      lineItems().map((li) => {
        const subtotal = li.quantity * li.unitPrice;
        return { id: li.id, tax: subtotal * (li.taxRate ?? 0) };
      })
    );

    // O8: invoice total
    const invoiceTotal = computed(() => {
      const items = lineItems();
      const subtotal = items.reduce((sum, li) => {
        const itemSubtotal = li.quantity * li.unitPrice;
        const itemTax = itemSubtotal * (li.taxRate ?? 0);
        return sum + itemSubtotal + itemTax;
      }, 0);
      const discount = invoice()?.discount ?? 0;
      return subtotal - discount;
    });

    return { invoice, lineItems, lineItemSubtotals, lineItemTaxes, invoiceTotal };
  }
}
