const fs = require('fs/promises');
const datasetService = require('../services/datasetService');
const queryService = require('../services/queryService');

async function upload(req, res) {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Choose a CSV or Excel file to upload.' });
    return;
  }
  const data = await datasetService.createFromUpload(req.user.id, req.file, req.body.name);
  res.status(202).json({ success: true, message: 'Upload received. Processing has started.', data });
}

async function list(req, res) {
  const data = await datasetService.listDatasets(req.user.id, req.query.search);
  res.json({ success: true, message: 'Datasets loaded.', data });
}

async function detail(req, res) {
  const data = await datasetService.getDataset(req.user.id, req.params.id);
  res.json({ success: true, message: 'Dataset loaded.', data });
}

async function status(req, res) {
  const data = await datasetService.getStatus(req.user.id, req.params.id);
  res.json({ success: true, message: 'Status loaded.', data });
}

async function rename(req, res) {
  const data = await datasetService.renameDataset(req.user.id, req.params.id, req.body.name);
  res.json({ success: true, message: 'Dataset renamed.', data });
}

async function remove(req, res) {
  await datasetService.deleteDataset(req.user.id, req.params.id);
  res.json({ success: true, message: 'Dataset deleted.' });
}

async function query(req, res) {
  const data = await queryService.queryRecords(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: 'Records loaded.', data });
}

async function previewCount(req, res) {
  const data = await queryService.countRecords(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: 'Filtered count ready.', data });
}

const EXPORT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf'
};

async function exportFile(req, res, next) {
  let file;
  try {
    file = await queryService.exportRecords(req.user.id, req.params.id, req.body || {});
  } catch (error) {
    next(error);
    return;
  }
  res.type(EXPORT_TYPES[file.format] || 'application/octet-stream');
  res.download(file.filePath, file.fileName, () => {
    fs.unlink(file.filePath).catch(() => undefined);
  });
}

module.exports = {
  upload,
  list,
  detail,
  status,
  rename,
  remove,
  query,
  previewCount,
  exportFile
};
