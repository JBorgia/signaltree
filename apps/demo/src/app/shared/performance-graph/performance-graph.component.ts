import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';

@Component({
  selector: 'app-performance-graph',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  template: `
    <div
      class="graph-container"
      [style.height.px]="!fill ? height : null"
      [style.height]="fill ? '100%' : null"
    >
      <echarts [options]="options" class="chart"></echarts>
    </div>
  `,
  styles: [
    `
      .graph-container {
        width: 100%;
      }
      .chart {
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerformanceGraphComponent implements OnChanges {
  @Input() title = 'Iterations (ms)';
  @Input() seriesAName = 'Library A';
  @Input() seriesBName = 'Library B';
  @Input() seriesA: number[] = [];
  @Input() seriesB: number[] = [];
  // Height of the graph container in pixels
  @Input() height = 360;
  // If true, the graph fills the parent's height. Ensure parent sets an explicit height.
  @Input() fill = false;
  // Optional: provide many series instead of just A/B
  @Input() series?: Array<{ name: string; data: number[] }>;

  options: Record<string, unknown> = this.buildOptions();

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['series'] ||
      changes['seriesA'] ||
      changes['seriesB'] ||
      changes['title']
    ) {
      this.options = this.buildOptions();
    }
  }

  private buildOptions(): Record<string, unknown> {
    const multi =
      this.series && this.series.length > 0 ? this.series : undefined;
    const maxLen = multi
      ? multi.reduce((m, s) => Math.max(m, s.data.length), 0)
      : Math.max(this.seriesA.length, this.seriesB.length);
    const x = Array.from({ length: maxLen }, (_, i) => i + 1);
    const legendData = multi
      ? multi.map((s) => s.name)
      : [this.seriesAName, this.seriesBName];
    const series = multi
      ? multi.map((s) => ({
          name: s.name,
          type: 'line',
          showSymbol: false,
          data: s.data,
          lineStyle: { width: 1.5 },
        }))
      : [
          {
            name: this.seriesAName,
            type: 'line',
            showSymbol: false,
            data: this.seriesA,
            lineStyle: { width: 1.5 },
          },
          {
            name: this.seriesBName,
            type: 'line',
            showSymbol: false,
            data: this.seriesB,
            lineStyle: { width: 1.5 },
          },
        ];

    return {
      animation: false,
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 20, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: x,
        name: 'iteration',
        boundaryGap: false,
      },
      yAxis: { type: 'value', name: 'ms', scale: true },
      legend: { data: legendData },
      title: { text: this.title, left: 'center', textStyle: { fontSize: 13 } },
      series,
    };
  }
}
