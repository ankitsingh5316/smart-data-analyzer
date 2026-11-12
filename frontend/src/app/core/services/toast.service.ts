import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(id: string): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  private show(message: string, tone: Toast['tone']): void {
    const id = crypto.randomUUID();
    this.items.update((items) => [...items, { id, message, tone }].slice(-4));
    setTimeout(() => this.dismiss(id), 4600);
  }
}
