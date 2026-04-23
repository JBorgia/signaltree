import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NavigationComponent } from './components/navigation/navigation.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule, NavigationComponent],
  template: `
    <div class="app-shell">
      <app-navigation></app-navigation>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
      .app-shell {
        display: grid;
        grid-template-columns: 260px 1fr;
        min-height: 100vh;
        background-color: var(--color-background);
      }

      .main-content {
        min-width: 0;
        overflow-x: hidden;
      }

      @media (max-width: 1023px) {
        .app-shell {
          display: block;
        }

        .main-content {
          padding-top: 56px;
        }
      }
    `,
  ],
})
export class AppComponent {}
