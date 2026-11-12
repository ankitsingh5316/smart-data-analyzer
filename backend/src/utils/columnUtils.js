const crypto = require('crypto');

function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let text = String(value).trim().replace(/[$,\s]/g, '');
  if (!text) return null;
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return negative ? -Math.abs(number) : number;
}

function looksLikeDate(value) {
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)
    || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text);
}

function formatDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const hasTime = value.getHours() + value.getMinutes() + value.getSeconds() !== 0;
    if (!hasTime) return date;
    return `${date} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    return iso[4]
      ? `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}:${iso[6] || '00'}`
      : `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!slash) return null;
  let month = Number(slash[1]);
  let day = Number(slash[2]);
  let year = Number(slash[3]);
  if (year < 100) year += 2000;
  if (month > 12 && day <= 12) {
    const swap = month;
    month = day;
    day = swap;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectValueType(value) {
  if (value instanceof Date) return 'date';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'string';
  const text = String(value).trim();
  if (/^(true|false|yes|no)$/i.test(text)) return 'boolean';
  if (looksLikeDate(text)) return 'date';
  if (parseNumber(text) !== null) return 'number';
  return 'string';
}

function inferType(values) {
  let detected = null;
  for (const value of values) {
    if (isEmpty(value)) continue;
    const next = detectValueType(value);
    if (!detected) {
      detected = next;
    } else if (detected !== next) {
      return 'string';
    }
  }
  return detected || 'string';
}

function uniqueHeaderNames(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = String(header || '').trim() || `Column ${index + 1}`;
    const count = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function toColumnKey(name, used) {
  let key = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (!key || /^[0-9]/.test(key)) {
    key = `col_${key || 'field'}`.slice(0, 64);
  }
  let candidate = key;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${key.slice(0, 54)}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function canonicalize(value, type, preferences) {
  const prefs = preferences || {};
  let current = value;
  if (typeof current === 'string' && prefs.trimWhitespace !== false) {
    current = current.trim();
  }
  if (isEmpty(current)) {
    return prefs.treatEmptyAsNull === false ? '' : null;
  }
  if (type === 'number') {
    const number = typeof current === 'number' ? current : parseNumber(current);
    return number === null || !Number.isFinite(number) ? null : number;
  }
  if (type === 'date') {
    return formatDateValue(current);
  }
  if (type === 'boolean') {
    if (typeof current === 'boolean') return current;
    return /^(true|yes)$/i.test(String(current).trim());
  }
  return String(current);
}

function rowHash(data) {
  const normalized = {};
  for (const key of Object.keys(data).sort()) {
    const value = data[key];
    normalized[key] = value === null || value === undefined ? null : String(value);
  }
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function buildDatasetRows(headers, matrix, preferences) {
  const names = uniqueHeaderNames(headers);
  const types = names.map((_, index) => inferType(matrix.map((row) => row[index])));
  const used = new Set();
  const columns = names.map((name, index) => ({
    columnName: name,
    columnKey: toColumnKey(name, used),
    dataType: types[index],
    ordinal: index,
    nullCount: 0,
    uniqueCount: 0
  }));
  const uniques = columns.map(() => new Set());
  const hashCounts = new Map();
  const records = matrix.map((row, index) => {
    const data = {};
    columns.forEach((column, columnIndex) => {
      const canonical = canonicalize(row[columnIndex], column.dataType, preferences);
      data[column.columnKey] = canonical;
      if (canonical === null || canonical === '') {
        column.nullCount += 1;
      } else {
        uniques[columnIndex].add(String(canonical));
      }
    });
    const hash = rowHash(data);
    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
    return { rowIndex: index + 1, rowHash: hash, data };
  });
  columns.forEach((column, index) => {
    column.uniqueCount = uniques[index].size;
  });
  let duplicateCount = 0;
  for (const count of hashCounts.values()) {
    if (count > 1) duplicateCount += count;
  }
  const missingValueCount = columns.reduce((sum, column) => sum + column.nullCount, 0);
  return { columns, records, duplicateCount, missingValueCount };
}

module.exports = {
  isEmpty,
  parseNumber,
  looksLikeDate,
  formatDateValue,
  inferType,
  uniqueHeaderNames,
  toColumnKey,
  canonicalize,
  buildDatasetRows
};
