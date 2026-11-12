import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../config';
import { ApiResponse, AuthResult, ForgotResult, SignupOtpResult, User, UserPreferences } from '../../models/models';

const TOKEN_KEY = 'sda.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly user = signal<User | null>(null);

  isLoggedIn(): boolean {
    return Boolean(this.token());
  }

  async hydrate(): Promise<void> {
    if (!this.token()) return;
    try {
      await this.refresh();
    } catch {
      this.clearSession();
    }
  }

  async refresh(): Promise<User> {
    const response = await firstValueFrom(this.http.get<ApiResponse<User>>(`${API_URL}/auth/me`));
    this.user.set(response.data);
    return response.data;
  }

  async login(email: string, password: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<AuthResult>>(`${API_URL}/auth/login`, { email, password })
    );
    this.persist(response.data);
    return response.data.user;
  }

  requestSignupOtp(name: string, email: string, password: string): Promise<SignupOtpResult> {
    return firstValueFrom(
      this.http.post<ApiResponse<SignupOtpResult>>(`${API_URL}/auth/signup`, { name, email, password })
    ).then((response) => response.data);
  }

  async verifySignupOtp(email: string, otp: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<AuthResult>>(`${API_URL}/auth/signup/verify`, { email, otp })
    );
    this.persist(response.data);
    return response.data.user;
  }

  forgotPassword(email: string): Promise<ForgotResult> {
    return firstValueFrom(
      this.http.post<ApiResponse<ForgotResult>>(`${API_URL}/auth/forgot-password`, { email })
    ).then((response) => response.data);
  }

  resetPassword(email: string, token: string, password: string): Promise<void> {
    return firstValueFrom(
      this.http.post<ApiResponse<unknown>>(`${API_URL}/auth/reset-password`, { email, token, password })
    ).then(() => undefined);
  }

  async updateProfile(name: string, email: string): Promise<User> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<User>>(`${API_URL}/auth/profile`, { name, email })
    );
    this.user.set(response.data);
    return response.data;
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return firstValueFrom(
      this.http.put<ApiResponse<unknown>>(`${API_URL}/auth/password`, { currentPassword, newPassword })
    ).then(() => undefined);
  }

  async updatePreferences(preferences: UserPreferences): Promise<User> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<User>>(`${API_URL}/auth/preferences`, preferences)
    );
    this.user.set(response.data);
    return response.data;
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.user.set(null);
  }

  private persist(result: AuthResult): void {
    localStorage.setItem(TOKEN_KEY, result.token);
    this.token.set(result.token);
    this.user.set(result.user);
  }
}
