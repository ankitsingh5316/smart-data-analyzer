const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { REPORT_FORMATS } = require('../utils/constants');
const { buildRecordQuery, requireColumn } = require('../utils/sqlFilters');
const { enqueue } = require('../utils/jobs');
const { reportDir, assertInside, isUuid } = require('../utils/paths');
const { mapReport, mapHistory, parseJson } = require('../models/mappers');
const { requireReadyDataset, getColumns, getOwnedDataset } = require('./datasetService');
const { getOwnedFilter } = require('./filterService');
const { writeCsv, writeXlsx, writePdf } = require('./reportWriters');

function describeFilters(columns, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.conditions) || !snapshot.conditions.length) {
    return 'No filters applied. The report includes every record in the dataset.';
  }
  const parts = snapshot.conditions.map((condition) => {
    const column = columns.find((item) => item.column_key === condition.column);
    const name = column ? column.column_name : condition.column;
    if (condition.operator === 'is_empty') return `${name} is empty`;
    if (condition.operator === 'is_not_empty') return `${name} is not empty`;
    if (condition.operator === 'between' || condition.operator === 'date_range') {
      const from = condition.value && (condition.value.from ?? condition.value[0]);
      const to = condition.value && (condition.value.to ?? condition.value[1]);
      return `${name} ${condition.operator === 'date_range' ? 'from' : 'between'} ${from} and ${to}`;
    }
    return `${name} ${String(condition.operator).replaceAll('_', ' ')} ${condition.value}`;
  });
  return parts.join(` ${snapshot.logic || 'AND'} `);
}

async function loadRows(datasetId, columns, snapshot) {
  const built = buildRecordQuery({
    columns,
    logic: snapshot && snapshot.logic,
    conditions: (snapshot && snapshot.conditions) || [],
    sortBy: 'row_index',
    sortDir: 'asc'
  });
  const where = `WHERE dataset_id = ?${built.clause}`;
  const params = [datasetId, ...built.params, ...built.orderParams];
  const records = [];
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const [rows] = await getPool().query(
      `SELECT data FROM dataset_records ${where} ${built.orderSql} LIMIT ${batchSize} OFFSET ${offset}`,
      params
    );
    if (!rows.length) break;
    records.push(...rows);
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return records;
}

function summarize(dataset, columns, selected, snapshot, matrix) {
  const columnSummaries = selected.map((column, index) => {
    const summary = {
      columnName: column.column_name,
      dataType: column.data_type,
      missing: 0,
      min: null,
      max: null,
      avg: null
    };
    if (column.data_type !== 'number') {
      summary.missing = matrix.reduce((count, row) => count + (row[index] === null || row[index] === '' ? 1 : 0), 0);
      return summary;
    }
    let sum = 0;
    let seen = 0;
    for (const row of matrix) {
      const value = row[index];
      if (typeof value !== 'number') {
        summary.missing += 1;
        continue;
      }
      summary.min = summary.min === null ? value : Math.min(summary.min, value);
      summary.max = summary.max === null ? value : Math.max(summary.max, value);
      sum += value;
      seen += 1;
    }
    summary.avg = seen ? Math.round((sum / seen) * 10000) / 10000 : null;
    return summary;
  });

  const categoryColumn = selected.find((column) => column.data_type === 'string' || column.data_type === 'boolean');
  const categories = [];
  if (categoryColumn) {
    const index = selected.indexOf(categoryColumn);
    const counts = new Map();
    for (const row of matrix) {
      const value = row[index];
      if (value === null || value === '') continue;
      const label = value === true ? 'Yes' : value === false ? 'No' : String(value);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    categories.push(
      ...Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count }))
    );
  }

  return {
    datasetName: dataset.name,
    recordCount: matrix.length,
    filterDescription: describeFilters(columns, snapshot),
    columns: columnSummaries,
    categories
  };
}

