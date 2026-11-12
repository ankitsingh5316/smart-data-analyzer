const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 100000;
const MAX_COLUMNS = 80;
const MAX_FILTERS = 20;
const INSERT_BATCH = 400;

const DEFAULT_PREFERENCES = Object.freeze({
  defaultPageSize: 25,
  trimWhitespace: true,
  treatEmptyAsNull: true
});

const OPERATORS = new Set([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'gt',
  'lt',
  'between',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'date_range'
]);

const REPORT_FORMATS = new Set(['xlsx', 'csv', 'pdf']);
const PDF_PREVIEW_ROWS = 800;

module.exports = {
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_COLUMNS,
  MAX_FILTERS,
  INSERT_BATCH,
  DEFAULT_PREFERENCES,
  OPERATORS,
  REPORT_FORMATS,
  PDF_PREVIEW_ROWS
};
