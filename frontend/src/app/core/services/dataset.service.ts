import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import {
  ApiResponse,
  Dataset,
  DatasetDetail,
  QueryRequest,
  RecordPage
} from '../../models/models';

@Injectable({ providedIn: 'root' })
export class DatasetService {
  private readonly http = inject(HttpClient);

  list(search = ''): Promise<Dataset[]> {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.get<Dataset[]>(`/datasets${params}`);
  }

  detail(id: string): Promise<DatasetDetail> {
    return this.get<DatasetDetail>(`/datasets/${id}`);
  }

  status(id: string): Promise<Dataset> {
    return this.get<Dataset>(`/datasets/${id}/status`);
  }

  rename(id: string, name: string): Promise<Dataset> {
    return firstValueFrom(
      this.http.patch<ApiResponse<Dataset>>(`${API_URL}/datasets/${id}`, { name })
    ).then((response) => response.data);
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<ApiResponse<unknown>>(`${API_URL}/datasets/${id}`)).then(() => undefined);
  }

  query(id: string, body: QueryRequest): Promise<RecordPage> {
    return firstValueFrom(
      this.http.post<ApiResponse<RecordPage>>(`${API_URL}/datasets/${id}/records/query`, body)
    ).then((response) => response.data);
  }

  exportFiltered(id: string, body: QueryRequest & { format: 'csv' | 'xlsx' | 'pdf'; columns?: string[] }): Promise<Blob> {
    return firstValueFrom(
      this.http.post(`${API_URL}/datasets/${id}/export`, body, { responseType: 'blob' })
    );
  }

  previewCount(id: string, body: QueryRequest): Promise<number> {
    return firstValueFrom(
      this.http.post<ApiResponse<{ total: number }>>(`${API_URL}/datasets/${id}/filters/preview`, body)
    ).then((response) => response.data.total);
  }

  uploadEvents(file: File): import('rxjs').Observable<HttpEvent<ApiResponse<Dataset>>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<Dataset>>(`${API_URL}/datasets/upload`, form, {
      reportProgress: true,
      observe: 'events'
    });
  }

  private get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<ApiResponse<T>>(`${API_URL}${path}`)).then((response) => response.data);
  }
}
