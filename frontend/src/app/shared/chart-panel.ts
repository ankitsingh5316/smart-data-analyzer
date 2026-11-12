import { Component, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { Chart } from 'chart.js';
import { CHART_COLORS, registerCharts } from './chart-setup';

registerCharts();

@Component({
  selector: 'app-chart-panel',
  template: `<div class="chart-frame"><canvas #canvas></canvas></div>`
})
export class ChartPanelComponent implements OnDestroy {
  readonly type = input<'bar' | 'line' | 'doughnut'>('bar');
  readonly labels = input<string[]>([]);
  readonly values = input<number[]>([]);
  readonly seriesLabel = input('Records');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const canvasRef = this.canvas();
      const labels = this.labels();
      const values = this.values();
      const type = this.type();
      const seriesLabel = this.seriesLabel();
      if (!canvasRef) return;
      this.draw(canvasRef.nativeElement, type, labels, values, seriesLabel);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private draw(
    canvas: HTMLCanvasElement,
    type: 'bar' | 'line' | 'doughnut',
    labels: string[],
    values: number[],
    seriesLabel: string
  ): void {
    this.chart?.destroy();
    const colors = type === 'doughnut' ? labels.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]) : '#2f5bea';
    this.chart = new Chart(canvas, {
      type,
      data: {
        labels,
        datasets: [{
          label: seriesLabel,
          data: values,
          backgroundColor: colors,
          borderColor: type === 'line' ? '#2f5bea' : colors,
          borderWidth: type === 'line' ? 2 : 0,
          tension: 0.3,
          fill: type === 'line',
          borderRadius: type === 'bar' ? 6 : 0,
          pointRadius: type === 'line' ? 3 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: type === 'doughnut', position: 'bottom', labels: { boxWidth: 10, font: { family: 'Inter' } } },
          tooltip: { backgroundColor: '#121417', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
        },
        scales: type === 'doughnut' ? undefined : {
          x: { grid: { display: false }, ticks: { color: '#5c6570', font: { family: 'Inter', size: 11 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: '#5c6570', font: { family: 'Inter', size: 11 } }, grid: { color: '#eef0f3' } }
        }
      }
    });
  }
}
