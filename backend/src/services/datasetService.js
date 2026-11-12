const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { escapeLike } = require('../utils/sqlFilters');
const { uploadDir, assertInside, isUuid } = require('../utils/paths');
const { mapDataset, mapColumn, mapRecord, normalizePreferences } = require('../models/mappers');
const { scheduleImport } = require('./importService');

async function getOwnedDataset(userId, datasetId) {
  if (!isUuid(datasetId)) throw new AppError('Dataset not found.', 404);
  const [rows] = await getPool().query(
    'SELECT * FROM datasets WHERE id = ? AND user_id = ?',
    [datasetId, userId]
  );
  if (!rows[0]) throw new AppError('Dataset not found.', 404);
  return rows[0];
}

async function getColumns(datasetId) {
  const [rows] = await getPool().query(
    'SELECT * FROM dataset_columns WHERE dataset_id = ? ORDER BY ordinal ASC',
    [datasetId]
  );
  return rows;
}

async function requireReadyDataset(userId, datasetId) {
  const dataset = await getOwnedDataset(userId, datasetId);
  if (dataset.status === 'processing') {
    throw new AppError('This dataset is still processing.', 409);
  }
  if (dataset.status === 'failed') {
    throw new AppError(dataset.error_message || 'This dataset failed to import.', 409);
  }
  return dataset;
}

async function createFromUpload(userId, file, requestedName) {
  const originalFilename = path.basename(file.originalname || 'upload').slice(0, 255);
  const extension = path.extname(originalFilename).toLowerCase().slice(1);
  const fallbackName = path.parse(originalFilename).name || 'Untitled dataset';
  const name = String(requestedName || fallbackName).trim().slice(0, 180) || fallbackName;
  const id = crypto.randomUUID();
  await getPool().query(
    `INSERT INTO datasets
      (id, user_id, name, original_filename, stored_path, file_type, file_size, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')`,
    [id, userId, name, originalFilename, file.path, extension, file.size]
  );
  scheduleImport(id);
  const dataset = await getOwnedDataset(userId, id);
  return mapDataset(dataset);
}

async function listDatasets(userId, search) {
  const params = [userId];
  let sql = 'SELECT * FROM datasets WHERE user_id = ?';
  const text = String(search || '').trim();
  if (text) {
    sql += ` AND (name LIKE ? ESCAPE '\\\\' OR original_filename LIKE ? ESCAPE '\\\\')`;
    const pattern = `%${escapeLike(text.slice(0, 200))}%`;
    params.push(pattern, pattern);
  }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await getPool().query(sql, params);
  return rows.map(mapDataset);
}

async function getDataset(userId, datasetId) {
  const dataset = await getOwnedDataset(userId, datasetId);
  const columns = await getColumns(datasetId);
  const [previewRows] = await getPool().query(
    `SELECT id, row_index, data FROM dataset_records WHERE dataset_id = ? ORDER BY row_index ASC LIMIT 8`,
    [datasetId]
  );
  return {
    dataset: mapDataset(dataset),
    columns: columns.map(mapColumn),
    preview: previewRows.map(mapRecord)
  };
}

async function getStatus(userId, datasetId) {
  const dataset = await getOwnedDataset(userId, datasetId);
  return mapDataset(dataset);
}

async function renameDataset(userId, datasetId, name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 1 || trimmed.length > 180) {
    throw new AppError('Dataset name must be between 1 and 180 characters.', 400);
  }
  await getOwnedDataset(userId, datasetId);
  await getPool().query('UPDATE datasets SET name = ? WHERE id = ? AND user_id = ?', [trimmed, datasetId, userId]);
  return getStatus(userId, datasetId);
}

async function deleteDataset(userId, datasetId) {
  const dataset = await getOwnedDataset(userId, datasetId);
  await getPool().query('DELETE FROM datasets WHERE id = ? AND user_id = ?', [datasetId, userId]);
  if (dataset.stored_path) {
    try {
      await fs.unlink(assertInside(uploadDir, dataset.stored_path));
    } catch (error) {
      // The database row is already gone. A missing upload file should not surface as a failure.
    }
  }
}

async function getPreferences(userId) {
  const [rows] = await getPool().query('SELECT preferences FROM users WHERE id = ?', [userId]);
  return normalizePreferences(rows[0] && rows[0].preferences);
}

module.exports = {
  getOwnedDataset,
  getColumns,
  requireReadyDataset,
  createFromUpload,
  listDatasets,
  getDataset,
  getStatus,
  renameDataset,
  deleteDataset,
  getPreferences
};
