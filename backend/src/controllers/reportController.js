const reportService = require('../services/reportService');

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf'
};

async function create(req, res) {
  const data = await reportService.createReport(req.user.id, req.body);
  res.status(202).json({ success: true, message: 'Report queued.', data });
}

async function list(req, res) {
  const data = await reportService.listReports(req.user.id);
  res.json({ success: true, message: 'Reports loaded.', data });
}

async function detail(req, res) {
  const data = await reportService.getReport(req.user.id, req.params.id);
  res.json({ success: true, message: 'Report loaded.', data });
}

async function history(req, res) {
  const data = await reportService.listHistory(req.user.id);
  res.json({ success: true, message: 'Report history loaded.', data });
}

async function download(req, res, next) {
  try {
    const file = await reportService.downloadReport(req.user.id, req.params.id);
    res.type(CONTENT_TYPES[file.format] || 'application/octet-stream');
    res.download(file.filePath, file.fileName, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res) {
  await reportService.deleteReport(req.user.id, req.params.id);
  res.json({ success: true, message: 'Report deleted.' });
}

module.exports = { create, list, detail, history, download, remove };
