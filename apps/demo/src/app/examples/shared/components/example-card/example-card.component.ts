import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ComponentRef,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  Type,
  ViewChild,
  ViewContainerRef,
  inject,
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
export class ExampleCardComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input({ required: true }) example!: ExampleMeta;

  @ViewChild('componentContainer', { read: ViewContainerRef, static: true })
  container!: ViewContainerRef;

  protected demoReady = false;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private componentRef?: ComponentRef<unknown>;
  private observer?: IntersectionObserver;

  ngOnInit() {}

  ngAfterViewInit() {
    if (!this.example?.component) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      this.loadDemoComponent();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadDemoComponent();
          this.observer?.disconnect();
          this.observer = undefined;
        }
      },
      {
        rootMargin: '300px 0px',
        threshold: 0.1,
      }
    );

    this.observer.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();

    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }

  loadDemoNow() {
    this.loadDemoComponent();
  }

  private loadDemoComponent() {
    if (this.demoReady || !this.example?.component) {
      return;
    }

    this.demoReady = true;

    const scheduleLoad =
      typeof requestIdleCallback === 'function'
        ? (callback: () => void) => requestIdleCallback(() => callback())
        : (callback: () => void) => setTimeout(callback, 0);

    scheduleLoad(() => {
      if (this.componentRef) {
        return;
      }

      try {
        this.componentRef = this.container.createComponent(
          this.example.component as Type<unknown>
        );
      } catch (error) {
        console.error('Failed to load example component:', error);
        this.container.element.nativeElement.innerHTML = `
          <div class="card__error">
            Failed to load example component. Please check the console for details.
          </div>
        `;
      }
    });
  }
}