async function getReportRow(userId, reportId) {
  if (!isUuid(reportId)) throw new AppError('Report not found.', 404);
  const [rows] = await getPool().query(
    `SELECT reports.*, datasets.name AS dataset_name
     FROM reports
     LEFT JOIN datasets ON datasets.id = reports.dataset_id
     WHERE reports.id = ? AND reports.user_id = ?`,
    [reportId, userId]
  );
  if (!rows[0]) throw new AppError('Report not found.', 404);
  return rows[0];
}

async function addHistory(reportId, userId, action, details) {
  await getPool().query(
    `INSERT INTO report_history (report_id, user_id, action, details) VALUES (?, ?, ?, ?)`,
    [reportId, userId, action, details ? String(details).slice(0, 500) : null]
  );
}

async function resolveSnapshot(userId, dataset, columns, body) {
  if (body.savedFilterId) {
    const filter = await getOwnedFilter(userId, body.savedFilterId);
    if (filter.dataset_id !== dataset.id) {
      throw new AppError('That saved filter belongs to a different dataset.', 400);
    }
    const snapshot = {
      logic: filter.logic,
      conditions: parseJson(filter.conditions, [])
    };
    buildRecordQuery({ columns, logic: snapshot.logic, conditions: snapshot.conditions });
    return { savedFilterId: filter.id, snapshot };
  }
  const incoming = body.filter;
  if (incoming && Array.isArray(incoming.conditions) && incoming.conditions.length) {
    const snapshot = { logic: incoming.logic || 'AND', conditions: incoming.conditions };
    buildRecordQuery({ columns, logic: snapshot.logic, conditions: snapshot.conditions });
    return { savedFilterId: null, snapshot };
  }
  return { savedFilterId: null, snapshot: null };
}

