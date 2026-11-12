import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FilterService } from '../../core/services/filter.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { SavedFilter } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { EmptyStateComponent } from '../../shared/empty-state';

@Component({
  selector: 'app-saved-filters',
  imports: [DatePipe, RouterLink, EmptyStateComponent],
  templateUrl: './saved-filters.html'
})
export class SavedFiltersComponent implements OnInit {
  private readonly filtersApi = inject(FilterService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly filters = signal<SavedFilter[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  protected apply(filter: SavedFilter): void {
    void this.router.navigate(['/app/filters', filter.datasetId], { queryParams: { saved: filter.id } });
  }

  protected async edit(filter: SavedFilter): Promise<void> {
    const result = await this.confirm.edit({
      title: 'Edit saved filter',
      message: 'Update the name or description. The filter conditions stay the same.',
      confirmLabel: 'Save changes',
      fields: [
        { key: 'name', label: 'Name', value: filter.name },
        { key: 'description', label: 'Description', value: filter.description || '' }
      ]
    });
    const name = (result?.['name'] || '').trim();
    if (!result || !name) {
      if (result && !name) this.toast.error('Filter name is required.');
      return;
    }
    try {
      const updated = await this.filtersApi.update(filter.id, {
        name,
        description: (result['description'] || '').trim()
      });
      this.filters.update((items) => items.map((item) => item.id === updated.id ? updated : item));
      this.toast.success('Filter updated.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not update the filter.'));
    }
  }

  protected async remove(filter: SavedFilter): Promise<void> {
    const accepted = await this.confirm.ask({
      title: 'Delete saved filter',
      message: `Delete “${filter.name}”? Reports already generated keep their own copy of the conditions.`,
      confirmLabel: 'Delete filter'
    });
    if (!accepted) return;
    try {
      await this.filtersApi.remove(filter.id);
      this.filters.update((items) => items.filter((item) => item.id !== filter.id));
      this.toast.success('Filter deleted.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not delete the filter.'));
    }
  }

  private async load(): Promise<void> {
    try {
      this.filters.set(await this.filtersApi.list());
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load saved filters.'));
    } finally {
      this.loading.set(false);
    }
  }
}
