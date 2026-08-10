import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * "Does SignalTree fit?" — the honest fit page.
 *
 * Every other page on this site answers "what can it do". This one answers
 * "should you use it", including the cases where the answer is no. It exists
 * because the architecture makes ONE trade — writes and notification are
 * independent of size, materialisation is not — and a visitor who cannot see
 * that trade cannot evaluate the library.
 *
 * Every number here is measured and cited to the harness that produced it. The
 * losing rows are not hedges: they are the same measurements read in the
 * direction that does not flatter us, and they are the reason the winning rows
 * are worth believing.
 */

interface FanoutRow {
  consumers: string;
  signaltree: string;
  immutable: string;
  ratio: string;
}

/**
 * Two columns, deliberately separated.
 *
 * An earlier revision of this grid collapsed them and handed several rows to
 * @ngrx/signals that it does not win on the measurements — CRUD consoles,
 * claims workflows, scheduling boards. What NgRx wins there is ADOPTION, and
 * adoption is a fact about hiring, not about fit. Stating them in one column
 * let ecosystem gravity masquerade as a technical result.
 */
interface FitRow {
  workload: string;
  domains: string;
  fit: 'signaltree' | 'neutral' | 'other';
  /** What the measurements say. */
  best: string;
  /** What an Angular team typically reaches for, which is often not the same. */
  usual: string;
}

interface LoseRow {
  title: string;
  measured: string;
  why: string;
  instead: string;
}

type Support = 'yes' | 'partial' | 'no';

interface CapabilityRow {
  capability: string;
  signaltree: Support;
  ngrxSignals: Support;
  elf: Support;
  ngxs: Support;
  /** Set when 14.0.0-rc.1 changed our answer, so the delta is visible. */
  newIn14?: boolean;
}

interface CapabilityGroup {
  group: string;
  rows: CapabilityRow[];
}

