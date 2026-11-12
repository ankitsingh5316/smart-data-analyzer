import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import { ApiResponse, FilterPayload, HistoryItem, ReportFormat, ReportItem } from '../../models/models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  list(): Promise<ReportItem[]> {
    return firstValueFrom(this.http.get<ApiResponse<ReportItem[]>>(`${API_URL}/reports`))
      .then((response) => response.data);
  }

  history(): Promise<HistoryItem[]> {
    return firstValueFrom(this.http.get<ApiResponse<HistoryItem[]>>(`${API_URL}/reports/history`))
      .then((response) => response.data);
  }

  create(body: {
    title: string;
    datasetId: string;
    format: ReportFormat;
    columns: string[];
    savedFilterId?: string | null;
    filter?: FilterPayload | null;
  }): Promise<ReportItem> {
    return firstValueFrom(this.http.post<ApiResponse<ReportItem>>(`${API_URL}/reports`, body))
      .then((response) => response.data);
  }

  get(id: string): Promise<{ report: ReportItem; history: HistoryItem[] }> {
    return firstValueFrom(
      this.http.get<ApiResponse<{ report: ReportItem; history: HistoryItem[] }>>(`${API_URL}/reports/${id}`)
    ).then((response) => response.data);
  }

  download(id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${API_URL}/reports/${id}/download`, { responseType: 'blob' }));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<ApiResponse<unknown>>(`${API_URL}/reports/${id}`)).then(() => undefined);
  }
}
