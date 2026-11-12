import { Component, inject } from '@angular/core';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toast-wrap" aria-live="polite">
      @for (toast of toasts.items(); track toast.id) {
        <div class="toast" [attr.data-tone]="toast.tone">
          <span>{{ toast.message }}</span>
          <button type="button" class="icon-button" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss notification">×</button>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
