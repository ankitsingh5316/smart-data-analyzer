import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AnalyticsService } from '../../core/services/analytics.service';
import { DatasetService } from '../../core/services/dataset.service';
import { ToastService } from '../../core/services/toast.service';
import { AnalyticsData, Dataset } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { ChartPanelComponent } from '../../shared/chart-panel';
import { EmptyStateComponent } from '../../shared/empty-state';
import { KpiCardComponent } from '../../shared/kpi-card';

@Component({
  selector: 'app-analytics',
  imports: [DecimalPipe, RouterLink, ChartPanelComponent, EmptyStateComponent, KpiCardComponent],
  templateUrl: './analytics.html'
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly analyticsApi = inject(AnalyticsService);
  private readonly datasetsApi = inject(DatasetService);
  private readonly toast = inject(ToastService);
  private subscription?: Subscription;

  protected readonly loading = signal(true);
  protected readonly datasets = signal<Dataset[]>([]);
  protected readonly datasetId = signal('');
  protected readonly data = signal<AnalyticsData | null>(null);
  protected readonly numeric = signal('');
  protected readonly category = signal('');
  protected readonly date = signal('');

  ngOnInit(): void {
    void this.bootstrap();
    this.subscription = this.route.paramMap.subscribe(() => void this.onRoute());
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  protected async chooseDataset(id: string): Promise<void> {
    if (!id) return;
    await this.router.navigate(['/app/analytics', id]);
  }

  protected labels(items: Array<{ label: string }> | null | undefined): string[] {
    return (items || []).map((item) => item.label);
  }

  protected counts(items: Array<{ count: number }> | null | undefined): number[] {
    return (items || []).map((item) => item.count);
  }

  protected async reload(patch: { numeric?: string; category?: string; date?: string }): Promise<void> {
    if (patch.numeric !== undefined) this.numeric.set(patch.numeric);
    if (patch.category !== undefined) this.category.set(patch.category);
    if (patch.date !== undefined) this.date.set(patch.date);
    await this.load();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.datasets.set((await this.datasetsApi.list()).filter((dataset) => dataset.status === 'ready'));
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load datasets.'));
    }
  }

  private async onRoute(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('datasetId') || '';
    this.datasetId.set(id);
    this.numeric.set('');
    this.category.set('');
    this.date.set('');
    if (!id) {
      this.data.set(null);
      this.loading.set(false);
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.analyticsApi.get(this.datasetId(), {
        numeric: this.numeric() || undefined,
        category: this.category() || undefined,
        date: this.date() || undefined
      });
      this.data.set(result);
      this.numeric.set(result.numeric?.columnKey || '');
      this.category.set(result.category?.columnKey || '');
      this.date.set(result.dates?.columnKey || '');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not calculate analytics.'));
    } finally {
      this.loading.set(false);
    }
  }
}
