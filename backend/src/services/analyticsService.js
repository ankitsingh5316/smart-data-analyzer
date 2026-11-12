const { getPool } = require('../config/db');
const { mapColumn } = require('../models/mappers');
const { requireReadyDataset, getColumns } = require('./datasetService');

const NUMBER_PATTERN = '^-?[0-9]+(\\.[0-9]+)?$';

function pickColumn(columns, requestedKey) {
  if (!columns.length) return null;
  if (requestedKey) {
    return columns.find((column) => column.column_key === requestedKey) || columns[0];
  }
  return columns[0];
}

function roundNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10000) / 10000;
}

function formatDay(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

async function numericAggregate(datasetId, columnKey) {
  const path = `$.${columnKey}`;
  const [rows] = await getPool().query(
    `SELECT
       MIN(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS DECIMAL(20,6))) AS minValue,
       MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS DECIMAL(20,6))) AS maxValue,
       AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS DECIMAL(20,6))) AS avgValue
     FROM dataset_records
     WHERE dataset_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) REGEXP ?`,
    [path, path, path, datasetId, path, NUMBER_PATTERN]
  );
  return {
    min: roundNumber(rows[0].minValue),
    max: roundNumber(rows[0].maxValue),
    avg: roundNumber(rows[0].avgValue)
  };
}

async function numericBuckets(datasetId, columnKey, min, max) {
  if (min === null || max === null) return [];
  const path = `$.${columnKey}`;
  if (Number(min) === Number(max)) {
    const [rows] = await getPool().query(
      `SELECT COUNT(*) AS count
       FROM dataset_records
       WHERE dataset_id = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) REGEXP ?`,
      [datasetId, path, NUMBER_PATTERN]
    );
    return [{ label: String(min), count: Number(rows[0].count) }];
  }

  const width = (Number(max) - Number(min)) / 8;
  const [rows] = await getPool().query(
    `SELECT LEAST(7, GREATEST(0, FLOOR((CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS DECIMAL(20,6)) - ?) / ?))) AS bucket,
            COUNT(*) AS count
     FROM dataset_records
     WHERE dataset_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) REGEXP ?
     GROUP BY bucket
     ORDER BY bucket`,
    [path, Number(min), width, datasetId, path, NUMBER_PATTERN]
  );
  const counts = new Map(rows.map((row) => [Number(row.bucket), Number(row.count)]));
  return Array.from({ length: 8 }, (_, index) => {
    const start = Number(min) + (width * index);
    const end = index === 7 ? Number(max) : Number(min) + (width * (index + 1));
    return {
      label: `${roundNumber(start)} – ${roundNumber(end)}`,
      count: counts.get(index) || 0
    };
  });
}

async function categoryBuckets(datasetId, columnKey) {
  const path = `$.${columnKey}`;
  const [rows] = await getPool().query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS label, COUNT(*) AS count
     FROM dataset_records
     WHERE dataset_id = ?
       AND JSON_EXTRACT(data, ?) IS NOT NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) <> ''
     GROUP BY label
     ORDER BY count DESC
     LIMIT 8`,
    [path, datasetId, path, path]
  );
  const [totals] = await getPool().query(
    `SELECT COUNT(*) AS total
     FROM dataset_records
     WHERE dataset_id = ?
       AND JSON_EXTRACT(data, ?) IS NOT NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) <> ''`,
    [datasetId, path, path]
  );
  const buckets = rows.map((row) => ({
    label: row.label === 'true' ? 'Yes' : row.label === 'false' ? 'No' : (row.label || 'Blank'),
    count: Number(row.count)
  }));
  const shown = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const other = Number(totals[0].total) - shown;
  if (other > 0) buckets.push({ label: 'Other', count: other });
  return buckets;
}

async function dateBuckets(datasetId, columnKey) {
  const path = `$.${columnKey}`;
  const [rows] = await getPool().query(
    `SELECT DATE(CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS DATETIME)) AS day, COUNT(*) AS count
     FROM dataset_records
     WHERE dataset_id = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(data, ?)) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
     GROUP BY day
     ORDER BY day`,
    [path, datasetId, path]
  );
  const daily = rows
    .map((row) => ({ label: formatDay(row.day), count: Number(row.count) }))
    .filter((row) => row.label);
  if (daily.length <= 48) return daily;

  const months = new Map();
  for (const row of daily) {
    const key = row.label.slice(0, 7);
    months.set(key, (months.get(key) || 0) + row.count);
  }
  return Array.from(months.entries()).map(([label, count]) => ({ label, count }));
}

async function getAnalytics(userId, datasetId, query = {}) {
  const dataset = await requireReadyDataset(userId, datasetId);
  const columns = await getColumns(dataset.id);
  const numericColumns = columns.filter((column) => column.data_type === 'number');
  const categoryColumns = columns.filter((column) => column.data_type === 'string' || column.data_type === 'boolean');
  const dateColumns = columns.filter((column) => column.data_type === 'date');
  const selectedNumeric = pickColumn(numericColumns, query.numeric);
  const selectedCategory = pickColumn(categoryColumns, query.category);
  const selectedDate = pickColumn(dateColumns, query.date);

  const columnStats = await Promise.all(columns.map(async (column) => {
    const mapped = mapColumn(column);
    if (column.data_type !== 'number') {
      return { ...mapped, min: null, max: null, avg: null };
    }
    const aggregate = await numericAggregate(dataset.id, column.column_key);
    return { ...mapped, ...aggregate };
  }));

  const numericMeta = selectedNumeric
    ? columnStats.find((column) => column.columnKey === selectedNumeric.column_key)
    : null;

  return {
    datasetId: dataset.id,
    totalRecords: Number(dataset.row_count),
    duplicateRecords: Number(dataset.duplicate_count),
    missingValues: Number(dataset.missing_value_count),
    columns: columnStats,
    category: selectedCategory ? {
      columnKey: selectedCategory.column_key,
      columnName: selectedCategory.column_name,
      buckets: await categoryBuckets(dataset.id, selectedCategory.column_key)
    } : null,
    numeric: selectedNumeric ? {
      columnKey: selectedNumeric.column_key,
      columnName: selectedNumeric.column_name,
      min: numericMeta ? numericMeta.min : null,
      max: numericMeta ? numericMeta.max : null,
      avg: numericMeta ? numericMeta.avg : null,
      buckets: await numericBuckets(
        dataset.id,
        selectedNumeric.column_key,
        numericMeta ? numericMeta.min : null,
        numericMeta ? numericMeta.max : null
      )
    } : null,
    dates: selectedDate ? {
      columnKey: selectedDate.column_key,
      columnName: selectedDate.column_name,
      buckets: await dateBuckets(dataset.id, selectedDate.column_key)
    } : null
  };
}

module.exports = { getAnalytics };
