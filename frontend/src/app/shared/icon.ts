import { Component, computed, input } from '@angular/core';
import { ICONS } from './icons';

@Component({
  selector: 'app-icon',
  template: `
    <svg
      [attr.viewBox]="'0 0 24 24'"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `:host { display: inline-flex; line-height: 0; }`
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(18);
  readonly path = computed(() => ICONS[this.name()] || ICONS['alert']);
}
