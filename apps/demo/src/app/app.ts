import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NavigationComponent } from './components/navigation/navigation.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule, NavigationComponent],
  template: `
    <div class="app-container">
      <app-navigation></app-navigation>
      <main>
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
      .app-container {
        min-height: 100vh;
        background-color: var(--color-background);
      }
    `,
  ],
})
export class AppComponent {}
