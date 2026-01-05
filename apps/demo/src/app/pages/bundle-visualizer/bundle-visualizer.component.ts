import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-bundle-visualizer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bundle-visualizer.component.html',
})
export class BundleVisualizerComponent {
  stats = signal<any | null>(null);
  async loadSample() {
    const res = await fetch('/signaltree-sample-stats.json');
    this.stats.set(await res.json());
  }

  totalBytes() {
    const s = this.stats();
    if (!s || !s.inputs) return 0;
    return Object.values(s.inputs).reduce(
      (acc: any, v: any) => acc + (v.bytes || 0),
      0
    );
  }
}
