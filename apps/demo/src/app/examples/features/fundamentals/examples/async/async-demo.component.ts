import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Async Operations — fundamentals tour entry.
 *
 * The canonical async demo lives at /async (asyncSource + asyncQuery markers).
 * This entry exists in the fundamentals tour as a pointer so the tour
 * acknowledges async without duplicating the full interactive demo.
 *
 * Previously this component implemented its own debounced search and load
 * lifecycle using raw `signal()` — pre-SignalTree-marker patterns that
 * taught the wrong shape. Replaced in 9.6.0 audit.
 */
@Component({
  selector: 'app-async-demo',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './async-demo.component.html',
  styleUrl: './async-demo.component.scss',
})
export class AsyncDemoComponent {}
