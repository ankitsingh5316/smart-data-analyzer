import { Component, input } from '@angular/core';
import { IconComponent } from './icon';

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  template: `
    <div class="empty-state">
      <div class="empty-icon"><app-icon [name]="icon()" [size]="22" /></div>
      <h3>{{ title() }}</h3>
      <p>{{ message() }}</p>
      <ng-content />
    </div>
  `
})
export class EmptyStateComponent {
  readonly icon = input('file');
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}
