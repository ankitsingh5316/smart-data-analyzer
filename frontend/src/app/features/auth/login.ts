import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { applyServerErrors, formNotice } from '../../shared/api-error';
import { fieldMessage } from '../../shared/forms';
import { AuthLayoutComponent } from './auth-layout';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  templateUrl: './login.html'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly status = signal('');
  protected readonly statusTone = signal<'info' | 'error' | 'success'>('info');
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  protected message(name: 'email' | 'password'): string {
    return fieldMessage(this.form.controls[name], name === 'email' ? 'Email' : 'Password');
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set('Fix the fields marked wrong, then try again.');
      this.statusTone.set('error');
      return;
    }
    this.submitting.set(true);
    this.status.set('Signing in…');
    this.statusTone.set('info');
    try {
      const value = this.form.getRawValue();
      await this.auth.login(value.email, value.password);
      this.toast.success('Signed in.');
      await this.router.navigate(['/app/dashboard']);
    } catch (error) {
      applyServerErrors(this.form, error);
      this.status.set(formNotice(error, 'Could not sign in.'));
      this.statusTone.set('error');
    } finally {
      this.submitting.set(false);
    }
  }
}
