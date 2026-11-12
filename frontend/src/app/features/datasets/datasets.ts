import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatasetService } from '../../core/services/dataset.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Dataset } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { EmptyStateComponent } from '../../shared/empty-state';
import { FileSizePipe } from '../../shared/pipes';
import { StatusPillComponent } from '../../shared/status-pill';

@Component({
  selector: 'app-datasets',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, EmptyStateComponent, FileSizePipe, StatusPillComponent],
  templateUrl: './datasets.html'
})
export class DatasetsComponent implements OnInit {
  private readonly datasetsApi = inject(DatasetService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly datasets = signal<Dataset[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.datasets.set(await this.datasetsApi.list(this.search()));
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load datasets.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async rename(dataset: Dataset): Promise<void> {
    const result = await this.confirm.edit({
      title: 'Rename dataset',
      message: 'The new name is shown in the app. The original file name stays unchanged.',
      confirmLabel: 'Save name',
      fields: [{ key: 'name', label: 'Name', value: dataset.name }]
    });
    const name = (result?.['name'] || '').trim();
    if (!result) return;
    if (!name) {
      this.toast.error('Dataset name is required.');
      return;
    }
    try {
      const updated = await this.datasetsApi.rename(dataset.id, name);
      this.datasets.update((items) => items.map((item) => item.id === updated.id ? updated : item));
      this.toast.success('Dataset renamed.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not rename the dataset.'));
    }
  }

  protected async remove(dataset: Dataset): Promise<void> {
    const accepted = await this.confirm.ask({
      title: 'Delete dataset',
      message: `Delete “${dataset.name}” and its imported rows? Saved filters for this dataset will also be removed. Existing report files stay available.`,
      confirmLabel: 'Delete dataset'
    });
    if (!accepted) return;
    try {
      await this.datasetsApi.remove(dataset.id);
      this.datasets.update((items) => items.filter((item) => item.id !== dataset.id));
      this.toast.success('Dataset deleted.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not delete the dataset.'));
    }
  }
}
