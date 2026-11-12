import { AbstractControl, ValidationErrors } from '@angular/forms';

export function fieldMessage(control: AbstractControl | null, label = 'This field'): string {
  if (!control || (!control.touched && !control.dirty) || !control.errors) return '';
  const errors: ValidationErrors = control.errors;
  if (errors['server']) return String(errors['server']);
  if (errors['required']) return `${label} is required.`;
  if (errors['email']) return 'Enter a valid email address.';
  if (errors['minlength']) return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
  if (errors['mismatch']) return 'Passwords do not match.';
  if (errors['pattern']) return 'Use at least 8 characters with a letter and a number.';
  return `Check ${label.toLowerCase()}.`;
}

export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const parent = control.parent;
  if (!parent) return null;
  return control.value === parent.get('password')?.value ? null : { mismatch: true };
}
