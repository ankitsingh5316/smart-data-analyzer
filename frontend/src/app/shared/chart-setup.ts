import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';

let registered = false;

export function registerCharts(): void {
  if (registered) return;
  Chart.register(
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    DoughnutController,
    ArcElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler
  );
  registered = true;
}

export const CHART_COLORS = ['#2f5bea', '#0f7b5a', '#b45309', '#6d28d9', '#0e7490', '#be123c', '#3f6212', '#1d4ed8'];
