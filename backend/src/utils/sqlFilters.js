const { AppError } = require('./AppError');
const { OPERATORS, MAX_FILTERS } = require('./constants');
const { looksLikeDate } = require('./columnUtils');

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function likeClause(params, path, pattern) {
  params.push(path, pattern);
  return `JSON_UNQUOTE(JSON_EXTRACT(data, ?)) LIKE ? ESCAPE '\\\\'`;
}

function pushExtract(params, path) {
  params.push(path);
  return 'JSON_UNQUOTE(JSON_EXTRACT(data, ?))';
}

function typedExpr(column, params, path) {
  const extract = pushExtract(params, path);
  if (column.data_type === 'number') return `CAST(${extract} AS DECIMAL(20,6))`;
  if (column.data_type === 'date') return `CAST(${extract} AS DATETIME)`;
  return extract;
}

function requireColumn(columns, key) {
  const column = columns.find((item) => (item.column_key || item.columnKey) === key);
  if (!column || !/^[a-z_][a-z0-9_]{0,63}$/.test(column.column_key || column.columnKey)) {
    throw new AppError('One of the selected columns is not part of this dataset.', 400);
  }
  return {
    column_key: column.column_key || column.columnKey,
    column_name: column.column_name || column.columnName,
    data_type: column.data_type || column.dataType
  };
}

function normalizeLogic(logic) {
  if (logic === undefined || logic === null || logic === '') return 'AND';
  const value = String(logic).toUpperCase();
  if (value !== 'AND' && value !== 'OR') {
    throw new AppError('Filter logic must be AND or OR.', 400);
  }
  return value;
}

function normalizeRange(value) {
  if (Array.isArray(value)) {
    return { from: value[0], to: value[1] };
  }
  if (value && typeof value === 'object') {
    return { from: value.from, to: value.to };
  }
  return { from: undefined, to: undefined };
}

function bindScalar(column, raw) {
  if (column.data_type === 'number') {
    const number = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(number)) {
      throw new AppError(`Enter a valid number for ${column.column_name}.`, 400);
    }
    return number;
  }
  if (column.data_type === 'boolean') {
    return /^(true|yes|1)$/i.test(String(raw).trim()) ? 'true' : 'false';
  }
  const text = String(raw).trim();
  if (text.length > 500) {
    throw new AppError('Filter values must be 500 characters or fewer.', 400);
  }
  return text;
}

function conditionSql(column, operator, value, params) {
  const path = `$.${column.column_key}`;
  if (operator === 'is_empty') {
    const left = pushExtract(params, path);
    const right = pushExtract(params, path);
    return `(${left} IS NULL OR ${right} = '')`;
  }
  if (operator === 'is_not_empty') {
    const left = pushExtract(params, path);
    const right = pushExtract(params, path);
    return `(${left} IS NOT NULL AND ${right} <> '')`;
  }
  if (operator === 'contains') {
    return likeClause(params, path, `%${escapeLike(bindScalar(column, value))}%`);
  }
  if (operator === 'not_contains') {
    return `NOT (${likeClause(params, path, `%${escapeLike(bindScalar(column, value))}%`)})`;
  }
  if (operator === 'starts_with') {
    return likeClause(params, path, `${escapeLike(bindScalar(column, value))}%`);
  }
  if (operator === 'ends_with') {
    return likeClause(params, path, `%${escapeLike(bindScalar(column, value))}`);
  }
  if (operator === 'between' || operator === 'date_range') {
    const range = normalizeRange(value);
    if (range.from === undefined || range.to === undefined || String(range.from).trim() === '' || String(range.to).trim() === '') {
      throw new AppError('Between and date range filters need both values.', 400);
    }
    if (operator === 'date_range' && (!looksLikeDate(range.from) || !looksLikeDate(range.to))) {
      throw new AppError('Use valid dates for a date range.', 400);
    }
    const expr = typedExpr(column, params, path);
    params.push(bindScalar(column, range.from), bindScalar(column, range.to));
    return `${expr} BETWEEN ? AND ?`;
  }

  if (value === undefined || value === null || String(value).trim() === '') {
    throw new AppError('Enter a value for each filter that needs one.', 400);
  }
  const comparator = operator === 'gt' ? '>' : operator === 'lt' ? '<' : operator === 'neq' ? '<>' : '=';
  const useTyped = column.data_type === 'number' || column.data_type === 'date' || operator === 'gt' || operator === 'lt';
  const expr = useTyped && column.data_type !== 'boolean'
    ? typedExpr(column, params, path)
    : pushExtract(params, path);
  params.push(bindScalar(column, value));
  return `${expr} ${comparator} ?`;
}

function buildFilterClause(columns, logic, conditions) {
  const list = conditions || [];
  if (!Array.isArray(list)) {
    throw new AppError('Filters must be a list of conditions.', 400);
  }
  if (list.length > MAX_FILTERS) {
    throw new AppError(`Use at most ${MAX_FILTERS} filters at once.`, 400);
  }
  if (!list.length) {
    return { clause: '', params: [] };
  }
  const joiner = normalizeLogic(logic);
  const params = [];
  const parts = list.map((condition) => {
    if (!condition || typeof condition !== 'object') {
      throw new AppError('Each filter needs a column and an operator.', 400);
    }
    if (!OPERATORS.has(condition.operator)) {
      throw new AppError('That filter operator is not supported.', 400);
    }
    const column = requireColumn(columns, condition.column);
    return conditionSql(column, condition.operator, condition.value, params);
  });
  return { clause: ` AND (${parts.join(` ${joiner} `)})`, params };
}

function buildOrder(columns, sortBy, sortDir) {
  const direction = String(sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (!sortBy || sortBy === 'row_index') {
    return { sql: `ORDER BY row_index ${direction}`, params: [] };
  }
  const column = requireColumn(columns, sortBy);
  const params = [];
  const expr = typedExpr(column, params, `$.${column.column_key}`);
  return { sql: `ORDER BY ${expr} ${direction}`, params };
}

function buildRecordQuery({ columns, search, columnSearch, logic, conditions, sortBy, sortDir }) {
  const params = [];
  let clause = '';
  const text = String(search || '').trim();
  if (text) {
    if (text.length > 200) {
      throw new AppError('Search text must be 200 characters or fewer.', 400);
    }
    clause += ` AND CAST(data AS CHAR) LIKE ? ESCAPE '\\\\'`;
    params.push(`%${escapeLike(text)}%`);
  }

  if (columnSearch && typeof columnSearch === 'object' && !Array.isArray(columnSearch)) {
    const entries = Object.entries(columnSearch);
    if (entries.length > 80) {
      throw new AppError('Too many column searches.', 400);
    }
    for (const [key, raw] of entries) {
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const column = requireColumn(columns, key);
      const pattern = `%${escapeLike(String(raw).trim().slice(0, 200))}%`;
      clause += ` AND ${likeClause(params, `$.${column.column_key}`, pattern)}`;
    }
  }

  const filters = buildFilterClause(columns, logic, conditions);
  clause += filters.clause;
  params.push(...filters.params);
  const order = buildOrder(columns, sortBy, sortDir);
  return { clause, params, orderSql: order.sql, orderParams: order.params };
}

module.exports = {
  escapeLike,
  requireColumn,
  normalizeLogic,
  buildFilterClause,
  buildRecordQuery
};
