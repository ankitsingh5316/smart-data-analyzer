const { getPool } = require('../config/db');
const { mapDataset, mapReport } = require('../models/mappers');

function isoDay(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function recentDays(count) {
  const days = [];
  const today = new Date();
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(cursor);
    day.setUTCDate(cursor.getUTCDate() - offset);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

async function getDashboard(userId) {
  const [totalsRows] = await getPool().query(
    `SELECT
       COUNT(*) AS totalDatasets,
       COALESCE(SUM(row_count), 0) AS totalRecords,
       COALESCE(SUM(CASE WHEN status = 'ready' THEN row_count ELSE 0 END), 0) AS processedRecords,
       COALESCE(SUM(duplicate_count), 0) AS duplicateRecords
     FROM datasets
     WHERE user_id = ?`,
    [userId]
  );
  const [reportRows] = await getPool().query(
    `SELECT COUNT(*) AS totalReports FROM reports WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  const [statusRows] = await getPool().query(
    `SELECT status, COUNT(*) AS count FROM datasets WHERE user_id = ? GROUP BY status`,
    [userId]
  );
  const [datasetRows] = await getPool().query(
    `SELECT * FROM datasets WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
    [userId]
  );
  const [volumeRows] = await getPool().query(
    `SELECT name, row_count FROM datasets WHERE user_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 8`,
    [userId]
  );
  const [recentReportRows] = await getPool().query(
    `SELECT reports.*, datasets.name AS dataset_name
     FROM reports
     LEFT JOIN datasets ON datasets.id = reports.dataset_id
     WHERE reports.user_id = ?
     ORDER BY reports.created_at DESC
     LIMIT 5`,
    [userId]
  );
  const [trendRows] = await getPool().query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS count
     FROM reports
     WHERE user_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 13 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day`,
    [userId]
  );

  const trendMap = new Map(trendRows.map((row) => [isoDay(row.day), Number(row.count)]));
  const totals = totalsRows[0];
  return {
    kpis: {
      totalDatasets: Number(totals.totalDatasets),
      totalRecords: Number(totals.totalRecords),
      processedRecords: Number(totals.processedRecords),
      duplicateRecords: Number(totals.duplicateRecords),
      totalReports: Number(reportRows[0].totalReports)
    },
    status: statusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
    recordVolume: volumeRows.map((row) => ({ label: row.name, count: Number(row.row_count) })).reverse(),
    reportTrend: recentDays(14).map((day) => ({ label: day.slice(5), count: trendMap.get(day) || 0 })),
    recentDatasets: datasetRows.map(mapDataset),
    recentReports: recentReportRows.map(mapReport)
  };
}

async function listNotifications(userId) {
  const [datasets] = await getPool().query(
    `SELECT id, name, status, created_at FROM datasets WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
    [userId]
  );
  const [reports] = await getPool().query(
    `SELECT id, title, status, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
    [userId]
  );
  return [
    ...datasets.map((row) => ({
      id: `dataset-${row.id}`,
      type: 'dataset',
      title: row.name,
      status: row.status,
      createdAt: row.created_at,
      href: '/app/datasets'
    })),
    ...reports.map((row) => ({
      id: `report-${row.id}`,
      type: 'report',
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      href: '/app/reports'
    }))
  ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 8);
}

module.exports = { getDashboard, listNotifications };