async function createReport(userId, body) {
  const title = String(body.title || '').trim();
  if (title.length < 1 || title.length > 200) {
    throw new AppError('Report title must be between 1 and 200 characters.', 400);
  }
  if (!REPORT_FORMATS.has(body.format)) {
    throw new AppError('Choose an Excel, CSV, or PDF report.', 400);
  }
  const dataset = await requireReadyDataset(userId, body.datasetId);
  const columns = await getColumns(dataset.id);
  if (!Array.isArray(body.columns) || !body.columns.length) {
    throw new AppError('Select at least one column.', 400);
  }
  const selectedKeys = [];
  for (const key of body.columns) {
    const column = requireColumn(columns, key);
    if (!selectedKeys.includes(column.column_key)) selectedKeys.push(column.column_key);
  }
  const resolved = await resolveSnapshot(userId, dataset, columns, body);
  const id = crypto.randomUUID();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO reports
        (id, user_id, dataset_id, saved_filter_id, title, format, selected_columns, filter_snapshot, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
      [
        id,
        userId,
        dataset.id,
        resolved.savedFilterId,
        title,
        body.format,
        JSON.stringify(selectedKeys),
        resolved.snapshot ? JSON.stringify(resolved.snapshot) : null
      ]
    );
    await connection.query(
      `INSERT INTO report_history (report_id, user_id, action, details) VALUES (?, ?, 'queued', ?)`,
      [id, userId, 'Report queued for background generation']
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  scheduleReport(id);
  return mapReport(await getReportRow(userId, id));
}

async function processReport(reportId) {
  const [rows] = await getPool().query('SELECT * FROM reports WHERE id = ?', [reportId]);
  const report = rows[0];
  if (!report || report.status === 'completed') return;
  try {
    await getPool().query(`UPDATE reports SET status = 'processing', error_message = NULL WHERE id = ?`, [reportId]);
    if (!report.dataset_id) throw new AppError('The source dataset is no longer available.', 400);
    const dataset = await getOwnedDataset(report.user_id, report.dataset_id);
    if (dataset.status !== 'ready') throw new AppError('The source dataset is not ready.', 409);
    const columns = await getColumns(dataset.id);
    const selected = parseJson(report.selected_columns, [])
      .map((key) => columns.find((column) => column.column_key === key))
      .filter(Boolean);
    if (!selected.length) throw new AppError('The selected columns are no longer available.', 400);
    const snapshot = parseJson(report.filter_snapshot, null);
    const sourceRows = await loadRows(dataset.id, columns, snapshot);
    const matrix = sourceRows.map((row) => {
      const data = parseJson(row.data, {});
      return selected.map((column) => (data[column.column_key] === undefined ? null : data[column.column_key]));
    });
    const summary = summarize(dataset, columns, selected, snapshot, matrix);
    const directory = path.join(reportDir, report.user_id);
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${report.id}.${report.format}`);
    if (report.format === 'csv') await writeCsv(filePath, selected, matrix);
    if (report.format === 'xlsx') await writeXlsx(filePath, report, selected, matrix, summary);
    if (report.format === 'pdf') await writePdf(filePath, report, selected, matrix, summary);
    const fileStat = await fs.stat(filePath);
    await getPool().query(
      `UPDATE reports
       SET status = 'completed', file_path = ?, file_size = ?, record_count = ?, summary = ?,
           error_message = NULL, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [filePath, fileStat.size, matrix.length, JSON.stringify(summary), reportId]
    );
    await addHistory(reportId, report.user_id, 'completed', `Generated ${matrix.length} records as ${report.format.toUpperCase()}`);
  } catch (error) {
    const message = String(error.message || 'Report generation failed.').slice(0, 1000);
    await getPool().query(
      `UPDATE reports SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [message, reportId]
    );
    await addHistory(reportId, report.user_id, 'failed', message);
  }
}

function scheduleReport(reportId) {
  enqueue(`report:${reportId}`, () => processReport(reportId));
}

async function resumeReports() {
  const [rows] = await getPool().query(
    `SELECT id FROM reports WHERE status IN ('queued', 'processing')`
  );
  for (const row of rows) scheduleReport(row.id);
}

async function listReports(userId) {
  const [rows] = await getPool().query(
    `SELECT reports.*, datasets.name AS dataset_name
     FROM reports
     LEFT JOIN datasets ON datasets.id = reports.dataset_id
     WHERE reports.user_id = ?
     ORDER BY reports.created_at DESC`,
    [userId]
  );
  return rows.map(mapReport);
}

async function getReport(userId, reportId) {
  const report = mapReport(await getReportRow(userId, reportId));
  const [history] = await getPool().query(
    `SELECT report_history.*, reports.title AS report_title
     FROM report_history
     INNER JOIN reports ON reports.id = report_history.report_id
     WHERE report_history.report_id = ? AND report_history.user_id = ?
     ORDER BY report_history.created_at DESC`,
    [reportId, userId]
  );
  return { report, history: history.map(mapHistory) };
}

async function listHistory(userId) {
  const [rows] = await getPool().query(
    `SELECT report_history.*, reports.title AS report_title
     FROM report_history
     INNER JOIN reports ON reports.id = report_history.report_id
     WHERE report_history.user_id = ?
     ORDER BY report_history.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows.map(mapHistory);
}

async function downloadReport(userId, reportId) {
  const row = await getReportRow(userId, reportId);
  if (row.status !== 'completed' || !row.file_path) {
    throw new AppError('This report is not ready to download.', 409);
  }
  const filePath = assertInside(reportDir, row.file_path);
  await fs.access(filePath);
  await addHistory(row.id, userId, 'downloaded', 'Report downloaded');
  const safeName = row.title.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'report';
  return {
    filePath,
    fileName: `${safeName}.${row.format}`,
    format: row.format
  };
}

async function deleteReport(userId, reportId) {
  const row = await getReportRow(userId, reportId);
  await getPool().query('DELETE FROM reports WHERE id = ? AND user_id = ?', [reportId, userId]);
  if (row.file_path) {
    try {
      await fs.unlink(assertInside(reportDir, row.file_path));
    } catch (error) {
      // History is removed with the report row. A missing file is not an error.
    }
  }
}

module.exports = {
  createReport,
  processReport,
  resumeReports,
  listReports,
  getReport,
  listHistory,
  downloadReport,
  deleteReport
};
