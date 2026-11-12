const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const { AppError } = require('./AppError');
const { MAX_COLUMNS, MAX_ROWS } = require('./constants');

function readMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function assertFileSignature(filePath, extension) {
  const magic = readMagic(filePath);
  const isZip = magic[0] === 0x50 && magic[1] === 0x4b;
  const isOle = magic[0] === 0xd0 && magic[1] === 0xcf;
  const isUtf16 = (magic[0] === 0xff && magic[1] === 0xfe) || (magic[0] === 0xfe && magic[1] === 0xff);
  if (extension === '.xlsx' && !isZip) {
    throw new AppError('This file is not a valid .xlsx workbook.', 400);
  }
  if (extension === '.xls' && !isOle) {
    throw new AppError('This file is not a valid .xls workbook. Save it as .xlsx or .csv and upload it again.', 400);
  }
  if (extension === '.csv' && (isZip || isOle || isUtf16)) {
    throw new AppError('This file does not look like a UTF-8 CSV.', 400);
  }
}

function detectDelimiter(text) {
  const line = text.split(/\r?\n/, 1)[0] || '';
  const counts = [
    [',', (line.match(/,/g) || []).length],
    [';', (line.match(/;/g) || []).length],
    ['\t', (line.match(/\t/g) || []).length]
  ].sort((left, right) => right[1] - left[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function excelCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return excelCellValue(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (typeof value.text === 'string') return value.text;
    return null;
  }
  return value;
}

function assertLimits(headers, rowCount) {
  if (!headers.length) {
    throw new AppError('The first row must contain column names.', 400);
  }
  if (headers.length > MAX_COLUMNS) {
    throw new AppError(`Files are limited to ${MAX_COLUMNS} columns.`, 400);
  }
  if (!rowCount) {
    throw new AppError('The file has column names but no data rows.', 400);
  }
  if (rowCount > MAX_ROWS) {
    throw new AppError(`Files are limited to ${MAX_ROWS.toLocaleString()} data rows.`, 400);
  }
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath).toString('utf8').replace(/^\uFEFF/, '');
  const separator = detectDelimiter(text);
  const headers = [];
  const seen = new Map();
  const rows = [];

  return new Promise((resolve, reject) => {
    const parser = csv({
      separator,
      mapHeaders: ({ header, index }) => {
        const name = String(header || '').replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`;
        const count = (seen.get(name.toLowerCase()) || 0) + 1;
        seen.set(name.toLowerCase(), count);
        const unique = count === 1 ? name : `${name} (${count})`;
        headers[index] = unique;
        return unique;
      },
      mapValues: ({ value }) => (value === '' || value === undefined ? null : value)
    });

    parser.on('data', (row) => {
      if (rows.length >= MAX_ROWS) {
        parser.destroy(new AppError(`Files are limited to ${MAX_ROWS.toLocaleString()} data rows.`, 400));
        return;
      }
      const values = headers.map((header) => (row[header] === undefined ? null : row[header]));
      if (values.every((value) => value === null || String(value).trim() === '')) return;
      rows.push(values);
    });
    parser.on('error', reject);
    parser.on('end', () => {
      try {
        assertLimits(headers, rows.length);
        resolve({ headers, rows });
      } catch (error) {
        reject(error);
      }
    });

    Readable.from([text]).pipe(parser);
  });
}

async function parseXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('The workbook has no worksheets.', 400);

  const headerRow = sheet.getRow(1);
  let maxCol = 0;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (String(cell.text || '').trim()) maxCol = Math.max(maxCol, colNumber);
  });
  if (!maxCol) throw new AppError('The first row must contain column names.', 400);

  const headers = [];
  for (let col = 1; col <= maxCol; col += 1) {
    headers.push(String(headerRow.getCell(col).text || '').trim() || `Column ${col}`);
  }
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = [];
    for (let col = 1; col <= maxCol; col += 1) {
      values.push(excelCellValue(row.getCell(col).value));
    }
    if (values.every((value) => value === null || value === '')) continue;
    rows.push(values);
    if (rows.length > MAX_ROWS) {
      throw new AppError(`Files are limited to ${MAX_ROWS.toLocaleString()} data rows.`, 400);
    }
  }
  assertLimits(headers, rows.length);
  return { headers, rows };
}

function parseXls(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError('The workbook has no worksheets.', 400);
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });
  if (!matrix.length) throw new AppError('The first row must contain column names.', 400);
  let maxCol = 0;
  matrix[0].forEach((cell, index) => {
    if (String(cell ?? '').trim()) maxCol = index + 1;
  });
  const headers = [];
  for (let index = 0; index < maxCol; index += 1) {
    headers.push(String(matrix[0][index] ?? '').trim() || `Column ${index + 1}`);
  }
  const rows = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    const values = headers.map((_, columnIndex) => {
      const value = source[columnIndex];
      return value === undefined || value === '' ? null : value;
    });
    if (values.every((value) => value === null)) continue;
    rows.push(values);
    if (rows.length > MAX_ROWS) {
      throw new AppError(`Files are limited to ${MAX_ROWS.toLocaleString()} data rows.`, 400);
    }
  }
  assertLimits(headers, rows.length);
  return { headers, rows };
}

async function parseUploadedFile(filePath, originalName) {
  const extension = path.extname(originalName || filePath).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
    throw new AppError('Upload a CSV, XLSX, or XLS file.', 400);
  }
  assertFileSignature(filePath, extension);
  if (extension === '.csv') return parseCsv(filePath);
  if (extension === '.xlsx') return parseXlsx(filePath);
  return parseXls(filePath);
}

module.exports = { parseUploadedFile };
