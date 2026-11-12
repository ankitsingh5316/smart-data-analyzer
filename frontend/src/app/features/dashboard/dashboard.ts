import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { ToastService } from '../../core/services/toast.service';
import { DashboardData } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { ChartPanelComponent } from '../../shared/chart-panel';
import { EmptyStateComponent } from '../../shared/empty-state';
import { IconComponent } from '../../shared/icon';
import { KpiCardComponent } from '../../shared/kpi-card';
import { StatusPillComponent } from '../../shared/status-pill';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, UpperCasePipe, KpiCardComponent, ChartPanelComponent, StatusPillComponent, EmptyStateComponent, IconComponent],
  templateUrl: './dashboard.html'
})
export class DashboardComponent implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly data = signal<DashboardData | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected labels(items: Array<{ label: string }> | undefined): string[] {
    return (items || []).map((item) => item.label);
  }

  protected statusLabels(items: Array<{ status: string }> | undefined): string[] {
    return (items || []).map((item) => item.status);
  }

  protected counts(items: Array<{ count: number }> | undefined): number[] {
    return (items || []).map((item) => item.count);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.data.set(await this.dashboard.summary());
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load the dashboard.'));
    } finally {
      this.loading.set(false);
    }
  }
}
