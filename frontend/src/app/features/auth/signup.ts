import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { applyServerErrors, formNotice } from '../../shared/api-error';
import { fieldMessage, PASSWORD_PATTERN, passwordsMatch } from '../../shared/forms';
import { AuthLayoutComponent } from './auth-layout';

type FieldName = 'name' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  templateUrl: './signup.html'
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly verifying = signal(false);
  protected readonly step = signal<'details' | 'otp'>('details');
  protected readonly status = signal('');
  protected readonly statusTone = signal<'info' | 'error' | 'success'>('info');
  protected readonly devOtp = signal('');
  protected readonly otp = signal('');
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
    confirmPassword: ['', [Validators.required, passwordsMatch]]
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.form.controls.password.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      this.form.controls.confirmPassword.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected feedback(name: FieldName): { tone: '' | 'ok' | 'bad'; text: string } {
    const control = this.form.controls[name];
    if (!control.dirty && !control.touched) return { tone: '', text: '' };
    if (control.valid) return { tone: 'ok', text: 'Looks good' };
    return { tone: 'bad', text: this.message(name) };
  }

  protected inputClass(name: FieldName): string {
    const tone = this.feedback(name).tone;
    return tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : '';
  }

  protected async submit(): Promise<void> {
    this.form.controls.confirmPassword.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.setStatus('Fix the fields marked wrong, then try again.', 'error');
      return;
    }
    this.submitting.set(true);
    this.setStatus('Checking your details and sending a code…', 'info');
    try {
      const value = this.form.getRawValue();
      const result = await this.auth.requestSignupOtp(value.name, value.email, value.password);
      this.devOtp.set(result.devOtp || '');
      this.otp.set(result.devOtp || '');
      this.step.set('otp');
      this.setStatus(
        result.delivered
          ? `Code sent to ${result.email}. It expires in ${result.expiresInMinutes} minutes.`
          : `Email delivery is not configured, so the code is shown below. It expires in ${result.expiresInMinutes} minutes.`,
        'success'
      );
    } catch (error) {
      applyServerErrors(this.form, error);
      this.setStatus(formNotice(error, 'Could not start signup.'), 'error');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async verify(): Promise<void> {
    const code = this.otp().trim();
    if (!/^\d{6}$/.test(code)) {
      this.setStatus('Enter the 6-digit code.', 'error');
      return;
    }
    this.verifying.set(true);
    this.setStatus('Checking the code…', 'info');
    try {
      await this.auth.verifySignupOtp(this.form.getRawValue().email, code);
      this.toast.success('Account created.');
      await this.router.navigate(['/app/dashboard']);
    } catch (error) {
      this.setStatus(formNotice(error, 'That code could not be verified.'), 'error');
    } finally {
      this.verifying.set(false);
    }
  }

  protected async resend(): Promise<void> {
    await this.submit();
  }

  protected editDetails(): void {
    this.step.set('details');
    this.setStatus('', 'info');
  }

  private message(name: FieldName): string {
    const labels = { name: 'Name', email: 'Email', password: 'Password', confirmPassword: 'Confirmation' };
    return fieldMessage(this.form.controls[name] as AbstractControl, labels[name]);
  }

  private setStatus(text: string, tone: 'info' | 'error' | 'success'): void {
    this.status.set(text);
    this.statusTone.set(tone);
  }
}
