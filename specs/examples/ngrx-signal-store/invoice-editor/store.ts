/**
 * M2 Scaffold — NgRx SignalStore implementation of Invoice Editor
 *
 * Feature contract: specs/examples/feature-contract.md
 * Audit: 2026-04 SignalTree audit
 * NgRx SignalStore version: @ngrx/signals@^20.1.0
 * Angular baseline: 20.x
 *
 * Second-pair-of-eyes required: a fresh Claude session given only NgRx docs
 * must review this file for idiomaticity before M2 DX notes are finalised.
 * Review transcript: specs/examples/ngrx-signal-store/invoice-editor/second-pair-review.md
 */

import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods } from '@ngrx/signals';
import {
  addEntity,
  removeEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';

// ============================================================================
// DOMAIN TYPES (same as feature-contract.md)
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

export const InvoiceStore = signalStore(
  { providedIn: 'root' },

  // O1: entity collection — Invoice entities keyed by 'id' (default)
  withEntities<Invoice>(),

  // ==========================================================================
  // MUTATIONS (O2–O5, O9)
  // ==========================================================================
  withMethods((store) => ({
    // O2: Add a line item to an existing invoice
    addLineItem(invoiceId: string, item: LineItem): void {
      patchState(
        store,
        updateEntity({
          id: invoiceId,
          changes: (invoice) => ({
            lineItems: [...invoice.lineItems, item],
          }),
        }),
      );
    },

    // O3: Update a line item field
    updateLineItem(invoiceId: string, itemId: string, changes: Partial<LineItem>): void {
      patchState(
        store,
        updateEntity({
          id: invoiceId,
          changes: (invoice) => ({
            lineItems: invoice.lineItems.map((li) =>
              li.id === itemId ? { ...li, ...changes } : li,
            ),
          }),
        }),
      );
    },

    // O4: Set optional taxRate (or clear to undefined)
    setLineItemTaxRate(invoiceId: string, itemId: string, taxRate: number | undefined): void {
      patchState(
        store,
        updateEntity({
          id: invoiceId,
          changes: (invoice) => ({
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
          }),
        }),
      );
    },

    // O5: Remove a line item
    removeLineItem(invoiceId: string, itemId: string): void {
      patchState(
        store,
        updateEntity({
          id: invoiceId,
          changes: (invoice) => ({
            lineItems: invoice.lineItems.filter((li) => li.id !== itemId),
          }),
        }),
      );
    },

    // O9: Change invoice status
    setInvoiceStatus(invoiceId: string, status: Invoice['status']): void {
      patchState(
        store,
        updateEntity({
          id: invoiceId,
          changes: { status },
        }),
      );
    },

    // Per-invoice derived signals (factory pattern — mirrors SignalTree side)
    // O6/O7/O8/O10: Returns a set of computed signals for a given invoiceId.
    // Unlike the SignalTree side there is no byId() cursor — we read from entityMap()
    // directly inside computed() to register reactivity.
    invoiceSignals(invoiceId: string) {
      const invoice = computed(() => store.entityMap()[invoiceId] ?? null);
      const lineItems = computed(() => invoice()?.lineItems ?? []);

      // O6: subtotal per line item
      const lineItemSubtotals = computed(() =>
        lineItems().map((li) => ({
          id: li.id,
          subtotal: li.quantity * li.unitPrice,
        })),
      );

      // O7: tax per line item
      const lineItemTaxes = computed(() =>
        lineItems().map((li) => {
          const subtotal = li.quantity * li.unitPrice;
          return { id: li.id, tax: subtotal * (li.taxRate ?? 0) };
        }),
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
    },
  })),

  // O10: All invoices reactive signal — provided by withEntities() as store.entities()
  withComputed((store) => ({
    invoices: computed(() => store.entities()),
  })),

  // O1: Seed with sample data on store init
  withHooks({
    onInit(store) {
      patchState(store, addEntity(SAMPLE_INVOICE));
    },
  }),
);
