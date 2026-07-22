
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

/**
 * Navigation component for moving between examples.
 * Displays prev/next links with consistent styling.
 */
@Component({
  selector: 'app-demo-nav',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './demo-nav.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './demo-nav.component.scss',
})
export class DemoNavComponent {
  @Input() prev?: { label: string; link: string };
  @Input() next?: { label: string; link: string };
}
