const fs = require('fs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { PDF_PREVIEW_ROWS } = require('../utils/constants');

function safeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function exportCell(column, value) {
  if (value === null || value === undefined || value === '') return { value: null };
  if (typeof value === 'boolean') return { value: value ? 'Yes' : 'No', numFmt: '@' };
  const type = column.data_type || column.dataType || 'string';
  if (type === 'number') {
    const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) return { value: String(value), numFmt: '@' };
    return { value: number, numFmt: Number.isInteger(number) ? '#,##0' : '#,##0.00' };
  }
  const dateMatch = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (type === 'date' || dateMatch) {
    const match = dateMatch;
    if (match) {
      const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0),
        Number(match[5] || 0),
        Number(match[6] || 0)
      );
      if (!Number.isNaN(date.getTime())) {
        return { value: date, numFmt: match[4] ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd' };
      }
    }
  }
  return { value: String(value), numFmt: '@' };
}

function writeDataRow(sheet, columns, values) {
  const row = sheet.addRow(columns.map(() => null));
  columns.forEach((column, index) => {
    const cellSpec = exportCell(column, values[index]);
    const cell = row.getCell(index + 1);
    cell.value = cellSpec.value;
    if (cellSpec.numFmt) cell.numFmt = cellSpec.numFmt;
  });
  return row;
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value;
}

function csvEscape(value) {
  const text = safeText(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function columnLetter(index) {
  let current = index + 1;
  let letters = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}

function writeCsv(filePath, columns, rows) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write('\uFEFF');
    stream.write(`${columns.map((column) => csvEscape(column.column_name)).join(',')}\n`);
    for (const row of rows) {
      stream.write(`${row.map((value) => csvEscape(displayValue(value))).join(',')}\n`);
    }
    stream.end();
  });
}

async function writeXlsx(filePath, report, columns, rows, summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Data Analyzer';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [{ width: 28 }, { width: 72 }];
  const lines = [
    ['Report', report.title],
    ['Generated', new Date().toISOString()],
    ['Dataset', summary.datasetName],
    ['Records', summary.recordCount],
    ['Filters', summary.filterDescription]
  ];
  lines.forEach((line) => summarySheet.addRow(line));
  summarySheet.addRow([]);
  summarySheet.addRow(['Column', 'Missing', 'Minimum', 'Maximum', 'Average']);
  for (const column of summary.columns) {
    summarySheet.addRow([
      column.columnName,
      column.missing,
      column.min,
      column.max,
      column.avg
    ]);
  }
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

  const sheet = workbook.addWorksheet('Data');
  sheet.columns = columns.map((column) => ({
    header: column.column_name,
    key: column.column_key,
    width: Math.min(36, Math.max(14, column.column_name.length + 4))
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: `${columnLetter(columns.length - 1)}1`
  };
  for (const row of rows) writeDataRow(sheet, columns, row);
  await workbook.xlsx.writeFile(filePath);
}

async function writeTableXlsx(filePath, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Data Analyzer';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Filtered data', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  const header = sheet.addRow(columns.map((column) => column.column_name));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  header.alignment = { vertical: 'middle' };
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = Math.min(36, Math.max(14, String(column.column_name || '').length + 4));
    if (column.data_type === 'number') excelColumn.numFmt = '#,##0.00';
    else if (column.data_type === 'date') excelColumn.numFmt = 'yyyy-mm-dd';
  });
  for (const row of rows) writeDataRow(sheet, columns, row);
  if (columns.length) {
    sheet.autoFilter = {
      from: 'A1',
      to: `${columnLetter(columns.length - 1)}1`
    };
  }
  await workbook.xlsx.writeFile(filePath);
}

function drawBars(doc, buckets) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const width = 360;
  buckets.slice(0, 6).forEach((bucket) => {
    const y = doc.y;
    doc.fillColor('#5c6570').fontSize(9).text(String(bucket.label).slice(0, 32), 48, y, { width: 120 });
    const barWidth = Math.max(2, (bucket.count / max) * width);
    doc.roundedRect(176, y + 1, barWidth, 10, 2).fill('#2f5bea');
    doc.fillColor('#121417').fontSize(9).text(String(bucket.count), 176 + barWidth + 8, y);
    doc.moveDown(0.8);
  });
}

