import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IconComponent } from './icon';

@Component({
  selector: 'app-kpi-card',
  imports: [IconComponent, DecimalPipe],
  template: `
    <article class="kpi">
      <div class="kpi-top">
        <span>{{ label() }}</span>
        <app-icon [name]="icon()" [size]="16" />
      </div>
      <strong>{{ value() | number }}</strong>
      <p>{{ hint() }}</p>
    </article>
  `
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly hint = input('');
  readonly icon = input('chart');
}
