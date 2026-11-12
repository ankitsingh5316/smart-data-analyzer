import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import { ApiResponse, FilterCondition, SavedFilter } from '../../models/models';

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly http = inject(HttpClient);

  list(datasetId = ''): Promise<SavedFilter[]> {
    const params = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : '';
    return firstValueFrom(this.http.get<ApiResponse<SavedFilter[]>>(`${API_URL}/filters${params}`))
      .then((response) => response.data);
  }

  get(id: string): Promise<SavedFilter> {
    return firstValueFrom(this.http.get<ApiResponse<SavedFilter>>(`${API_URL}/filters/${id}`))
      .then((response) => response.data);
  }

  create(body: {
    datasetId: string;
    name: string;
    description?: string;
    logic: 'AND' | 'OR';
    conditions: FilterCondition[];
  }): Promise<SavedFilter> {
    return firstValueFrom(this.http.post<ApiResponse<SavedFilter>>(`${API_URL}/filters`, body))
      .then((response) => response.data);
  }

  update(id: string, body: { name: string; description?: string }): Promise<SavedFilter> {
    return firstValueFrom(this.http.put<ApiResponse<SavedFilter>>(`${API_URL}/filters/${id}`, body))
      .then((response) => response.data);
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<ApiResponse<unknown>>(`${API_URL}/filters/${id}`)).then(() => undefined);
  }
}
