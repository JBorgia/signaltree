import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavigationComponent } from './components/navigation/navigation.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterModule, NavigationComponent],
  template: `
    <div class="min-h-screen bg-gray-100">
      <app-navigation></app-navigation>
      <main>
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [],
})
export class AppComponent {}
