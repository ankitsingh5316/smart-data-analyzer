import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/dashboard' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((module) => module.LoginComponent)
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup').then((module) => module.SignupComponent)
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password').then((module) => module.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/reset-password').then((module) => module.ResetPasswordComponent)
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell').then((module) => module.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', data: { title: 'Dashboard' }, loadComponent: () => import('./features/dashboard/dashboard').then((module) => module.DashboardComponent) },
      { path: 'datasets', data: { title: 'Data Management' }, loadComponent: () => import('./features/datasets/datasets').then((module) => module.DatasetsComponent) },
      { path: 'upload', data: { title: 'Upload Data' }, loadComponent: () => import('./features/upload/upload').then((module) => module.UploadComponent) },
      { path: 'explorer', data: { title: 'Data Explorer' }, loadComponent: () => import('./features/explorer/explorer').then((module) => module.ExplorerComponent) },
      { path: 'explorer/:datasetId', data: { title: 'Data Explorer' }, loadComponent: () => import('./features/explorer/explorer').then((module) => module.ExplorerComponent) },
      { path: 'filters', data: { title: 'Advanced Filters' }, loadComponent: () => import('./features/filters/filters').then((module) => module.FiltersComponent) },
      { path: 'filters/:datasetId', data: { title: 'Advanced Filters' }, loadComponent: () => import('./features/filters/filters').then((module) => module.FiltersComponent) },
      { path: 'analytics', data: { title: 'Analytics' }, loadComponent: () => import('./features/analytics/analytics').then((module) => module.AnalyticsComponent) },
      { path: 'analytics/:datasetId', data: { title: 'Analytics' }, loadComponent: () => import('./features/analytics/analytics').then((module) => module.AnalyticsComponent) },
      { path: 'reports', data: { title: 'Reports' }, loadComponent: () => import('./features/reports/reports').then((module) => module.ReportsComponent) },
      { path: 'saved-filters', data: { title: 'Saved Filters' }, loadComponent: () => import('./features/saved-filters/saved-filters').then((module) => module.SavedFiltersComponent) },
      { path: 'settings', data: { title: 'Settings' }, loadComponent: () => import('./features/settings/settings').then((module) => module.SettingsComponent) }
    ]
  },
  { path: '**', redirectTo: 'app/dashboard' }
];
