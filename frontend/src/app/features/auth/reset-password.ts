import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage } from '../../shared/api-error';
import { fieldMessage, PASSWORD_PATTERN, passwordsMatch } from '../../shared/forms';
import { AuthLayoutComponent } from './auth-layout';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  templateUrl: './reset-password.html'
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly email = signal('');
  protected readonly token = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required, passwordsMatch]]
  });

  ngOnInit(): void {
    this.email.set(this.route.snapshot.queryParamMap.get('email') || '');
    this.token.set(this.route.snapshot.queryParamMap.get('token') || '');
  }

  protected message(name: 'password' | 'confirmPassword'): string {
    return fieldMessage(this.form.controls[name], name === 'password' ? 'Password' : 'Confirmation');
  }

  protected async submit(): Promise<void> {
    this.form.controls.confirmPassword.updateValueAndValidity();
    if (this.form.invalid || !this.token() || !this.email()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.resetPassword(this.email(), this.token(), this.form.getRawValue().password);
      this.toast.success('Password updated. Sign in with the new password.');
      await this.router.navigate(['/login']);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'This reset link is invalid or has expired.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
