import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { apiErrorMessage, applyServerErrors } from '../../shared/api-error';
import { fieldMessage, PASSWORD_PATTERN } from '../../shared/forms';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './settings.html'
})
export class SettingsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly user = this.auth.user;
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly savingPreferences = signal(false);
  protected readonly profileForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });
  protected readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]]
  });
  protected readonly preferenceForm = this.formBuilder.nonNullable.group({
    defaultPageSize: [25, Validators.required],
    trimWhitespace: [true],
    treatEmptyAsNull: [true]
  });

  ngOnInit(): void {
    void this.load();
  }

  protected profileMessage(name: 'name' | 'email'): string {
    return fieldMessage(this.profileForm.controls[name], name === 'name' ? 'Name' : 'Email');
  }

  protected passwordMessage(name: 'currentPassword' | 'newPassword'): string {
    return fieldMessage(this.passwordForm.controls[name], name === 'currentPassword' ? 'Current password' : 'New password');
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.savingProfile.set(true);
    try {
      const value = this.profileForm.getRawValue();
      await this.auth.updateProfile(value.name, value.email);
      this.toast.success('Profile updated.');
    } catch (error) {
      applyServerErrors(this.profileForm, error);
      this.toast.error(apiErrorMessage(error, 'Could not update the profile.'));
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async savePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    try {
      const value = this.passwordForm.getRawValue();
      await this.auth.changePassword(value.currentPassword, value.newPassword);
      this.passwordForm.reset();
      this.toast.success('Password updated.');
    } catch (error) {
      applyServerErrors(this.passwordForm, error);
      this.toast.error(apiErrorMessage(error, 'Could not change the password.'));
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async savePreferences(): Promise<void> {
    this.savingPreferences.set(true);
    try {
      const value = this.preferenceForm.getRawValue();
      await this.auth.updatePreferences({
        defaultPageSize: value.defaultPageSize as 10 | 25 | 50 | 100,
        trimWhitespace: value.trimWhitespace,
        treatEmptyAsNull: value.treatEmptyAsNull
      });
      this.toast.success('Dataset preferences saved. They apply to the next import.');
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not save preferences.'));
    } finally {
      this.savingPreferences.set(false);
    }
  }

  protected logout(): void {
    this.auth.clearSession();
    void this.router.navigate(['/login']);
  }

  private async load(): Promise<void> {
    try {
      const user = await this.auth.refresh();
      this.profileForm.patchValue({ name: user.name, email: user.email });
      this.preferenceForm.patchValue(user.preferences);
    } catch (error) {
      this.toast.error(apiErrorMessage(error, 'Could not load account settings.'));
    }
  }
}