@Component({
  selector: 'app-does-it-fit',
  standalone: true,
  templateUrl: './does-it-fit.component.html',
  styleUrl: './does-it-fit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoesItFitComponent {
  /** Axis 2 of tools/bench-state-scale.mjs — 100 fixed fields, varying consumers. */
  protected readonly fanout: FanoutRow[] = [
    {
      consumers: '0',
      signaltree: '0.007 ms',
      immutable: '0.373 ms',
      ratio: '53x',
    },
    {
      consumers: '100',
      signaltree: '0.020 ms',
      immutable: '2.401 ms',
      ratio: '118x',
    },
    {
      consumers: '1,000',
      signaltree: '0.046 ms',
      immutable: '21.425 ms',
      ratio: '469x',
    },
    {
      consumers: '5,000',
      signaltree: '0.194 ms',
      immutable: '106.503 ms',
      ratio: '549x',
    },
  ];

  /** Axis 1a of the same harness — write cost against state size, zero consumers. */
  protected readonly scale: FanoutRow[] = [
    {
      consumers: '64',
      signaltree: '0.011 ms',
      immutable: '0.042 ms',
      ratio: '4x',
    },
    {
      consumers: '256',
      signaltree: '0.009 ms',
      immutable: '1.339 ms',
      ratio: '145x',
    },
    {
      consumers: '512',
      signaltree: '0.006 ms',
      immutable: '4.541 ms',
      ratio: '727x',
    },
    {
      consumers: '1,024',
      signaltree: '0.006 ms',
      immutable: '21.398 ms',
      ratio: '3591x',
    },
  ];

  /**
   * Capability grid, sourced from docs/compare/capability-matrix.md — which is
   * itself built by reading each library's INSTALLED `.d.ts`, not its README,
   * because a comparison written from docs measures documentation and flatters
   * whoever writes the better one. Reproduce with `node tools/api-surface.mjs`.
   *
   * ⚠️ SEVEN ROWS ARE CORRECTED AGAINST THAT DOC, all in our favour and all
   * verified in source at 14.0.0-rc.1. The matrix was written as the INPUT to
   * this release's gap-closing work and never re-run after the gaps closed, so
   * it understates us. They carry `newIn14` so the delta is visible rather than
   * quietly absorbed — and so the doc's staleness is legible from here.
   *
   * Competitor versions match the matrix exactly against installed packages:
   * @ngrx/signals 21.1.1 · elf 2.5.1 / elf-entities 5.0.2 · @ngxs/store 20.1.0.
   * Akita is omitted — unmaintained upstream, so it is not a live choice.
   */
  protected readonly capabilities: CapabilityGroup[] = [
    {
      group: 'Collections',
      rows: [
        {
          capability: 'CRUD — add / update / remove / upsert / setAll',
          signaltree: 'yes',
          ngrxSignals: 'yes',
          elf: 'yes',
          ngxs: 'partial',
        },
        {
          capability: 'O(1) per-entity read that invalidates only that row',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Predicate update / remove',
          signaltree: 'yes',
          ngrxSignals: 'yes',
          elf: 'yes',
          ngxs: 'partial',
        },
        {
          capability: 'Predicate select / count',
          signaltree: 'partial',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'partial',
        },
        {
          capability: 'Prepend',
          signaltree: 'yes',
          ngrxSignals: 'yes',
          elf: 'yes',
          ngxs: 'yes',
          newIn14: true,
        },
        {
          capability: 'Active-entity tracking',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
          newIn14: true,
        },
        {
          capability: 'Id migration — temp id to server id',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
          newIn14: true,
        },
        {
          capability: 'Per-entity UI state kept off the domain entity',
          signaltree: 'no',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Reorder / move',
          signaltree: 'no',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Bounded / FIFO collection',
          signaltree: 'no',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Pagination',
          signaltree: 'no',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
        {
          capability: 'Multiple named collections in one store',
          signaltree: 'yes',
          ngrxSignals: 'yes',
          elf: 'yes',
          ngxs: 'yes',
        },
      ],
    },
    {
      group: 'History, async, forms',
      rows: [
        {
          capability: 'Undo / redo',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'partial',
        },
        {
          capability: 'Reactive canUndo / canRedo',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'partial',
          newIn14: true,
        },
        {
          capability: 'Jump to index',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Pause / resume recording',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
          newIn14: true,
        },
        {
          capability: 'Comparator to skip uninteresting entries',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
          newIn14: true,
        },
        {
          capability: 'Per-entity undo / redo',
          signaltree: 'no',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'no',
        },
        {
          capability: 'Loading / error status',
          signaltree: 'yes',
          ngrxSignals: 'partial',
          elf: 'partial',
          ngxs: 'partial',
        },
        {
          capability: 'Async source / query primitive',
          signaltree: 'yes',
          ngrxSignals: 'partial',
          elf: 'no',
          ngxs: 'no',
        },
        {
          capability:
            'Request caching / single-flight dedup / tag invalidation',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
          newIn14: true,
        },
        {
          capability: 'Optimistic updates',
          signaltree: 'partial',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
        {
          capability: 'Form model + validators',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
        {
          capability: 'Form wizard',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
      ],
    },
    {
      group: 'Infrastructure',
      rows: [
        {
          capability: 'Persistence',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'yes',
          ngxs: 'yes',
        },
        {
          capability: 'Devtools',
          signaltree: 'yes',
          ngrxSignals: 'partial',
          elf: 'yes',
          ngxs: 'yes',
        },
        {
          capability: 'Batching / transactions',
          signaltree: 'yes',
          ngrxSignals: 'partial',
          elf: 'yes',
          ngxs: 'partial',
        },
        {
          capability: 'Action lifecycle observability',
          signaltree: 'partial',
          ngrxSignals: 'yes',
          elf: 'partial',
          ngxs: 'yes',
        },
        {
          capability: 'Plugin architecture with a public contract',
          signaltree: 'partial',
          ngrxSignals: 'yes',
          elf: 'yes',
          ngxs: 'yes',
        },
        {
          capability: 'Global unhandled-error hook',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'yes',
          newIn14: true,
        },
        {
          capability: 'Testing utilities',
          signaltree: 'partial',
          ngrxSignals: 'partial',
          elf: 'partial',
          ngxs: 'yes',
        },
        {
          capability: 'SSR / transfer state',
          // 14.0.0: `HydrateMode` gained `transfer` and `deserialize()` gained
          // `{ transfer: true }`, so a server payload is applied instead of
          // being declined by markers that (correctly) distrust a `rehydrate`.
          // Partial, not full: you still wire Angular's `TransferState`
          // yourself — nothing here ships an automatic SSR bridge.
          signaltree: 'partial',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'partial',
        },
        {
          capability: 'Diagnostics with stable error codes',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
        {
          capability: 'Granular signals for arbitrary NESTED state',
          signaltree: 'yes',
          ngrxSignals: 'no',
          elf: 'no',
          ngxs: 'no',
        },
      ],
    },
  ];

  protected readonly lose: LoseRow[] = [
    {
      title: 'Every widget reads the whole collection',
      measured: 'update + all() = 97.47 µs, against update + byId() = 1.90 µs',
      why:
        'all() rebuilds the array on every mutation. If nothing binds per entity, you pay the ' +
        'materialisation and collect none of the granularity — slower than a plain array leaf.',
      instead:
        'Model it as an array leaf, or use a store that returns its state by reference.',
    },
    {
      title: 'Deep undo over a LARGE collection',
      measured:
        '~2.5x behind elf over 10,000 rows — and 50x AHEAD of hand-rolled @ngrx/signals',
      why:
        'An immutable store restores by swapping one reference. SignalTree writes values back ' +
        'into per-entity signals, which is what makes reads granular in the first place. Note the ' +
        'blast radius: this needs a large collection AND deep history AND undo being a core ' +
        'feature, all at once. Shallow undo over moderate state — which is what most apps that ' +
        'ship undo actually have — is a SignalTree win, because @ngrx/signals has no undo ' +
        'primitive and the hand-rolled arm measures 216.96 ms against our 4.32 ms.',
      instead:
        'If the undo stack IS the product, use an immutable root. If you just need undo over a ' +
        'big grid, pauseRecording() and timeTravel({ shouldSkip }) are the levers.',
    },
    {
      title: 'Concurrent editing of one document',
      measured:
        'not a benchmark — a layering question, and not a SignalTree loss',
      why:
        'Merge semantics under concurrent edits are a CRDT problem. No state library resolves ' +
        'two people typing in the same paragraph, so this does not discriminate between stores ' +
        'at all. It is listed because people expect it to.',
      instead:
        'Put Yjs or Automerge underneath, and pick the store on the other questions.',
    },
    {
      title: 'A few values in one component',
      measured: 'n/a',
      why: 'Raw signal / computed / linkedSignal / resource is complete for that.',
      instead: 'Use Angular directly. Any store is ceremony here.',
    },
  ];

  protected readonly fit: FitRow[] = [
    {
      workload: 'Streaming telemetry into many per-entity bindings',
      domains:
        'Fleet & logistics, grid/SCADA ops, telecom NOC, manufacturing MES, airline & rail ops, trading blotters',
      fit: 'signaltree',
      best: 'SignalTree, decisively — 469x at 1,000 live consumers',
      usual: 'SignalTree',
    },
    {
      workload: 'Offline-first with server-owned collections',
      domains: 'Field service, mobile operations',
      fit: 'signaltree',
      best: 'SignalTree — loader + hydrateThenRevalidate ship as one config key',
      usual: 'SignalTree',
    },
    {
      workload: 'Deep nested forms with audit and persistence',
      domains: 'Healthcare, claims, regulated workflows',
      fit: 'signaltree',
      best: 'SignalTree — form(), history(), stored() are primitives here and assembly elsewhere',
      usual: 'Toss-up; governance and procurement often decide',
    },
    {
      workload: 'CRUD over moderate lists, server round-trips',
      domains: 'CRM, ERP, admin consoles, insurance',
      fit: 'signaltree',
      best: 'SignalTree leans — 28.5x on the collection task, 50x on undo, four primitives instead of four hand-rolls',
      usual: '@ngrx/signals, on ecosystem gravity rather than fit',
    },
    {
      workload: 'Drag-driven boards and schedules',
      domains: 'Dispatch, Gantt, planning',
      fit: 'signaltree',
      best: 'SignalTree leans — high write frequency, per-item bindings, collections in the hundreds',
      usual: 'Toss-up',
    },
    {
      workload: 'Undo/redo as a shipped feature over moderate state',
      domains: 'Editors-in-a-panel, wizards, bulk edit',
      fit: 'signaltree',
      best: 'SignalTree — timeTravel() exists; @ngrx/signals has no undo primitive',
      usual: 'Hand-rolled snapshot history, which is the 216.96 ms arm',
    },
    {
      workload: 'Whole-dataset reads on every change',
      domains: 'BI and analytics explorers',
      fit: 'neutral',
      best: 'Depends on modelling — a plain array leaf is at parity; entityMap is the wrong tool here',
      usual: 'Toss-up',
    },
    {
      workload: 'Deep undo over LARGE collections',
      domains: 'Design tools, media timelines',
      fit: 'other',
      best: 'An immutable root wins — needs 10k+ rows AND deep history AND undo as a core feature',
      usual: 'elf, or an immutable root under NgRx',
    },
    {
      workload: 'Concurrent editing of one document',
      domains: 'CMS authoring, co-editing',
      fit: 'neutral',
      best: 'Not a store decision — a CRDT goes underneath whichever you pick',
      usual: 'Yjs or Automerge + any store',
    },
    {
      workload: 'A few values inside one component',
      domains: 'Anything small',
      fit: 'other',
      best: 'Raw Angular signals — a store is ceremony',
      usual: 'signal / computed / linkedSignal',
    },
    {
      workload: 'Large teams, long-lived, hiring-driven',
      domains: 'Banking core, public sector',
      fit: 'neutral',
      best: 'No technical winner at this altitude',
      usual: 'NgRx classic — organisational, and legitimately so',
    },
  ];
}
