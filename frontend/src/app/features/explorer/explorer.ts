import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DatasetService } from '../../core/services/dataset.service';
import { FilterService } from '../../core/services/filter.service';
import { ToastService } from '../../core/services/toast.service';
import { DataRecord, Dataset, DatasetColumn, FilterPayload } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { CellPipe } from '../../shared/pipes';
import { EmptyStateComponent } from '../../shared/empty-state';

@Component({
  selector: 'app-explorer',
  imports: [DecimalPipe, FormsModule, RouterLink, CellPipe, EmptyStateComponent],
  templateUrl: './explorer.html'
})
export class ExplorerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly datasetsApi = inject(DatasetService);
  private readonly filtersApi = inject(FilterService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private subscription?: Subscription;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loading = signal(true);
  protected readonly querying = signal(false);
  protected readonly datasets = signal<Dataset[]>([]);
  protected readonly datasetId = signal('');
  protected readonly columns = signal<DatasetColumn[]>([]);
  protected readonly hidden = signal<string[]>([]);
  protected readonly rows = signal<DataRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal<number>(this.auth.user()?.preferences.defaultPageSize || 25);
  protected readonly sortBy = signal('row_index');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly search = signal('');
  protected readonly columnSearch = signal<Record<string, string>>({});
  protected readonly pickerOpen = signal(false);
  protected readonly activeFilter = signal<FilterPayload | null>(null);
  protected readonly activeFilterName = signal('');
  protected readonly pageSizes = [10, 25, 50, 100];

  ngOnInit(): void {
    void this.bootstrap();
    this.subscription = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(() => {
      void this.onRouteChange();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected visibleColumns(): DatasetColumn[] {
    return this.columns().filter((column) => !this.hidden().includes(column.columnKey));
  }

  protected rangeStart(): number {
    if (!this.total()) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  }

  protected rangeEnd(): number {
    return Math.min(this.page() * this.pageSize(), this.total());
  }

  protected async chooseDataset(id: string): Promise<void> {
    if (!id) return;
    await this.router.navigate(['/app/explorer', id]);
  }

  protected scheduleSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.loadRows();
    }, 300);
  }

  protected setColumnSearch(key: string, value: string): void {
    this.columnSearch.update((current) => ({ ...current, [key]: value }));
    this.scheduleSearch();
  }

  protected toggleColumn(key: string): void {
    const hidden = this.hidden();
    if (hidden.includes(key)) {
      this.hidden.set(hidden.filter((item) => item !== key));
      return;
    }
    if (this.columns().length - hidden.length <= 1) return;
    this.hidden.set([...hidden, key]);
  }

  protected sort(key: string): void {
    if (this.sortBy() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(key);
      this.sortDir.set('asc');
    }
    void this.loadRows();
  }

  protected changePageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.page.set(1);
    void this.loadRows();
  }

  protected goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    void this.loadRows();
  }

  protected totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  protected clearSearch(): void {
    this.search.set('');
    this.columnSearch.set({});
    this.activeFilter.set(null);
    this.activeFilterName.set('');
    this.page.set(1);
    void this.loadRows();
  }

  private async bootstrap(): Promise<void> {
    try {
      const ready = (await this.datasetsApi.list()).filter((dataset) => dataset.status === 'ready');
      this.datasets.set(ready);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load datasets.'));
    }
  }

  private async onRouteChange(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('datasetId') || '';
    this.datasetId.set(id);
    this.page.set(1);
    this.hidden.set([]);
    const incoming = this.readNavigationState();
    this.columnSearch.set(incoming.columnSearch);
    this.activeFilter.set(incoming.filter);
    if (!id) {
      this.columns.set([]);
      this.rows.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const detail = await this.datasetsApi.detail(id);
      if (detail.dataset.status !== 'ready') {
        this.toast.error(detail.dataset.errorMessage || 'This dataset is not ready to explore.');
      }
      this.columns.set(detail.columns);
      const filterId = this.route.snapshot.queryParamMap.get('filterId');
      if (filterId) {
        const saved = await this.filtersApi.get(filterId);
        this.activeFilter.set({ logic: saved.logic, conditions: saved.conditions });
        this.activeFilterName.set(saved.name);
      }
      await this.loadRows();
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not open this dataset.'));
    } finally {
      this.loading.set(false);
    }
  }

  private readNavigationState(): { filter: FilterPayload | null; columnSearch: Record<string, string> } {
    const state = history.state as { filter?: FilterPayload | null; columnSearch?: Record<string, string> } | null;
    const columnSearch = state?.columnSearch && typeof state.columnSearch === 'object' ? state.columnSearch : {};
    if (state?.filter?.conditions?.length) return { filter: state.filter, columnSearch };
    this.activeFilterName.set('');
    return { filter: null, columnSearch };
  }

  private async loadRows(): Promise<void> {
    const id = this.datasetId();
    if (!id) return;
    this.querying.set(true);
    try {
      const page = await this.datasetsApi.query(id, {
        page: this.page(),
        pageSize: this.pageSize(),
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        search: this.search(),
        columnSearch: this.columnSearch(),
        filter: this.activeFilter()
      });
      this.rows.set(page.items);
      this.total.set(page.total);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load records.'));
    } finally {
      this.querying.set(false);
    }
  }
}
