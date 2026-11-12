import { Component, computed, input } from '@angular/core';

const LABELS: Record<string, string> = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  queued: 'Queued',
  completed: 'Completed',
  downloaded: 'Downloaded'
};

@Component({
  selector: 'app-status-pill',
  template: `<span class="status-pill" [attr.data-status]="status()">{{ text() }}</span>`
})
export class StatusPillComponent {
  readonly status = input.required<string>();
  readonly text = computed(() => LABELS[this.status()] || this.status());
}
