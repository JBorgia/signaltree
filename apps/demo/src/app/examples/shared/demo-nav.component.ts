import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-demo-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './demo-nav.component.html',
  styleUrls: ['./demo-nav.component.scss'],
})
export class DemoNavComponent {
  @Input() prev?: { label: string; link: string };
  @Input() next?: { label: string; link: string };
}
