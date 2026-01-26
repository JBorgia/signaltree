# PrimeNG Migration Plan for Demo App

Last updated: 2025-11-15

## Objectives

- Unify look and feel using PrimeNG components, tokens, and utilities.
- Reduce custom SCSS and gradients/shadows; favor theme variables.
- Migrate incrementally with low risk; keep business logic and Signals intact.

## Scope

- App shell, navigation, shared example card, fundamentals filters/grid.
- Core pages: Documentation, Signal Forms, Realistic Comparison (orchestrator), Benchmark History.
- Data-heavy components (tables) targeted in a later phase.

---

## Phase 0 — Foundation (Dependencies + Global Styles)

1. Dependencies

```sh
pnpm add primeng primeicons primeflex
```

2. Global styles

Add these to `apps/demo/project.json` → `targets.build.options.styles` BEFORE `apps/demo/src/styles.scss`:

```json
{
  "styles": ["node_modules/primeng/resources/themes/aura-light-green/theme.css", "node_modules/primeng/resources/primeng.min.css", "node_modules/primeicons/primeicons.css", "node_modules/primeflex/primeflex.css", "apps/demo/src/styles.scss"]
}
```

3. Verify build

```sh
pnpm nx build demo
```

Notes:

- Theme can later be switched to any Aura/Lara/Nora variant.
- Avoid importing PrimeNG CSS through SCSS to keep caching optimal.

---

## Phase 1 — Shell + Shared Components

### App Shell

- Files:
  - `apps/demo/src/app/app.html`
  - `apps/demo/src/app/app.ts`
- Changes:
  - Replace header with `p-menubar` or `p-toolbar` + `p-menubar` combo.
  - Use PrimeFlex for layout containers (`container`, `grid`, `col-*`).
- Imports (standalone): `MenubarModule`, `ToolbarModule`, `ButtonModule`, optionally `AvatarModule`.

### Navigation

- Files:
  - `apps/demo/src/app/components/navigation/navigation.component.{ts,html,scss}`
- Changes:
  - Model navigation links as `MenuItem[]`.
  - Use `<p-menubar [model]="items">` and optional `start`/`end` templates for brand/actions.
  - Replace custom icons with PrimeIcons (`pi pi-...`).
- Imports: `MenubarModule`, `ButtonModule`, `BadgeModule` if needed.

### Example Card

- Files:
  - `apps/demo/src/app/examples/shared/components/example-card/example-card.component.{ts,html,scss}`
- Changes:
  - Replace outer container with `<p-card>`; put title in `header` template.
  - Convert tags/badges to `<p-tag>`/`p-badge>`; use `<button pButton>` for actions.
  - Keep the "New" badge using `p-badge` or `p-tag`.
- Imports: `CardModule`, `TagModule`, `BadgeModule`, `ButtonModule`.
- Styles: remove heavy shadows/gradients; rely on theme; keep spacing only.

### Fundamentals Page (filters + grid)

- Files:
  - `apps/demo/src/app/examples/features/fundamentals/pages/fundamentals-page/fundamentals-page.component.{ts,html,scss}`
- Changes:
  - Search → `<input pInputText>` with `pi` icon if desired.
  - Category, difficulty, focus selectors → `<p-multiSelect>` or `<p-selectButton>`.
  - Chips/tags → `<p-chips>` if freeform; else remain `p-multiSelect` templating.
  - Grid → PrimeFlex (`grid`, `col-12 md:col-6 lg:col-4`).
- Imports: `InputTextModule`, `MultiSelectModule`, `SelectButtonModule`, `ChipsModule`, `DropdownModule`, `CardModule`.

Build/verify:

```sh
pnpm nx build demo
pnpm nx serve demo
```

---

## Phase 2 — Core Pages (Primitives Migration)

### Documentation

- Files:
  - `apps/demo/src/app/pages/documentation/documentation.component.{ts,html,scss}`
- Changes:
  - Sectioning via `<p-accordion>`; code/preview via `<p-tabView>`.
  - Info boxes via `<p-panel>` or `<p-card>`.