function writePdf(filePath, report, columns, rows, summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: columns.length > 5 ? 'landscape' : 'portrait',
      margin: 40
    });
    const stream = fs.createWriteStream(filePath);
    stream.on('error', reject);
    stream.on('finish', resolve);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 80;
    doc.fillColor('#121417').fontSize(20).text(report.title, { width: pageWidth });
    doc.moveDown(0.3);
    doc.fillColor('#5c6570').fontSize(10).text(`${summary.datasetName} · ${summary.recordCount.toLocaleString()} records · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
    doc.moveDown(0.4);
    doc.fillColor('#121417').fontSize(11).text('Filters', { continued: false });
    doc.fillColor('#3c4450').fontSize(10).text(summary.filterDescription, { width: pageWidth });
    doc.moveDown(0.6);

    doc.fillColor('#121417').fontSize(12).text('Summary');
    doc.moveDown(0.3);
    summary.columns.forEach((column) => {
      const stats = column.dataType === 'number'
        ? `min ${column.min ?? '—'} · max ${column.max ?? '—'} · avg ${column.avg ?? '—'}`
        : `${column.missing} missing`;
      doc.fontSize(10).fillColor('#121417').text(`${column.columnName} (${column.dataType})`, { continued: true });
      doc.fillColor('#5c6570').text(`  ${stats}`);
    });

    if (summary.categories.length) {
      doc.moveDown(0.8);
      doc.fillColor('#121417').fontSize(12).text('Distribution');
      doc.moveDown(0.4);
      drawBars(doc, summary.categories);
    }

    doc.addPage();
    doc.fillColor('#121417').fontSize(12).text('Records');
    doc.moveDown(0.4);
    const preview = rows.slice(0, PDF_PREVIEW_ROWS);
    const colWidth = pageWidth / Math.max(columns.length, 1);
    const drawHeader = () => {
      const top = doc.y;
      doc.rect(40, top, pageWidth, 18).fill('#1f2937');
      columns.forEach((column, index) => {
        doc.fillColor('#ffffff').fontSize(8).text(
          column.column_name.slice(0, 24),
          44 + (index * colWidth),
          top + 5,
          { width: colWidth - 8, lineBreak: false }
        );
      });
      doc.y = top + 22;
    };
    drawHeader();
    preview.forEach((row, rowIndex) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
        drawHeader();
      }
      const top = doc.y;
      if (rowIndex % 2 === 0) doc.rect(40, top - 2, pageWidth, 16).fill('#f4f6f8');
      row.forEach((value, index) => {
        const text = displayValue(value);
        doc.fillColor('#121417').fontSize(8).text(
          text === null ? '—' : String(text).slice(0, 40),
          44 + (index * colWidth),
          top,
          { width: colWidth - 8, lineBreak: false }
        );
      });
      doc.y = top + 16;
    });
    if (rows.length > preview.length) {
      doc.moveDown(0.8);
      doc.fillColor('#5c6570').fontSize(9).text(
        `The PDF includes the first ${preview.length.toLocaleString()} of ${rows.length.toLocaleString()} records. Download Excel or CSV for the full extract.`
      );
    }
    doc.end();
  });
}

function writeTablePdf(filePath, title, subtitle, columns, rows, note) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: columns.length > 5 ? 'landscape' : 'portrait',
      margin: 36
    });
    const stream = fs.createWriteStream(filePath);
    stream.on('error', reject);
    stream.on('finish', resolve);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 72;
    doc.fillColor('#121417').fontSize(16).text(title, { width: pageWidth });
    doc.moveDown(0.25);
    doc.fillColor('#5c6570').fontSize(9).text(subtitle, { width: pageWidth });
    doc.moveDown(0.6);

    const colWidth = pageWidth / Math.max(columns.length, 1);
    const drawHeader = () => {
      const top = doc.y;
      doc.rect(36, top, pageWidth, 18).fill('#1f2937');
      columns.forEach((column, index) => {
        doc.fillColor('#ffffff').fontSize(8).text(
          String(column.column_name).slice(0, 28),
          40 + (index * colWidth),
          top + 5,
          { width: colWidth - 8, lineBreak: false }
        );
      });
      doc.y = top + 22;
    };
    drawHeader();
    rows.forEach((row, rowIndex) => {
      if (doc.y > doc.page.height - 52) {
        doc.addPage();
        drawHeader();
      }
      const top = doc.y;
      if (rowIndex % 2 === 0) doc.rect(36, top - 2, pageWidth, 16).fill('#f4f6f8');
      row.forEach((value, index) => {
        const shown = displayValue(value);
        doc.fillColor('#121417').fontSize(8).text(
          shown === null ? '' : String(shown).slice(0, 42),
          40 + (index * colWidth),
          top,
          { width: colWidth - 8, lineBreak: false }
        );
      });
      doc.y = top + 16;
    });
    if (note) {
      doc.moveDown(0.8);
      doc.fillColor('#5c6570').fontSize(9).text(note, { width: pageWidth });
    }
    doc.end();
  });
}

module.exports = { writeCsv, writeXlsx, writeTableXlsx, writePdf, writeTablePdf };
