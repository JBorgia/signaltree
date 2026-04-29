# M3 Adversarial AI-agent Test — Prompt Design

**Audit:** 2026-04 SignalTree audit  
**Phase:** M3 (after M1 static review, after M2 scaffold-and-build)  
**Objective:** Empirically validate M1 AI-legibility findings (F-002, F-003, F-005, F-006, F-007, F-009)  
**Control requirement (S4):** Fresh Claude session — no audit findings, no source access, no prior context from this session  

---

## Context for the test runner

You (the test runner) are a **different person** from the M1 auditor. You will:

1. Open a **completely fresh Claude session** (no history, no system prompt with audit context)
2. Give the agent ONLY what is specified in §2 below — nothing else
3. Capture the complete conversation transcript
4. Save transcript to `specs/examples/m3-prompts/transcript.md`
5. Annotate the transcript with finding IDs (`specs/examples/m3-prompts/transcript-annotated.md`)

Do NOT tell the agent that this is an audit. Do NOT give it the audit findings. Do NOT give it the source files from `packages/core/src/`.

---

## What to give the agent (verbatim or close)

### Prompt 1 — Setup

```
I'm building an Angular 20 app and want to use SignalTree (@signaltree/core v9.2.1) for state management.

The README is attached (see below or at packages/core/README.md in the signaltree monorepo).

Please implement an invoice editor service that:
- Stores invoices using the signalTree entity collection API
- Each invoice has: id, customerId, lineItems (array), discount?, status ('draft'|'sent'|'paid')
- Each line item has: id, description, quantity, unitPrice, taxRate?

Required operations:
1. Initialize with one sample invoice containing two line items
2. Add a line item to an existing invoice
3. Update a line item field (description, quantity, unitPrice)
4. Set or clear the taxRate on a line item (optional field)
5. Remove a line item
6. Expose a reactive signal of all invoices
7. Compute per-line-item subtotal (qty × unitPrice)
8. Compute per-line-item tax (subtotal × taxRate, 0 if no taxRate)
9. Compute invoice total (sum of all (subtotal + tax) minus discount)
10. Change invoice status

Provide the complete TypeScript service class.
```

*(Attach or paste the contents of `packages/core/README.md`)*

### Prompt 2 — If agent produces code with errors (give verbatim error)

Give the agent the TypeScript compiler error or the runtime error exactly as it appears. Do not interpret it or give hints about the cause.

Example: if the agent uses `.with(entities())`:
```
TS2305: Module '@signaltree/core' has no exported member 'entities'.
```

Example: if the agent uses callable setter without transform:
```
The store initialized successfully but tree.$.invoices('wrong data') did not update state — the invoice list is still showing the old value.
```

### Prompt 3 — After first working implementation (probe for specific patterns)

```
Can you show me how to do the mutation using the direct property write on the entity node? 
Something like: store.$.invoices.byId('inv-1').status = 'sent' or byId('inv-1').status.set('sent')
```

*(This probes F-013 — the agent may confirm this works because the types suggest it does)*

---

## What to annotate in the transcript

For each agent error, note:
- The exact incorrect code the agent generated
- Which finding it corresponds to (F-002, F-003, F-005, F-006, F-007, F-009, F-012, F-013)
- How many follow-up turns were needed to recover
- Whether the agent recovered spontaneously or required an error message

### Annotation format

```markdown
<!-- FINDING: F-XXX | turns-to-recover: N | recovery: spontaneous | prompted-by-error -->
```

---

## Expected failures (from M1 findings)

| Finding | Expected agent mistake |
|---|---|
| F-002 | Imports or uses `entities()` from '@signaltree/core' → compile error |
| F-003 | Calls `tree.effect()` or `tree.subscribe()` → runtime: "is not a function" |
| F-005 | Uses `withTimeTravel` → TS error; uses `maxHistory` → silent (wrong config key) |
| F-006 | Uses `.with(batching(), devTools())` multi-arg → second enhancer silently dropped |
| F-007 | Uses `setMany`, `selectAll`, `selectBy`, `selectTotal`, `selectIds` → runtime errors |
| F-009 | Uses callable setter `tree.$.invoices(state)` → silent no-op |
| F-012 | Calls `node(newValue)` to update entity → silent no-op |
| F-013 | Calls `node.status.set('sent')` → runtime throw |

---

## Success metric

**Primary:** Count errors-per-finding-id. Each finding that manifests ≥1 agent error is "empirically confirmed."  
**Secondary:** Count total recovery turns across all errors. High turn count = high AI friction cost.  
**Null hypothesis:** Agent produces working code with 0 errors (would require README to be correct — contradicts M1 findings).

---

## Output artifacts

| File | Contents |
|---|---|
| `transcript.md` | Raw conversation (agent messages only, no editorial) |
| `transcript-annotated.md` | Same transcript with `<!-- FINDING: ... -->` annotations |
| `m3-results-summary.md` | Table: finding × error count × recovery turns; verdict |
