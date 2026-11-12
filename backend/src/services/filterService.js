const crypto = require('crypto');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { buildFilterClause, normalizeLogic } = require('../utils/sqlFilters');
const { isUuid } = require('../utils/paths');
const { mapFilter, parseJson } = require('../models/mappers');
const { requireReadyDataset, getColumns } = require('./datasetService');

function cleanConditions(columns, logic, conditions) {
  const normalizedLogic = normalizeLogic(logic);
  const list = Array.isArray(conditions) ? conditions : null;
  if (!list || !list.length) {
    throw new AppError('Add at least one filter condition before saving.', 400);
  }
  buildFilterClause(columns, normalizedLogic, list);
  return {
    logic: normalizedLogic,
    conditions: list.map((condition) => ({
      column: condition.column,
      operator: condition.operator,
      value: condition.value === undefined ? null : condition.value
    }))
  };
}

async function getOwnedFilter(userId, filterId) {
  if (!isUuid(filterId)) throw new AppError('Saved filter not found.', 404);
  const [rows] = await getPool().query(
    `SELECT saved_filters.*, datasets.name AS dataset_name
     FROM saved_filters
     INNER JOIN datasets ON datasets.id = saved_filters.dataset_id
     WHERE saved_filters.id = ? AND saved_filters.user_id = ?`,
    [filterId, userId]
  );
  if (!rows[0]) throw new AppError('Saved filter not found.', 404);
  return rows[0];
}

async function listFilters(userId, datasetId) {
  const params = [userId];
  let sql = `SELECT saved_filters.*, datasets.name AS dataset_name
             FROM saved_filters
             INNER JOIN datasets ON datasets.id = saved_filters.dataset_id
             WHERE saved_filters.user_id = ?`;
  if (datasetId) {
    if (!isUuid(datasetId)) return [];
    sql += ' AND saved_filters.dataset_id = ?';
    params.push(datasetId);
  }
  sql += ' ORDER BY saved_filters.updated_at DESC';
  const [rows] = await getPool().query(sql, params);
  return rows.map(mapFilter);
}

async function createFilter(userId, body) {
  const dataset = await requireReadyDataset(userId, body.datasetId);
  const columns = await getColumns(dataset.id);
  const cleaned = cleanConditions(columns, body.logic, body.conditions);
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  if (name.length < 1 || name.length > 120) {
    throw new AppError('Filter name must be between 1 and 120 characters.', 400);
  }
  if (description.length > 500) {
    throw new AppError('Description must be 500 characters or fewer.', 400);
  }
  const id = crypto.randomUUID();
  await getPool().query(
    `INSERT INTO saved_filters (id, user_id, dataset_id, name, description, logic, conditions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, dataset.id, name, description || null, cleaned.logic, JSON.stringify(cleaned.conditions)]
  );
  return mapFilter(await getOwnedFilter(userId, id));
}

async function updateFilter(userId, filterId, body) {
  const current = await getOwnedFilter(userId, filterId);
  const dataset = await requireReadyDataset(userId, current.dataset_id);
  const columns = await getColumns(dataset.id);
  const cleaned = cleanConditions(
    columns,
    body.logic || current.logic,
    body.conditions || parseJson(current.conditions, [])
  );
  const name = String(body.name || current.name).trim();
  const description = body.description === undefined ? current.description : String(body.description || '').trim();
  if (name.length < 1 || name.length > 120) {
    throw new AppError('Filter name must be between 1 and 120 characters.', 400);
  }
  await getPool().query(
    `UPDATE saved_filters SET name = ?, description = ?, logic = ?, conditions = ? WHERE id = ? AND user_id = ?`,
    [name, description || null, cleaned.logic, JSON.stringify(cleaned.conditions), filterId, userId]
  );
  return mapFilter(await getOwnedFilter(userId, filterId));
}

async function deleteFilter(userId, filterId) {
  await getOwnedFilter(userId, filterId);
  await getPool().query('DELETE FROM saved_filters WHERE id = ? AND user_id = ?', [filterId, userId]);
}

module.exports = {
  getOwnedFilter,
  listFilters,
  createFilter,
  updateFilter,
  deleteFilter
};
