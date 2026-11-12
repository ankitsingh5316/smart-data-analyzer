import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { DatasetService } from '../../core/services/dataset.service';
import { FilterService } from '../../core/services/filter.service';
import { ToastService } from '../../core/services/toast.service';
import { DataRecord, Dataset, DatasetColumn, FilterCondition, QueryRequest, SavedFilter } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { CellPipe } from '../../shared/pipes';
import { EmptyStateComponent } from '../../shared/empty-state';
import { FILTER_OPERATORS, operatorKind } from '../../shared/operators';

interface DraftCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
  from: string;
  to: string;
}

@Component({
  selector: 'app-filters',
  imports: [DecimalPipe, FormsModule, CellPipe, EmptyStateComponent],
  templateUrl: './filters.html'
})
export class FiltersComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly datasetsApi = inject(DatasetService);
  private readonly filtersApi = inject(FilterService);
  private readonly toast = inject(ToastService);
  private subscription?: Subscription;
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly operators = FILTER_OPERATORS;
  protected readonly loading = signal(true);
  protected readonly datasets = signal<Dataset[]>([]);
  protected readonly saved = signal<SavedFilter[]>([]);
  protected readonly columns = signal<DatasetColumn[]>([]);
  protected readonly datasetId = signal('');
  protected readonly logic = signal<'AND' | 'OR'>('AND');
  protected readonly conditions = signal<DraftCondition[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly totalPages = signal(0);
  protected readonly querying = signal(false);
  protected readonly downloading = signal<'csv' | 'xlsx' | 'pdf' | ''>('');
  protected readonly searched = signal(false);
  protected readonly columnFilters = signal<Record<string, string>>({});
  protected readonly datasetName = signal('filtered-data');
  protected readonly exportColumns = signal<string[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly rows = signal<DataRecord[]>([]);
  protected readonly filterName = signal('');
  protected readonly description = signal('');
  protected readonly selectedSaved = signal('');

  ngOnInit(): void {
    void this.bootstrap();
    this.subscription = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(() => {
      void this.onRoute();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }

  protected async chooseDataset(id: string): Promise<void> {
    if (!id) return;
    await this.router.navigate(['/app/filters', id]);
  }

  protected addCondition(): void {
    const column = this.columns()[0]?.columnKey || '';
    this.conditions.update((items) => [...items, this.blank(column)]);
    this.scheduleCount();
  }

  protected updateCondition(id: string, patch: Partial<DraftCondition>): void {
    this.conditions.update((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    this.scheduleCount();
  }

  protected removeCondition(id: string): void {
    this.conditions.update((items) => items.filter((item) => item.id !== id));
    this.scheduleCount();
  }

  protected scheduleCount(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(false), 450);
  }

  protected clearAll(): void {
    this.conditions.set([]);
    this.columnFilters.set({});
    this.page.set(1);
    this.total.set(null);
    this.totalPages.set(0);
    this.rows.set([]);
    this.searched.set(false);
    this.selectedSaved.set('');
  }

  protected columnValue(key: string): string {
    return this.columnFilters()[key] || '';
  }

  protected setColumnFilter(key: string, value: string): void {
    this.columnFilters.update((current) => ({ ...current, [key]: value }));
    this.page.set(1);
    this.scheduleCount();
  }

  protected visibleColumns(): DatasetColumn[] {
    const selected = new Set(this.exportColumns());
    return this.columns().filter((column) => selected.has(column.columnKey));
  }

  protected toggleExportColumn(key: string): void {
    const selected = this.exportColumns();
    if (selected.includes(key)) {
      if (selected.length === 1) return;
      this.exportColumns.set(selected.filter((item) => item !== key));
      return;
    }
    this.exportColumns.set([...selected, key]);
  }

  protected useAllColumns(): void {
    this.exportColumns.set(this.columns().map((column) => column.columnKey));
  }

  protected filledColumnCount(): number {
    return Object.values(this.columnFilters()).filter((value) => value.trim()).length;
  }

  protected kind(operator: string): string {
    return operatorKind(operator);
  }

  protected inputType(condition: DraftCondition): string {
    const column = this.columns().find((item) => item.columnKey === condition.column);
    if (['contains', 'not_contains', 'starts_with', 'ends_with'].includes(condition.operator)) return 'text';
    if (condition.operator === 'date_range' || column?.dataType === 'date') return 'date';
    if (column?.dataType === 'number') return 'number';
    return 'text';
  }

  protected async useSaved(id: string): Promise<void> {
    this.selectedSaved.set(id);
    if (!id) return;
    const filter = this.saved().find((item) => item.id === id);
    if (!filter) return;
    this.logic.set(filter.logic);
    this.filterName.set(filter.name);
    this.description.set(filter.description || '');
    this.columnFilters.set({});
    this.page.set(1);
    this.conditions.set(filter.conditions.map((condition) => this.fromSaved(condition)));
    await this.run();
  }

  protected async run(notify = true): Promise<void> {
    const id = this.datasetId();
    if (!id) return;
    const body = this.buildRequest(notify);
    if (!body) {
      if (!notify) {
        this.rows.set([]);
        this.total.set(null);
        this.totalPages.set(0);
        this.searched.set(false);
      }
      return;
    }
    this.querying.set(true);
    try {
      const page = await this.datasetsApi.query(id, body);
      this.total.set(page.total);
      this.totalPages.set(page.totalPages);
      this.rows.set(page.items);
      this.page.set(page.page);
      this.searched.set(true);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not run this filter.'));
    } finally {
      this.querying.set(false);
    }
  }

  protected async goTo(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    await this.run(false);
  }

  protected async download(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    const id = this.datasetId();
    const body = this.buildRequest(true);
    if (!id || !body || !this.total() || !this.exportColumns().length) return;
    this.downloading.set(format);
    try {
      const blob = await this.datasetsApi.exportFiltered(id, { ...body, format, columns: this.exportColumns() });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.fileBase()}-filtered.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.toast.error(await this.downloadError(error));
    } finally {
      this.downloading.set('');
    }
  }

  protected async save(): Promise<void> {
    const request = this.buildRequest(true);
    if (!request) return;
    const conditions = [...this.columnConditions(), ...(request.conditions || [])];
    if (!conditions.length) {
      this.toast.error('Enter at least one column, such as ID, name, or city.');
      return;
    }
    if (!this.filterName().trim()) {
      this.toast.error('Name this filter before saving it.');
      return;
    }
    try {
      const created = await this.filtersApi.create({
        datasetId: this.datasetId(),
        name: this.filterName().trim(),
        description: this.description().trim(),
        logic: this.logic(),
        conditions,
      });
      this.saved.update((items) => [created, ...items]);
      this.selectedSaved.set(created.id);
      this.toast.success('Filter saved.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not save this filter.'));
    }
  }

  protected openExplorer(): void {
    const request = this.buildRequest();
    if (!request) return;
    const conditions = [...this.columnConditions(), ...(request.conditions || [])];
    void this.router.navigate(['/app/explorer', this.datasetId()], {
      state: { filter: { logic: this.logic(), conditions } }
    });
  }

  private blank(column: string): DraftCondition {
    return { id: crypto.randomUUID(), column, operator: 'eq', value: '', from: '', to: '' };
  }

  private fromSaved(condition: FilterCondition): DraftCondition {
    const value = condition.value;
    const range = value && typeof value === 'object' ? value as { from?: unknown; to?: unknown } : null;
    return {
      id: crypto.randomUUID(),
      column: condition.column,
      operator: condition.operator,
      value: range ? '' : value === undefined || value === null ? '' : String(value),
      from: range ? String(range.from ?? '') : '',
      to: range ? String(range.to ?? '') : ''
    };
  }

  private buildRequest(notify = true): QueryRequest | null {
    const conditions = this.completeConditions(notify);
    if (!conditions) return null;
    const columnSearch = this.activeColumnSearch();
    if (!conditions.length && !columnSearch) {
      if (notify) this.toast.error('Enter at least one column, such as ID, name, or city.');
      return null;
    }
    return {
      logic: this.logic(),
      conditions,
      columnSearch,
      page: this.page(),
      pageSize: this.pageSize
    };
  }

  private columnConditions(): FilterCondition[] {
    const search = this.activeColumnSearch();
    if (!search) return [];
    return Object.entries(search).map(([column, value]) => ({ column, operator: 'contains', value }));
  }

  private activeColumnSearch(): Record<string, string> | undefined {
    const entries = Object.entries(this.columnFilters()).filter(([, value]) => value.trim());
    if (!entries.length) return undefined;
    return Object.fromEntries(entries.map(([key, value]) => [key, value.trim()]));
  }

  private completeConditions(notify: boolean): FilterCondition[] | null {
    const payload: FilterCondition[] = [];
    for (const condition of this.conditions()) {
      const kind = operatorKind(condition.operator);
      if (!condition.column) {
        if (notify) this.toast.error('Choose a column for every extra condition.');
        return null;
      }
      if (kind === 'none') {
        payload.push({ column: condition.column, operator: condition.operator });
      } else if (kind === 'range') {
        if (!condition.from && !condition.to) continue;
        if (!condition.from || !condition.to) {
          if (notify) this.toast.error('Enter both values for range filters.');
          return null;
        }
        payload.push({ column: condition.column, operator: condition.operator, value: { from: condition.from, to: condition.to } });
      } else if (condition.value.trim()) {
        payload.push({ column: condition.column, operator: condition.operator, value: condition.value.trim() });
      }
    }
    return payload;
  }

  private fileBase(): string {
    return this.datasetName().replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'filtered-data';
  }

  private async downloadError(error: unknown): Promise<string> {
    if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
      try {
        const payload = JSON.parse(await error.error.text()) as { message?: string };
        if (payload.message) return payload.message;
      } catch {
        return 'Could not download the filtered rows.';
      }
    }
    return apiErrorMessage(error, 'Could not download the filtered rows.');
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
    this.clearAll();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const detail = await this.datasetsApi.detail(id);
      this.columns.set(detail.columns);
      this.datasetName.set(detail.dataset.name);
      this.exportColumns.set(detail.columns.map((column) => column.columnKey));
      this.saved.set(await this.filtersApi.list(id));
      const savedId = this.route.snapshot.queryParamMap.get('saved');
      if (savedId) await this.useSaved(savedId);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not open filters for this dataset.'));
    } finally {
      this.loading.set(false);
    }
  }
}
