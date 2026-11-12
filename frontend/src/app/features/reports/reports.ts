import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DatasetService } from '../../core/services/dataset.service';
import { FilterService } from '../../core/services/filter.service';
import { ReportService } from '../../core/services/report.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Dataset, DatasetColumn, HistoryItem, ReportFormat, ReportItem, SavedFilter } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { EmptyStateComponent } from '../../shared/empty-state';
import { FileSizePipe } from '../../shared/pipes';
import { StatusPillComponent } from '../../shared/status-pill';

@Component({
  selector: 'app-reports',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, UpperCasePipe, EmptyStateComponent, FileSizePipe, StatusPillComponent],
  templateUrl: './reports.html'
})
export class ReportsComponent implements OnInit, OnDestroy {
  private readonly reportsApi = inject(ReportService);
  private readonly datasetsApi = inject(DatasetService);
  private readonly filtersApi = inject(FilterService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private routeSub?: Subscription;

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly datasets = signal<Dataset[]>([]);
  protected readonly columns = signal<DatasetColumn[]>([]);
  protected readonly savedFilters = signal<SavedFilter[]>([]);
  protected readonly reports = signal<ReportItem[]>([]);
  protected readonly history = signal<HistoryItem[]>([]);
  protected readonly selectedColumns = signal<string[]>([]);
  protected readonly format = signal<ReportFormat>('xlsx');
  protected readonly form = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    datasetId: ['', Validators.required],
    savedFilterId: ['']
  });

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const preset = params.get('datasetId') || '';
      if (preset && preset !== this.form.controls.datasetId.value) {
        void this.onDatasetChange(preset);
      }
    });
    void this.load();
    this.pollTimer = setInterval(() => {
      if (this.reports().some((report) => report.status === 'queued' || report.status === 'processing')) {
        void this.refreshLists();
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  protected async onDatasetChange(id: string): Promise<void> {
    this.form.controls.datasetId.setValue(id);
    if (!id) {
      this.columns.set([]);
      this.savedFilters.set([]);
      this.selectedColumns.set([]);
      return;
    }
    try {
      const detail = await this.datasetsApi.detail(id);
      this.columns.set(detail.columns);
      this.selectedColumns.set(detail.columns.map((column) => column.columnKey));
      this.savedFilters.set(await this.filtersApi.list(id));
      if (!this.form.controls.title.value) this.form.controls.title.setValue(`${detail.dataset.name} report`);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load columns for this dataset.'));
    }
  }

  protected toggleColumn(key: string): void {
    const selected = this.selectedColumns();
    if (selected.includes(key)) {
      if (selected.length === 1) return;
      this.selectedColumns.set(selected.filter((item) => item !== key));
      return;
    }
    this.selectedColumns.set([...selected, key]);
  }

  protected async generate(): Promise<void> {
    if (this.form.invalid || !this.selectedColumns().length) {
      this.form.markAllAsTouched();
      this.toast.error('Add a title, dataset, and at least one column.');
      return;
    }
    this.submitting.set(true);
    try {
      const value = this.form.getRawValue();
      await this.reportsApi.create({
        title: value.title.trim(),
        datasetId: value.datasetId,
        format: this.format(),
        columns: this.selectedColumns(),
        savedFilterId: value.savedFilterId || null
      });
      this.toast.success('Report queued. It will be ready to download shortly.');
      await this.refreshLists();
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not queue the report.'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async download(report: ReportItem): Promise<void> {
    try {
      const blob = await this.reportsApi.download(report.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${report.title.replace(/[^a-z0-9-_]+/gi, '_')}.${report.format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      await this.refreshLists();
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not download the report.'));
    }
  }

  protected async remove(report: ReportItem): Promise<void> {
    const accepted = await this.confirm.ask({
      title: 'Delete report',
      message: `Delete “${report.title}” and its file?`,
      confirmLabel: 'Delete report'
    });
    if (!accepted) return;
    try {
      await this.reportsApi.remove(report.id);
      this.toast.success('Report deleted.');
      await this.refreshLists();
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not delete the report.'));
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.datasets.set((await this.datasetsApi.list()).filter((dataset) => dataset.status === 'ready'));
      await this.refreshLists();
      if (this.form.controls.datasetId.value) await this.onDatasetChange(this.form.controls.datasetId.value);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load reports.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshLists(): Promise<void> {
    const [reports, history] = await Promise.all([this.reportsApi.list(), this.reportsApi.history()]);
    this.reports.set(reports);
    this.history.set(history);
  }
}
