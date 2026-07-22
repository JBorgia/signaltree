import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NavigationComponent } from './components/navigation/navigation.component';
import { SIGNALTREE_VERSION_SUMMARY } from './version';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule, NavigationComponent],
  template: `
    <div class="app-shell">
      <!-- Full-width top bar — desktop only -->
      <header class="app-topbar">
        <a routerLink="/" class="topbar-brand" title="SignalTree home">
          <img src="/signaltree.svg" alt="SignalTree Logo" class="topbar-logo" />
          <div class="topbar-brand-text">
            <span class="topbar-brand-name">SignalTree</span>
            <span class="topbar-brand-tagline">Reactive JSON</span>
          </div>
        </a>
        <nav class="topbar-actions" aria-label="External links">
          <span class="topbar-version">{{ versionSummary }}</span>
          <a
            href="https://github.com/JBorgia/signaltree"
            target="_blank"
            rel="noopener noreferrer"
            class="topbar-link"
            title="View source on GitHub"
          >🔗 GitHub</a>
          <a
            href="https://www.npmjs.com/org/signaltree"
            target="_blank"
            rel="noopener noreferrer"
            class="topbar-link"
            title="View packages on npm"
          >📦 npm</a>
        </nav>
      </header>

      <!-- Sidebar nav (desktop: sticky col-1; mobile: off-canvas) -->
      <app-navigation></app-navigation>

      <!-- Page content -->
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      /* ── App Shell Grid ─────────────────────────────────────────────────── */
      .app-shell {
        display: grid;
        grid-template-columns: 260px 1fr;
        grid-template-rows: auto 1fr;
        min-height: 100vh;
        background-color: var(--color-background);
      }

      /* ── Top Bar ────────────────────────────────────────────────────────── */
      .app-topbar {
        grid-column: 1 / -1;
        grid-row: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 52px;
        padding: 0 1.25rem 0 1rem;
        background: white;
        border-bottom: 1px solid var(--color-neutral-200);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        z-index: 60;
      }

      .topbar-brand {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        text-decoration: none;
        color: inherit;
        border-radius: var(--radius-md);
        padding: 0.25rem 0.5rem;
        margin-left: -0.5rem;
        transition: background 0.15s ease;
      }
      .topbar-brand:hover {
        background: var(--color-neutral-100);
      }

      .topbar-logo {
        width: 1.75rem;
        height: 1.75rem;
        flex-shrink: 0;
      }

      .topbar-brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
      }

      .topbar-brand-name {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--color-neutral-900);
        letter-spacing: -0.02em;
      }

      .topbar-brand-tagline {
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--color-neutral-500);
      }

      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .topbar-version {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-neutral-400);
        margin-right: 0.5rem;
      }

      .topbar-link {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--color-neutral-600);
        text-decoration: none;
        padding: 0.3rem 0.625rem;
        border-radius: var(--radius-md);
        transition: background 0.12s ease, color 0.12s ease;
      }
      .topbar-link:hover {
        background: var(--color-neutral-100);
        color: var(--color-neutral-900);
      }

      /* ── Sidebar + Main placement ───────────────────────────────────────── */
      app-navigation {
        grid-column: 1;
        grid-row: 2;
      }

      .main-content {
        grid-column: 2;
        grid-row: 2;
        min-width: 0;
        overflow-x: hidden;
      }

      /* ── Mobile (<1024px): collapse to single-column block layout ───────── */
      @media (max-width: 1023px) {
        .app-shell {
          display: block;
        }

        .app-topbar {
          display: none; /* navigation component shows its own mobile topbar */
        }

        .main-content {
          padding-top: 56px; /* clear the navigation component's mobile topbar */
        }
      }
    `,
  ],
})
export class AppComponent {
  readonly versionSummary = SIGNALTREE_VERSION_SUMMARY;
}
