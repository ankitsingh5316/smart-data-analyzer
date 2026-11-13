import { HttpErrorResponse } from '@angular/common/http';
import { FormGroup } from '@angular/forms';
import { FieldError } from '../models/models';

export function formNotice(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error as { message?: string } | string | null;
    const hasMessage = Boolean(payload && typeof payload === 'object' && payload.message);
    if (!hasMessage && (error.status === 0 || error.status >= 500)) {
      return 'The server did not respond, so no verification code was created. Wait a moment and try again.';
    }
  }
  return apiErrorMessage(error, fallback);
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error as { message?: string; errors?: FieldError[] } | null;
    if (payload?.errors?.length) {
      return payload.errors.map((item) => item.message).join(' ');
    }
    if (payload?.message) return payload.message;
    if (error.status === 0) return 'The API is unreachable. Start the backend and try again.';
  }
  return fallback;
}

export function applyServerErrors(form: FormGroup, error: unknown): void {
  if (!(error instanceof HttpErrorResponse)) return;
  const payload = error.error as { errors?: FieldError[] } | null;
  payload?.errors?.forEach((item) => {
    const control = form.get(item.field);
    control?.setErrors({ server: item.message });
    control?.markAsTouched();
  });
}