- Imports: `AccordionModule`, `TabViewModule`, `PanelModule`, `ButtonModule`, `InputTextModule` (search).

### Signal Forms Examples

- Files:
  - `apps/demo/src/app/examples/features/fundamentals/examples/signal-forms/signal-forms-demo.component.{ts,html,scss}`
- Changes:
  - Inputs → `<input pInputText>`; numeric → `<p-inputNumber>`; boolean → `<p-checkbox>` or `<p-inputSwitch>`; selects → `<p-dropdown>`/`<p-multiSelect>`; buttons → `<button pButton>`.
  - Maintain `toWritableSignal` integration and `connect()` behavior.
- Imports: `InputTextModule`, `InputNumberModule`, `CheckboxModule`, `InputSwitchModule`, `DropdownModule`, `MultiSelectModule`, `ButtonModule`.

### Realistic Comparison — Orchestrator

- Files:
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/benchmark-orchestrator.component.{ts,html,scss}`
- Changes:
  - Switches → `<p-inputSwitch>`; selects → `<p-dropdown>`; actions → `<button pButton>`; notifications → `p-toast` (optional).
- Imports: `InputSwitchModule`, `DropdownModule`, `ButtonModule`, `ToastModule` (with `MessageService`).

Build/verify each page after migration.

---

## Phase 3 — Data-heavy Components

### Benchmark History

- Files:
  - `apps/demo/src/app/pages/realistic-benchmark-history/realistic-benchmark-history.component.{ts,html,scss}`
- Changes:
  - Filters/search → `p-calendar` (date range), `p-dropdown`, `p-multiSelect`, `p-inputText`.
  - Data table → migrate to `<p-table>` with paginator/sorters if needed.
- Imports: `CalendarModule`, `DropdownModule`, `MultiSelectModule`, `InputTextModule`, `TableModule`, `PaginatorModule` if used.

### Benchmark Results Table (Shared)

- Files:
  - `apps/demo/src/app/components/benchmark-results-table/*`
- Changes:
  - Replace native table with `<p-table>` incrementally; start with basic columns, then add sorting/filtering.
- Imports: `TableModule` (+ optional `PaginatorModule`, `TooltipModule`).

---

## Phase 4 — Polish & Theming

- Theme switcher:
  - Add service to toggle theme href (e.g., Aura light/dark).
  - Add `p-selectButton`/`p-dropdown` in header; persist in localStorage.
- Icon audit → use `pi` icons consistently.
- Remove redundant custom SCSS and assets.

---

## Module Imports (per component)

Import only what’s used to keep bundles lean. Common modules:

- Core UI: `CardModule`, `ButtonModule`, `InputTextModule`, `DropdownModule`, `MultiSelectModule`, `CheckboxModule`, `InputSwitchModule`, `InputNumberModule`, `ChipsModule`.
- Layout/Containers: `PanelModule`, `AccordionModule`, `TabViewModule`, `ToolbarModule`, `MenubarModule`.
- Feedback/Data: `ToastModule`, `TableModule`, `PaginatorModule`, `CalendarModule`, `TagModule`, `BadgeModule`.

---

## Risks & Mitigations

- CSS conflicts: PrimeNG themes vs existing SCSS — mitigate by removing heavy overrides and namespacing custom styles.
- Bundle size: Only import needed modules; keep images/fonts optimized.
- Accessibility regressions: Keep label/for associations; PrimeNG components are ARIA-friendly—validate templates.

---

## Verification Checklist

- Build passes after each phase: `pnpm nx build demo`.
- Visual QA in dev server: `pnpm nx serve demo`.
- Functional tests for Signal Forms continue to pass.
- No console errors; Lighthouse basic pass on key pages.

---

## Rollback Strategy

- Phased PRs; revert by PR if regressions appear.
- Keep component-level changes localized; avoid cross-cutting style changes until Phase 4.

---

## Work Tracking

- Phase 0: deps + global styles.
- Phase 1: shell, navigation, example card, fundamentals filters/grid.
- Phase 2: documentation, signal-forms, orchestrator.
- Phase 3: benchmark history/table → `p-table`.
- Phase 4: theme switcher, icon audit, SCSS cleanup.
