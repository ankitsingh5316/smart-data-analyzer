const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const ExcelJS = require('exceljs');
const { toColumnKey, buildDatasetRows } = require('../utils/columnUtils');
const { buildFilterClause, buildRecordQuery } = require('../utils/sqlFilters');
const { parseUploadedFile } = require('../utils/fileParse');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { toPostgres } = require('../config/sqlDialect');

function placeholders(sql) {
  return (sql.match(/\?/g) || []).length;
}

async function main() {
  const used = new Set();
  assert.strictEqual(toColumnKey('Order ID', used), 'order_id');
  assert.strictEqual(toColumnKey('1st Place', used), 'col_1st_place');
  assert.strictEqual(toColumnKey('Order ID', used), 'order_id_2');

  const columns = [
    { column_key: 'customer', column_name: 'Customer', data_type: 'string' },
    { column_key: 'amount', column_name: 'Amount', data_type: 'number' }
  ];
  const malicious = buildFilterClause(columns, 'OR', [
    { column: 'customer', operator: 'contains', value: "' OR 1=1 --" },
    { column: 'amount', operator: 'gt', value: '10' }
  ]);
  assert.strictEqual(placeholders(malicious.clause), malicious.params.length);
  assert.ok(!malicious.clause.includes('1=1'));
  assert.ok(malicious.params.some((value) => String(value).includes("' OR 1=1")));

  assert.throws(() => buildFilterClause(columns, 'AND', [
    { column: 'customer; drop table users', operator: 'eq', value: 'x' }
  ]));

  const ordered = buildRecordQuery({
    columns,
    search: 'ada',
    columnSearch: { customer: 'north' },
    logic: 'AND',
    conditions: [{ column: 'amount', operator: 'between', value: { from: 10, to: 20 } }],
    sortBy: 'amount',
    sortDir: 'desc'
  });
  assert.strictEqual(placeholders(`${ordered.clause} ${ordered.orderSql}`), ordered.params.length + ordered.orderParams.length);
  assert.ok(ordered.orderSql.endsWith('DESC'));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sda-'));
  const csvPath = path.join(directory, 'orders.csv');
  fs.writeFileSync(csvPath, [
    'Order ID,Customer,Amount,Order Date,Notes',
    '1001,Ada Lovelace,1200.50,2024-01-05,',
    '1002,Alan Turing,800,2024-01-06,Follow up',
    '1001,Ada Lovelace,1200.50,2024-01-05,'
  ].join('\n'));
  const csvParsed = await parseUploadedFile(csvPath, 'orders.csv');
  const csvBuilt = buildDatasetRows(csvParsed.headers, csvParsed.rows, { trimWhitespace: true, treatEmptyAsNull: true });
  assert.strictEqual(csvBuilt.records.length, 3);
  assert.strictEqual(csvBuilt.duplicateCount, 2);
  assert.ok(csvBuilt.missingValueCount >= 2);
  assert.strictEqual(csvBuilt.columns.find((column) => column.columnKey === 'amount').dataType, 'number');
  assert.strictEqual(csvBuilt.columns.find((column) => column.columnKey === 'order_date').dataType, 'date');

  const xlsxPath = path.join(directory, 'orders.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');
  sheet.addRow(['Customer', 'Amount', 'Order Date']);
  sheet.addRow(['Grace Hopper', 2400, new Date(2024, 1, 2)]);
  sheet.addRow(['Grace Hopper', 2400, new Date(2024, 1, 2)]);
  sheet.addRow(['Edsger Dijkstra', null, new Date(2024, 2, 11)]);
  await workbook.xlsx.writeFile(xlsxPath);
  const xlsxParsed = await parseUploadedFile(xlsxPath, 'orders.xlsx');
  const xlsxBuilt = buildDatasetRows(xlsxParsed.headers, xlsxParsed.rows, { trimWhitespace: true, treatEmptyAsNull: true });
  assert.strictEqual(xlsxBuilt.records.length, 3);
  assert.strictEqual(xlsxBuilt.duplicateCount, 2);
  assert.ok(xlsxBuilt.columns.find((column) => column.columnKey === 'amount').nullCount >= 1);

  const translated = toPostgres(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(data, ?)) AS label FROM dataset_records WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 13 DAY) AND CAST(data AS CHAR) LIKE ? ESCAPE '\\\\'"
  );
  assert.ok(translated.includes("(data->>substring($1 from 3))"));
  assert.ok(translated.includes("(CURRENT_TIMESTAMP - INTERVAL '13 days')"));
  assert.ok(translated.includes('(data)::text ILIKE $2'));
  assert.strictEqual((translated.match(/\$/g) || []).length, 2);

  const passwordHash = await hashPassword('Secret123');
  assert.strictEqual(await verifyPassword('Secret123', passwordHash), true);
  assert.strictEqual(await verifyPassword('wrong-pass', passwordHash), false);

  console.log('Unit checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
