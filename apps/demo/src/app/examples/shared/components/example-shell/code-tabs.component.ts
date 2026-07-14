import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import scss from 'highlight.js/lib/languages/scss';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

import type { CodeFile, CodeLang } from './example.types';

// Register grammars once (tree-shaken core, same pattern as the docs page).
let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('xml', xml); // highlight.js highlights HTML as `xml`
  hljs.registerLanguage('scss', scss);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('bash', bash);
  registered = true;
}

/** highlight.js grammar name for a given CodeLang. */
function grammar(lang: CodeLang): string {
  return lang === 'html' ? 'xml' : lang;
}

/**
 * Read-only, syntax-highlighted, tabbed source viewer with per-tab copy.
 * The single replacement for the `.code-example` block redefined across ~9
 * demo stylesheets (none of which highlighted or offered copy).
 */
@Component({
  selector: 'st-code-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (files().length) {
      <div class="code-tabs">
        @if (files().length > 1) {
          <div class="code-tabs__bar" role="tablist">
            @for (file of files(); track file.label; let i = $index) {
              <button
                class="code-tabs__tab"
                role="tab"
                type="button"
                [class.code-tabs__tab--active]="i === active()"
                [attr.aria-selected]="i === active()"
                (click)="active.set(i)"
              >
                {{ file.label }}
              </button>
            }
          </div>
        }

        <div class="code-tabs__body">
          <button
            class="code-tabs__copy"
            type="button"
            (click)="copy()"
            [attr.aria-label]="'Copy ' + current().label"
          >
            {{ copied() ? 'Copied' : 'Copy' }}
          </button>
          <pre
            class="code-tabs__pre"
          ><code [innerHTML]="highlighted()"></code></pre>
        </div>
      </div>
    }
  `,
  styleUrl: './code-tabs.component.scss',
})
export class CodeTabsComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly files = input<CodeFile[]>([]);

  readonly active = signal(0);
  readonly copied = signal(false);

  private copyResetHandle: ReturnType<typeof setTimeout> | undefined;

  readonly current = computed<CodeFile>(
    () =>
      this.files()[this.active()] ??
      this.files()[0] ?? { label: '', language: 'typescript', source: '' }
  );

  readonly highlighted = computed<SafeHtml>(() => {
    ensureRegistered();
    const file = this.current();
    const html = hljs.highlight(file.source, {
      language: grammar(file.language),
      ignoreIllegals: true,
    }).value;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.current().source);
      this.copied.set(true);
      clearTimeout(this.copyResetHandle);
      this.copyResetHandle = setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  }
}
