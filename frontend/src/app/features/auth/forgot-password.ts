import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../shared/api-error';
import { fieldMessage } from '../../shared/forms';
import { AuthLayoutComponent } from './auth-layout';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  templateUrl: './forgot-password.html'
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly resetUrl = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  protected emailMessage(): string {
    return fieldMessage(this.form.controls.email, 'Email');
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    try {
      const result = await this.auth.forgotPassword(this.form.getRawValue().email);
      this.sent.set(true);
      this.resetUrl.set(result.resetUrl || '');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not start the password reset.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
