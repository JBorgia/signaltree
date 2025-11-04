import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-signals-examples',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './signals-examples.component.html',
  styleUrls: ['./signals-examples.component.scss'],
})
export class SignalsExamplesComponent {
  // Example A: Counter
  count = signal(0);
  inc() {
    this.count.update((v) => v + 1);
  }
  dec() {
    this.count.update((v) => v - 1);
  }
  reset() {
    this.count.set(0);
  }

  // Example B: Reactive input → greeting (computed)
  name = signal('');
  greeting = computed(() => `Hello, ${this.name().trim() || 'friend'}!`);
}
