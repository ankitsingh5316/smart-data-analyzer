import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DashboardService } from '../services/dashboard.service';
import { IconComponent } from '../../shared/icon';
import { StatusPillComponent } from '../../shared/status-pill';
import { NotificationItem } from '../../models/models';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  exact: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, StatusPillComponent],
  templateUrl: './shell.html'
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private subscription?: Subscription;
  private readonly seenKey = 'sda.seen-notes';

  protected readonly navOpen = signal(false);
  protected readonly profileOpen = signal(false);
  protected readonly notesOpen = signal(false);
  protected readonly title = signal('Dashboard');
  protected readonly notifications = signal<NotificationItem[]>([]);
  protected readonly seen = signal<string[]>(this.readSeen());
  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => {
    const name = this.user()?.name || 'User';
    return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  });
  protected readonly unseen = computed(() => this.notifications().filter((item) => !this.seen().includes(item.id)).length);
  protected readonly nav: NavItem[] = [
    { label: 'Dashboard', path: '/app/dashboard', icon: 'dashboard', exact: true },
    { label: 'Data Management', path: '/app/datasets', icon: 'database', exact: true },
    { label: 'Upload Data', path: '/app/upload', icon: 'upload', exact: true },
    { label: 'Data Explorer', path: '/app/explorer', icon: 'table', exact: false },
    { label: 'Advanced Filters', path: '/app/filters', icon: 'filter', exact: false },
    { label: 'Analytics', path: '/app/analytics', icon: 'chart', exact: false },
    { label: 'Reports', path: '/app/reports', icon: 'file', exact: true },
    { label: 'Saved Filters', path: '/app/saved-filters', icon: 'bookmark', exact: true },
    { label: 'Settings', path: '/app/settings', icon: 'settings', exact: true }
  ];

  ngOnInit(): void {
    this.subscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.title.set(this.currentTitle());
      this.navOpen.set(false);
      this.profileOpen.set(false);
      this.notesOpen.set(false);
    });
    this.title.set(this.currentTitle());
    void this.loadNotes();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  protected async toggleNotes(): Promise<void> {
    const next = !this.notesOpen();
    this.profileOpen.set(false);
    this.notesOpen.set(next);
    if (next) await this.loadNotes();
  }

  protected toggleProfile(): void {
    this.notesOpen.set(false);
    this.profileOpen.update((open) => !open);
  }

  protected closeMenus(): void {
    this.profileOpen.set(false);
    this.notesOpen.set(false);
  }

  protected markSeen(item: NotificationItem): void {
    this.remember([...this.seen(), item.id]);
    this.notesOpen.set(false);
  }

  protected dismissAll(): void {
    this.remember(this.notifications().map((item) => item.id));
  }

  protected logout(): void {
    this.auth.clearSession();
    void this.router.navigate(['/login']);
  }

  private async loadNotes(): Promise<void> {
    try {
      this.notifications.set(await this.dashboard.notifications());
    } catch {
      this.notifications.set([]);
    }
  }

  private currentTitle(): string {
    let route = this.router.routerState.snapshot.root;
    let title = 'Dashboard';
    while (route.firstChild) {
      route = route.firstChild;
      const next = route.data['title'];
      if (typeof next === 'string') title = next;
    }
    return title;
  }

  private readSeen(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.seenKey) || '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private remember(ids: string[]): void {
    const unique = Array.from(new Set(ids));
    this.seen.set(unique);
    localStorage.setItem(this.seenKey, JSON.stringify(unique));
  }
}
