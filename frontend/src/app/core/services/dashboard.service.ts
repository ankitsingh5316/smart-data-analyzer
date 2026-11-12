import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import { ApiResponse, DashboardData, NotificationItem } from '../../models/models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  summary(): Promise<DashboardData> {
    return firstValueFrom(this.http.get<ApiResponse<DashboardData>>(`${API_URL}/dashboard`))
      .then((response) => response.data);
  }

  notifications(): Promise<NotificationItem[]> {
    return firstValueFrom(this.http.get<ApiResponse<NotificationItem[]>>(`${API_URL}/notifications`))
      .then((response) => response.data);
  }
}
