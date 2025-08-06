import { signalStore } from '@signal-store';

import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NxWelcome } from './nx-welcome';

@Component({
  imports: [NxWelcome, RouterModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'demo';

  store = signalStore({ name: 'borgia', age: 30, location: 'San Francisco' });

  constructor() {
    this.store.name.set('Jonathan Borgia');
    this.store.age.set(30);
    this.store.location.set('San Francisco');
  }
}
