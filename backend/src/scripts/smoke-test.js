const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const ExcelJS = require('exceljs');

const base = process.env.API_URL || 'http://127.0.0.1:5000/api';

async function request(urlPath, { method = 'GET', token, body, form, expectStatus } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${base}${urlPath}`, { method, headers, body: payload });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const json = isJson && text ? JSON.parse(text) : null;
  if (expectStatus) {
    assert.strictEqual(response.status, expectStatus, json ? json.message : text);
    return { response, json, buffer };
  }
  if (!response.ok) {
    throw new Error(`${method} ${urlPath} -> ${response.status} ${json ? json.message : text}`);
  }
  return { response, json, buffer };
}

async function waitForDataset(token, id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { json } = await request(`/datasets/${id}/status`, { token });
    if (json.data.status === 'ready') return json.data;
    if (json.data.status === 'failed') throw new Error(json.data.errorMessage || 'Import failed');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Dataset processing timed out.');
}

async function waitForReport(token, id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { json } = await request(`/reports/${id}`, { token });
    if (json.data.report.status === 'completed') return json.data;
    if (json.data.report.status === 'failed') throw new Error(json.data.report.errorMessage || 'Report failed');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Report generation timed out.');
}

async function createAccount(name, email, password) {
  const signup = await request('/auth/signup', {
    method: 'POST',
    body: { name, email, password }
  });
  assert.strictEqual(signup.response.status, 202);
  assert.match(String(signup.json.data.devOtp || ''), /^\d{6}$/);
  const verified = await request('/auth/signup/verify', {
    method: 'POST',
    body: { email, otp: signup.json.data.devOtp }
  });
  assert.strictEqual(verified.response.status, 201);
  return verified.json.data.token;
}

async function main() {
  const health = await request('/health');
  assert.strictEqual(health.json.success, true);

  const stamp = Date.now();
  const password = 'Secret123';
  const email = `analyst.${stamp}@example.com`;
  const otherEmail = `other.${stamp}@example.com`;
  const token = await createAccount('Ada Analyst', email, password);
  const otherToken = await createAccount('Grace Other', otherEmail, password);

  const login = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.ok(login.json.data.token);
  const me = await request('/auth/me', { token });
  assert.strictEqual(me.json.data.email, email);

  const csv = [
    'Order ID,Customer,Region,Amount,Order Date,Status,Notes',
    '1001,Ada Lovelace,North,1200.50,2024-01-05,Paid,',
    '1002,Alan Turing,South,800,2024-01-06,Pending,Follow up',
    '1003,Grace Hopper,North,2400,2024-02-02,Paid,',
    '1004,Ada Lovelace,North,1200.50,2024-01-05,Paid,',
    '1005,Edsger Dijkstra,East,,2024-03-11,Paid,Missing amount',
    '1006,Katherine Johnson,West,560.25,2024-03-18,Refunded,'
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'orders.csv');
  const uploaded = await request('/datasets/upload', { method: 'POST', token, form });
  assert.strictEqual(uploaded.response.status, 202);
  const datasetId = uploaded.json.data.id;
  const ready = await waitForDataset(token, datasetId);
  assert.strictEqual(ready.rowCount, 6);
  assert.strictEqual(ready.duplicateCount, 2);
  assert.ok(ready.missingValueCount > 0);

  await request(`/datasets/${datasetId}`, { token: otherToken, expectStatus: 404 });

  const detail = await request(`/datasets/${datasetId}`, { token });
  const column = (name) => detail.json.data.columns.find((item) => item.columnName === name);
  const amount = column('Amount');
  const customer = column('Customer');
  const region = column('Region');
  const status = column('Status');
  const orderDate = column('Order Date');
  assert.strictEqual(amount.dataType, 'number');
  assert.strictEqual(orderDate.dataType, 'date');

  const greater = await request(`/datasets/${datasetId}/records/query`, {
    method: 'POST',
    token,
    body: {
      page: 1,
      pageSize: 25,
      filter: { logic: 'AND', conditions: [{ column: amount.columnKey, operator: 'gt', value: 1000 }] }
    }
  });
  assert.strictEqual(greater.json.data.total, 3);

  const ada = await request(`/datasets/${datasetId}/records/query`, {
    method: 'POST',
    token,
    body: { columnSearch: { [customer.columnKey]: 'Ada' }, pageSize: 10 }
  });
  assert.strictEqual(ada.json.data.total, 2);

  const ranged = await request(`/datasets/${datasetId}/filters/preview`, {
    method: 'POST',
    token,
    body: {
      logic: 'AND',
      conditions: [{ column: orderDate.columnKey, operator: 'date_range', value: { from: '2024-02-01', to: '2024-03-31' } }]
    }
  });
  assert.strictEqual(ranged.json.data.total, 3);

  const emptyAmount = await request(`/datasets/${datasetId}/filters/preview`, {
    method: 'POST',
    token,
    body: { logic: 'AND', conditions: [{ column: amount.columnKey, operator: 'is_empty' }] }
  });
  assert.strictEqual(emptyAmount.json.data.total, 1);

  const either = await request(`/datasets/${datasetId}/filters/preview`, {
    method: 'POST',
    token,
    body: {
      logic: 'OR',
      conditions: [
        { column: region.columnKey, operator: 'eq', value: 'North' },
        { column: status.columnKey, operator: 'eq', value: 'Refunded' }
      ]
    }
  });
  assert.strictEqual(either.json.data.total, 4);

  const saved = await request('/filters', {
    method: 'POST',
    token,
    body: {
      datasetId,
      name: 'North or refunded',
      logic: 'OR',
      conditions: [
        { column: region.columnKey, operator: 'eq', value: 'North' },
        { column: status.columnKey, operator: 'eq', value: 'Refunded' }
      ]
    }
  });
  const filters = await request(`/filters?datasetId=${datasetId}`, { token });
  assert.ok(filters.json.data.some((filter) => filter.id === saved.json.data.id));

  const analytics = await request(`/datasets/${datasetId}/analytics`, { token });
  assert.strictEqual(analytics.json.data.totalRecords, 6);
  assert.ok(analytics.json.data.numeric);
  assert.ok(analytics.json.data.category.buckets.length > 0);
  assert.ok(analytics.json.data.dates.buckets.length > 0);

  const dashboard = await request('/dashboard', { token });
  assert.ok(dashboard.json.data.kpis.totalDatasets >= 1);
  const notifications = await request('/notifications', { token });
  assert.ok(notifications.json.data.length >= 1);

  for (const format of ['csv', 'xlsx', 'pdf']) {
    const queued = await request('/reports', {
      method: 'POST',
      token,
      body: {
        title: `Orders ${format}`,
        datasetId,
        format,
        columns: detail.json.data.columns.map((item) => item.columnKey),
        savedFilterId: saved.json.data.id
      }
    });
    const finished = await waitForReport(token, queued.json.data.id);
    assert.strictEqual(finished.report.recordCount, 4);
    const download = await request(`/reports/${queued.json.data.id}/download`, { token });
    assert.ok(download.buffer.length > 50);
    if (format === 'pdf') assert.ok(download.buffer.subarray(0, 4).toString() === '%PDF');
    if (format === 'xlsx') assert.ok(download.buffer[0] === 0x50 && download.buffer[1] === 0x4b);
    if (format === 'csv') assert.ok(download.buffer.toString('utf8').includes('Customer'));
  }

  const history = await request('/reports/history', { token });
  assert.ok(history.json.data.some((item) => item.action === 'completed'));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sda-xlsx-'));
  const xlsxPath = path.join(directory, 'staff.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Staff');
  sheet.addRow(['Name', 'Score']);
  sheet.addRow(['Ada', 10]);
  sheet.addRow(['Grace', 12]);
  await workbook.xlsx.writeFile(xlsxPath);
  const xlsxForm = new FormData();
  const xlsxBytes = fs.readFileSync(xlsxPath);
  xlsxForm.append('file', new Blob([xlsxBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'staff.xlsx');
  const xlsxUpload = await request('/datasets/upload', { method: 'POST', token, form: xlsxForm });
  const xlsxReady = await waitForDataset(token, xlsxUpload.json.data.id);
  assert.strictEqual(xlsxReady.rowCount, 2);

  await request('/auth/preferences', {
    method: 'PUT',
    token,
    body: { defaultPageSize: 50, trimWhitespace: true, treatEmptyAsNull: true }
  });
  await request('/auth/password', {
    method: 'PUT',
    token,
    body: { currentPassword: password, newPassword: 'Secret456' }
  });
  await request('/auth/login', { method: 'POST', body: { email, password: 'Secret456' } });

  const reset = await request('/auth/forgot-password', { method: 'POST', body: { email } });
  assert.ok(reset.json.data.resetUrl);
  const resetUrl = new URL(reset.json.data.resetUrl);
  await request('/auth/reset-password', {
    method: 'POST',
    body: {
      email,
      token: resetUrl.searchParams.get('token'),
      password: 'Secret789'
    }
  });
  await request('/auth/login', { method: 'POST', body: { email, password: 'Secret789' } });

  await request(`/datasets/${datasetId}`, { method: 'DELETE', token });
  await request(`/datasets/${datasetId}`, { token, expectStatus: 404 });
  console.log('Smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
