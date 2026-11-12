const crypto = require('crypto');
const fs = require('fs/promises');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { INSERT_BATCH } = require('../utils/constants');
const { parseUploadedFile } = require('../utils/fileParse');
const { buildDatasetRows } = require('../utils/columnUtils');
const { enqueue } = require('../utils/jobs');
const { uploadDir, assertInside } = require('../utils/paths');

async function loadDataset(datasetId) {
  const [rows] = await getPool().query('SELECT * FROM datasets WHERE id = ?', [datasetId]);
  return rows[0] || null;
}

async function markFailed(datasetId, error) {
  const message = String(error && error.message ? error.message : 'Import failed.').slice(0, 1000);
  await getPool().query(
    `UPDATE datasets
     SET status = 'failed', error_message = ?, row_count = 0, column_count = 0,
         duplicate_count = 0, missing_value_count = 0
     WHERE id = ?`,
    [message, datasetId]
  );
}

async function insertRecords(connection, datasetId, records) {
  for (let index = 0; index < records.length; index += INSERT_BATCH) {
    const batch = records.slice(index, index + INSERT_BATCH);
    const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
    const values = [];
    for (const record of batch) {
      values.push(datasetId, record.rowIndex, record.rowHash, JSON.stringify(record.data));
    }
    await connection.query(
      `INSERT INTO dataset_records (dataset_id, row_index, row_hash, data) VALUES ${placeholders}`,
      values
    );
  }
}

async function processImport(datasetId) {
  const dataset = await loadDataset(datasetId);
  if (!dataset || dataset.status === 'ready') return;
  try {
    const filePath = assertInside(uploadDir, dataset.stored_path);
    await fs.access(filePath);
    const { getPreferences } = require('./datasetService');
    const preferences = await getPreferences(dataset.user_id);
    const parsed = await parseUploadedFile(filePath, dataset.original_filename);
    const built = buildDatasetRows(parsed.headers, parsed.rows, preferences);
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM dataset_columns WHERE dataset_id = ?', [datasetId]);
      await connection.query('DELETE FROM dataset_records WHERE dataset_id = ?', [datasetId]);
      if (built.columns.length) {
        const placeholders = built.columns.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = [];
        for (const column of built.columns) {
          values.push(
            crypto.randomUUID(),
            datasetId,
            column.columnName.slice(0, 180),
            column.columnKey,
            column.dataType,
            column.ordinal,
            column.nullCount,
            column.uniqueCount
          );
        }
        await connection.query(
          `INSERT INTO dataset_columns
            (id, dataset_id, column_name, column_key, data_type, ordinal, null_count, unique_count)
           VALUES ${placeholders}`,
          values
        );
      }
      await insertRecords(connection, datasetId, built.records);
      await connection.query(
        `UPDATE datasets
         SET status = 'ready', error_message = NULL, row_count = ?, column_count = ?,
             duplicate_count = ?, missing_value_count = ?
         WHERE id = ?`,
        [built.records.length, built.columns.length, built.duplicateCount, built.missingValueCount, datasetId]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (!(error instanceof AppError) && error && error.code === 'ENOENT') {
      await markFailed(datasetId, new AppError('The uploaded file could not be found.', 400));
      return;
    }
    await markFailed(datasetId, error);
  }
}

function scheduleImport(datasetId) {
  enqueue(`import:${datasetId}`, () => processImport(datasetId));
}

async function resumeImports() {
  const [rows] = await getPool().query(`SELECT id FROM datasets WHERE status = 'processing'`);
  for (const row of rows) scheduleImport(row.id);
}

module.exports = {
  scheduleImport,
  processImport,
  resumeImports
};
