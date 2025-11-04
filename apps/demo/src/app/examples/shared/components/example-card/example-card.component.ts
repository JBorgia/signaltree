import { CommonModule } from '@angular/common';
import {
  Component,
  ComponentRef,
  Input,
  OnDestroy,
  OnInit,
  Type,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';

import type { ExampleMeta } from '../../../core/models';

/**
 * Reusable card component for displaying individual examples.
 * Supports dynamic component loading and category-based theming.
 */
@Component({
  selector: 'app-example-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './example-card.component.html',
  styleUrl: './example-card.component.scss',
})
export class ExampleCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) example!: ExampleMeta;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: true })
  container!: ViewContainerRef;

  private componentRef?: ComponentRef<unknown>;

  async ngOnInit() {
    if (this.example?.component) {
      try {
        // Dynamically create the component
        this.componentRef = this.container.createComponent(
          this.example.component as Type<unknown>
        );
      } catch (error) {
        console.error('Failed to load example component:', error);
        // Fallback: show an error message
        this.container.element.nativeElement.innerHTML = `
          <div class="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            Failed to load example component. Please check the console for details.
          </div>
        `;
      }
    }
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
