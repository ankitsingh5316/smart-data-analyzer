export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export interface UserPreferences {
  defaultPageSize: 10 | 25 | 50 | 100;
  trimWhitespace: boolean;
  treatEmptyAsNull: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  datasetCount?: number;
  reportCount?: number;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface SignupOtpResult {
  otpRequired: boolean;
  email: string;
  delivered: boolean;
  expiresInMinutes: number;
  devOtp?: string;
}

export interface ForgotResult {
  delivered: boolean;
  resetUrl?: string;
}

export type DatasetStatus = 'processing' | 'ready' | 'failed';
export type DataType = 'string' | 'number' | 'date' | 'boolean';
export type ReportFormat = 'xlsx' | 'csv' | 'pdf';
export type ReportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Dataset {
  id: string;
  name: string;
  originalFilename: string;
  fileType: 'csv' | 'xlsx' | 'xls';
  fileSize: number;
  rowCount: number;
  columnCount: number;
  status: DatasetStatus;
  duplicateCount: number;
  missingValueCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetColumn {
  id: string;
  datasetId: string;
  columnName: string;
  columnKey: string;
  dataType: DataType;
  ordinal: number;
  nullCount: number;
  uniqueCount: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
}

export interface DataRecord {
  id: number;
  rowIndex: number;
  values: Record<string, string | number | boolean | null>;
}

export interface DatasetDetail {
  dataset: Dataset;
  columns: DatasetColumn[];
  preview: DataRecord[];
}

export interface RecordPage {
  items: DataRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FilterCondition {
  column: string;
  operator: string;
  value?: unknown;
}

export interface FilterPayload {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface SavedFilter {
  id: string;
  datasetId: string;
  datasetName?: string;
  name: string;
  description: string | null;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportSummary {
  datasetName: string;
  recordCount: number;
  filterDescription: string;
  columns: Array<{
    columnName: string;
    dataType: string;
    missing: number;
    min: number | null;
    max: number | null;
    avg: number | null;
  }>;
  categories: Array<{ label: string; count: number }>;
}

export interface ReportItem {
  id: string;
  datasetId: string | null;
  datasetName: string | null;
  savedFilterId: string | null;
  title: string;
  format: ReportFormat;
  columns: string[];
  filter: FilterPayload | null;
  status: ReportStatus;
  fileSize: number | null;
  recordCount: number | null;
  summary: ReportSummary | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface HistoryItem {
  id: number;
  reportId: string;
  reportTitle?: string;
  action: string;
  details: string | null;
  createdAt: string;
}

export interface DashboardData {
  kpis: {
    totalDatasets: number;
    totalRecords: number;
    processedRecords: number;
    duplicateRecords: number;
    totalReports: number;
  };
  status: Array<{ status: string; count: number }>;
  recordVolume: Array<{ label: string; count: number }>;
  reportTrend: Array<{ label: string; count: number }>;
  recentDatasets: Dataset[];
  recentReports: ReportItem[];
}

export interface ChartBucket {
  label: string;
  count: number;
}

export interface AnalyticsData {
  datasetId: string;
  totalRecords: number;
  duplicateRecords: number;
  missingValues: number;
  columns: DatasetColumn[];
  category: { columnKey: string; columnName: string; buckets: ChartBucket[] } | null;
  numeric: {
    columnKey: string;
    columnName: string;
    min: number | null;
    max: number | null;
    avg: number | null;
    buckets: ChartBucket[];
  } | null;
  dates: { columnKey: string; columnName: string; buckets: ChartBucket[] } | null;
}

export interface NotificationItem {
  id: string;
  type: 'dataset' | 'report';
  title: string;
  status: string;
  createdAt: string;
  href: string;
}

export interface QueryRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
  columnSearch?: Record<string, string>;
  logic?: 'AND' | 'OR';
  conditions?: FilterCondition[];
  filter?: FilterPayload | null;
}
