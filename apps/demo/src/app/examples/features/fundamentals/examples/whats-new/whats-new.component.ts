import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-whats-new',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './whats-new.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './whats-new.component.scss',
})
export class WhatsNewComponent {}
