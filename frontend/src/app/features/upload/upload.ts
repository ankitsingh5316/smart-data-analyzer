import { DecimalPipe } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DatasetService } from '../../core/services/dataset.service';
import { ToastService } from '../../core/services/toast.service';
import { Dataset, DatasetDetail } from '../../models/models';
import { apiErrorMessage } from '../../shared/api-error';
import { CellPipe, FileSizePipe } from '../../shared/pipes';
import { StatusPillComponent } from '../../shared/status-pill';

const MAX_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-upload',
  imports: [RouterLink, DecimalPipe, FileSizePipe, CellPipe, StatusPillComponent],
  templateUrl: './upload.html'
})
export class UploadComponent implements OnDestroy {
  private readonly datasetsApi = inject(DatasetService);
  private readonly toast = inject(ToastService);
  private uploadSub?: Subscription;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly dragOver = signal(false);
  protected readonly file = signal<File | null>(null);
  protected readonly progress = signal(0);
  protected readonly uploading = signal(false);
  protected readonly processing = signal(false);
  protected readonly error = signal('');
  protected readonly detail = signal<DatasetDetail | null>(null);

  ngOnDestroy(): void {
    this.uploadSub?.unsubscribe();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  protected onDrag(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.selectFile(file);
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.selectFile(file);
    input.value = '';
  }

  protected selectFile(file: File): void {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xlsx', 'xls'].includes(extension)) {
      this.error.set('Upload a CSV, XLSX, or XLS file.');
      this.file.set(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('File exceeds the 25 MB limit.');
      this.file.set(null);
      return;
    }
    if (!file.size) {
      this.error.set('The selected file is empty.');
      this.file.set(null);
      return;
    }
    this.error.set('');
    this.detail.set(null);
    this.progress.set(0);
    this.file.set(file);
  }

  protected startUpload(): void {
    const file = this.file();
    if (!file) return;
    this.uploading.set(true);
    this.processing.set(false);
    this.error.set('');
    this.detail.set(null);
    this.uploadSub = this.datasetsApi.uploadEvents(file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((event.loaded / event.total) * 100));
        }
        if (event.type === HttpEventType.Response) {
          this.progress.set(100);
          this.uploading.set(false);
          const dataset = event.body?.data;
          if (dataset) this.watch(dataset);
        }
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.processing.set(false);
        this.error.set(apiErrorMessage(error, 'Upload failed.'));
      }
    });
  }

  private watch(dataset: Dataset): void {
    this.processing.set(true);
    const check = async () => {
      try {
        const status = await this.datasetsApi.status(dataset.id);
        if (status.status === 'processing') return;
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
        this.processing.set(false);
        if (status.status === 'failed') {
          this.error.set(status.errorMessage || 'The file could not be imported.');
          return;
        }
        this.detail.set(await this.datasetsApi.detail(dataset.id));
        this.toast.success('Dataset imported.');
      } catch (error) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.processing.set(false);
        this.error.set(apiErrorMessage(error, 'Could not check import status.'));
      }
    };
    void check();
    this.pollTimer = setInterval(() => void check(), 1200);
  }
}
