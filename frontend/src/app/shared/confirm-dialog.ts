import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../core/services/confirm.service';

@Component({
  selector: 'app-confirm',
  imports: [FormsModule],
  template: `
    @if (confirm.current(); as dialog) {
      <div class="confirm-layer" (click)="confirm.dismissFromBackdrop()">
        <form class="confirm-card" role="dialog" aria-modal="true" [attr.aria-label]="dialog.title" (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); confirm.answer(true)">
          @if (dialog.tone === 'danger') { <div class="confirm-kicker">Please confirm</div> }
          <h2 [class.danger]="dialog.tone === 'danger'">{{ dialog.title }}</h2>
          <p>{{ dialog.message }}</p>
          @for (field of dialog.fields; track field.key) {
            <label class="field">
              <span>{{ field.label }}</span>
              <input [ngModel]="confirm.fields()[field.key]" (ngModelChange)="confirm.setField(field.key, $event)" [name]="field.key" />
            </label>
          }
          <div class="confirm-actions">
            <button type="button" class="button secondary" (click)="confirm.answer(false)">Cancel</button>
            <button type="submit" class="button" [class.danger]="dialog.tone === 'danger'" [class.primary]="dialog.tone !== 'danger'">{{ dialog.confirmLabel }}</button>
          </div>
        </form>
      </div>
    }
  `
})
export class ConfirmDialogComponent {
  protected readonly confirm = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    if (this.confirm.current()) this.confirm.answer(false);
  }
}
