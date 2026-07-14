import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';

import { CodeTabsComponent } from './code-tabs.component';
import { EmissionLogComponent } from './emission-log.component';
import type {
  CodeFile,
  EmissionEntry,
  StackblitzConfig,
} from './example.types';
import { StackblitzService } from './stackblitz.service';
import { StateInspectorComponent } from './state-inspector.component';

/**
 * `st-example` — the one shell every demo uses.
 *
 * Regions turn on by input, so a demo declares only what it has:
 *   - intro       → `heading` + `intro` (or project `[intro]` for rich markup)
 *   - live demo   → default `<ng-content>` (buttons, inputs, output)
 *   - live state  → `[state]` (bind a `computed()` snapshot)
 *   - emissions   → `[emissions]` (from `trackEmissions(...)`)
 *   - source      → `[code]` (tabbed, highlighted, copyable)
 *   - playground  → `[stackblitz]` (adds an "Edit in StackBlitz" button)
 *
 * @example
 * <st-example heading="Counter" [intro]="…" [state]="snapshot()"
 *             [emissions]="emissions()" [code]="files" [stackblitz]="sb">
 *   <button (click)="inc()">+1</button>
 * </st-example>
 */
@Component({
  selector: 'st-example',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeTabsComponent, StateInspectorComponent, EmissionLogComponent],
  template: `
    <section class="st-example">
      <header class="st-example__header">
        @if (heading()) {
          <h2 class="st-example__heading">{{ heading() }}</h2>
        }
        <div class="st-example__intro">
          <ng-content select="[intro]"></ng-content>
          @if (intro()) {
            <p>{{ intro() }}</p>
          }
        </div>
      </header>

      <div class="st-example__demo">
        <ng-content></ng-content>
      </div>

      @if (state() !== undefined || emissions() !== null) {
        <div class="st-example__reactive">
          @if (state() !== undefined) {
            <div class="st-example__panel">
              <st-state-inspector
                [value]="state()"
                [label]="stateLabel()"
              />
            </div>
          }
          @if (emissions() !== null) {
            <div class="st-example__panel">
              <p class="st-example__panel-label">Emissions</p>
              <st-emission-log [entries]="emissions() ?? []" />
            </div>
          }
        </div>
      }

      @if (code().length) {
        <div class="st-example__code">
          <div class="st-example__code-head">
            <h3 class="st-example__code-title">Source</h3>
            @if (stackblitz()) {
              <button
                class="st-example__edit"
                type="button"
                (click)="openStackblitz()"
              >
                Edit in StackBlitz ↗
              </button>
            }
          </div>
          <st-code-tabs [files]="code()" />
        </div>
      }
    </section>
  `,
  styleUrl: './example.component.scss',
})
export class ExampleComponent {
  private readonly stackblitz_ = inject(StackblitzService);

  readonly heading = input<string>('');
  readonly intro = input<string>('');
  readonly code = input<CodeFile[]>([]);
  /** Bind a `computed()` snapshot; `undefined` hides the inspector. */
  readonly state = input<unknown>(undefined);
  readonly stateLabel = input<string>('Live state');
  /** `null` hides the emission log; `[]` shows its empty state. */
  readonly emissions = input<EmissionEntry[] | null>(null);
  /** Presence adds the "Edit in StackBlitz" button. */
  readonly stackblitz = input<StackblitzConfig | null>(null);

  openStackblitz(): void {
    const config = this.stackblitz();
    if (config) this.stackblitz_.open(config);
  }
}
