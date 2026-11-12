import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import { AnalyticsData, ApiResponse } from '../../models/models';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  get(datasetId: string, selection: { numeric?: string; category?: string; date?: string } = {}): Promise<AnalyticsData> {
    let params = new HttpParams();
    if (selection.numeric) params = params.set('numeric', selection.numeric);
    if (selection.category) params = params.set('category', selection.category);
    if (selection.date) params = params.set('date', selection.date);
    return firstValueFrom(
      this.http.get<ApiResponse<AnalyticsData>>(`${API_URL}/datasets/${datasetId}/analytics`, { params })
    ).then((response) => response.data);
  }
}
