const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { MAX_ROWS, PDF_PREVIEW_ROWS } = require('../utils/constants');
const { buildRecordQuery } = require('../utils/sqlFilters');
const { mapRecord, parseJson } = require('../models/mappers');
const { requireReadyDataset, getColumns } = require('./datasetService');
const { writeCsv, writeTableXlsx, writeTablePdf } = require('./reportWriters');

function wholeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function queryRecords(userId, datasetId, body = {}) {
  const dataset = await requireReadyDataset(userId, datasetId);
  const columns = await getColumns(dataset.id);
  const pageSize = wholeNumber(body.pageSize, 25, 1, 100);
  const page = wholeNumber(body.page, 1, 1, 1000000);
  const built = buildRecordQuery({
    columns,
    search: body.search,
    columnSearch: body.columnSearch,
    logic: body.logic || (body.filter && body.filter.logic),
    conditions: body.conditions || (body.filter && body.filter.conditions) || [],
    sortBy: body.sortBy,
    sortDir: body.sortDir
  });
  const where = `WHERE dataset_id = ?${built.clause}`;
  const whereParams = [dataset.id, ...built.params];
  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM dataset_records ${where}`,
    whereParams
  );
  const total = Number(countRows[0].total);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new AppError('Page is out of range.', 400);
  }
  const [rows] = await getPool().query(
    `SELECT id, row_index, data
     FROM dataset_records
     ${where}
     ${built.orderSql}
     LIMIT ${pageSize} OFFSET ${offset}`,
    [...whereParams, ...built.orderParams]
  );
  return {
    items: rows.map(mapRecord),
    page,
    pageSize,
    total,
    totalPages: total ? Math.ceil(total / pageSize) : 0
  };
}

async function countRecords(userId, datasetId, body = {}) {
  const page = await queryRecords(userId, datasetId, { ...body, page: 1, pageSize: 1 });
  return { total: page.total };
}

function describeExport(columns, body) {
  const nameOf = (key) => {
    const column = columns.find((item) => item.column_key === key);
    return column ? column.column_name : key;
  };
  const parts = [];
  if (body.columnSearch && typeof body.columnSearch === 'object') {
    for (const [key, raw] of Object.entries(body.columnSearch)) {
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      parts.push(`${nameOf(key)} contains "${String(raw).trim()}"`);
    }
  }
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  for (const condition of conditions) {
    if (!condition || typeof condition !== 'object') continue;
    const name = nameOf(condition.column);
    if (condition.operator === 'is_empty') parts.push(`${name} is empty`);
    else if (condition.operator === 'is_not_empty') parts.push(`${name} is not empty`);
    else if (condition.value && typeof condition.value === 'object') {
      parts.push(`${name} from ${condition.value.from} to ${condition.value.to}`);
    } else {
      parts.push(`${name} ${String(condition.operator || 'equals').replaceAll('_', ' ')} ${condition.value}`);
    }
  }
  const logic = String(body.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  return parts.length ? parts.join(` ${logic} `) : 'No extra column filters.';
}

function chooseColumns(columns, requested) {
  if (!Array.isArray(requested) || !requested.length) return columns;
  const chosen = [];
  for (const key of requested) {
    const column = columns.find((item) => item.column_key === key);
    if (!column) throw new AppError('One of the selected columns is not part of this dataset.', 400);
    if (!chosen.includes(column)) chosen.push(column);
  }
  return chosen;
}

function exportQuery(columns, body) {
  return buildRecordQuery({
    columns,
    search: body.search,
    columnSearch: body.columnSearch,
    logic: body.logic || (body.filter && body.filter.logic),
    conditions: body.conditions || (body.filter && body.filter.conditions) || [],
    sortBy: 'row_index',
    sortDir: 'asc'
  });
}

async function exportRecords(userId, datasetId, body = {}) {
  const format = String(body.format || '').toLowerCase();
  if (format !== 'csv' && format !== 'xlsx' && format !== 'pdf') {
    throw new AppError('Choose a CSV, Excel, or PDF file.', 400);
  }
  const dataset = await requireReadyDataset(userId, datasetId);
  const columns = await getColumns(dataset.id);
  const built = exportQuery(columns, body);
  const where = `WHERE dataset_id = ?${built.clause}`;
  const params = [dataset.id, ...built.params];
  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM dataset_records ${where}`,
    params
  );
  const total = Number(countRows[0].total);
  if (total > MAX_ROWS) {
    throw new AppError('This result is too large to download at once.', 400);
  }

  const records = [];
  const batchSize = 1000;
  let offset = 0;
  while (offset < total) {
    const [rows] = await getPool().query(
      `SELECT data FROM dataset_records ${where} ${built.orderSql} LIMIT ${batchSize} OFFSET ${offset}`,
      [...params, ...built.orderParams]
    );
    if (!rows.length) break;
    records.push(...rows);
    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  const chosen = chooseColumns(columns, body.columns);
  const matrix = records.map((row) => {
    const data = parseJson(row.data, {});
    return chosen.map((column) => (data[column.column_key] === undefined ? null : data[column.column_key]));
  });
  const filePath = path.join(os.tmpdir(), `sda-export-${crypto.randomUUID()}.${format}`);
  if (format === 'csv') {
    await writeCsv(filePath, chosen, matrix);
  } else if (format === 'xlsx') {
    await writeTableXlsx(filePath, chosen, matrix);
  } else {
    const preview = matrix.slice(0, PDF_PREVIEW_ROWS);
    const note = matrix.length > preview.length
      ? `This PDF includes the first ${preview.length.toLocaleString()} of ${matrix.length.toLocaleString()} matching rows. Download Excel or CSV for the full list.`
      : '';
    await writeTablePdf(
      filePath,
      dataset.name,
      `${matrix.length.toLocaleString()} matching rows. ${describeExport(columns, body)}`,
      chosen,
      preview,
      note
    );
  }
  const base = String(dataset.name || 'filtered-data')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'filtered-data';
  return { filePath, fileName: `${base}-filtered.${format}`, format };
}

module.exports = { queryRecords, countRecords, exportRecords };
