const { DEFAULT_PREFERENCES } = require('../utils/constants');

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePreferences(value) {
  const source = { ...DEFAULT_PREFERENCES, ...parseJson(value, {}) };
  const pageSize = Number(source.defaultPageSize);
  return {
    defaultPageSize: [10, 25, 50, 100].includes(pageSize) ? pageSize : 25,
    trimWhitespace: source.trimWhitespace !== false,
    treatEmptyAsNull: source.treatEmptyAsNull !== false
  };
}

function mapUser(row, extras = {}) {
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    preferences: normalizePreferences(row.preferences),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
  if (extras.datasetCount !== undefined) user.datasetCount = toNumber(extras.datasetCount);
  if (extras.reportCount !== undefined) user.reportCount = toNumber(extras.reportCount);
  return user;
}

function mapDataset(row) {
  return {
    id: row.id,
    name: row.name,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    fileSize: toNumber(row.file_size),
    rowCount: toNumber(row.row_count),
    columnCount: toNumber(row.column_count),
    status: row.status,
    duplicateCount: toNumber(row.duplicate_count),
    missingValueCount: toNumber(row.missing_value_count),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapColumn(row) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    columnName: row.column_name,
    columnKey: row.column_key,
    dataType: row.data_type,
    ordinal: toNumber(row.ordinal),
    nullCount: toNumber(row.null_count),
    uniqueCount: toNumber(row.unique_count)
  };
}

function mapRecord(row) {
  return {
    id: toNumber(row.id),
    rowIndex: toNumber(row.row_index),
    values: parseJson(row.data, {})
  };
}

function mapFilter(row) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name || undefined,
    name: row.name,
    description: row.description,
    logic: row.logic,
    conditions: parseJson(row.conditions, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReport(row) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name || null,
    savedFilterId: row.saved_filter_id,
    title: row.title,
    format: row.format,
    columns: parseJson(row.selected_columns, []),
    filter: parseJson(row.filter_snapshot, null),
    status: row.status,
    fileSize: row.file_size === null || row.file_size === undefined ? null : toNumber(row.file_size),
    recordCount: row.record_count === null || row.record_count === undefined ? null : toNumber(row.record_count),
    summary: parseJson(row.summary, null),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function mapHistory(row) {
  return {
    id: toNumber(row.id),
    reportId: row.report_id,
    reportTitle: row.report_title || undefined,
    action: row.action,
    details: row.details,
    createdAt: row.created_at
  };
}

module.exports = {
  parseJson,
  normalizePreferences,
  mapUser,
  mapDataset,
  mapColumn,
  mapRecord,
  mapFilter,
  mapReport,
  mapHistory
};
