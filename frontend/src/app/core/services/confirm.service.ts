import { Injectable, signal } from '@angular/core';

export interface DialogField {
  key: string;
  label: string;
  value: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  mode: 'confirm' | 'edit';
  tone: 'default' | 'danger';
  fields: DialogField[];
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);
  readonly fields = signal<Record<string, string>>({});
  private resolver: ((value: boolean | Record<string, string> | null) => void) | null = null;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  ask(options: { title: string; message: string; confirmLabel?: string; tone?: 'default' | 'danger' }): Promise<boolean> {
    return this.open({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      mode: 'confirm',
      tone: options.tone ?? 'danger',
      fields: []
    }) as Promise<boolean>;
  }

  edit(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    fields: DialogField[];
  }): Promise<Record<string, string> | null> {
    return this.open({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Save',
      mode: 'edit',
      tone: 'default',
      fields: options.fields
    }) as Promise<Record<string, string> | null>;
  }

  setField(key: string, value: string): void {
    this.fields.update((current) => ({ ...current, [key]: value }));
  }

  dismissFromBackdrop(): void {
    if (!this.ready) return;
    this.answer(false);
  }

  answer(accepted: boolean): void {
    const dialog = this.current();
    const resolve = this.resolver;
    this.current.set(null);
    this.resolver = null;
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    if (!resolve || !dialog) return;
    if (!accepted) {
      resolve(dialog.mode === 'edit' ? null : false);
      return;
    }
    resolve(dialog.mode === 'edit' ? { ...this.fields() } : true);
  }

  private open(dialog: ConfirmRequest): Promise<boolean | Record<string, string> | null> {
    const previous = this.resolver;
    const previousDialog = this.current();
    this.resolver = null;
    this.current.set(null);
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    if (previous && previousDialog) previous(previousDialog.mode === 'edit' ? null : false);
    this.fields.set(Object.fromEntries(dialog.fields.map((field) => [field.key, field.value])));
    this.current.set(dialog);
    this.timer = setTimeout(() => {
      this.ready = true;
    }, 250);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }
}
