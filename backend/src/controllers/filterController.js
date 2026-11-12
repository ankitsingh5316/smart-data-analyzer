const filterService = require('../services/filterService');

async function list(req, res) {
  const data = await filterService.listFilters(req.user.id, req.query.datasetId);
  res.json({ success: true, message: 'Saved filters loaded.', data });
}

async function detail(req, res) {
  const data = await filterService.getOwnedFilter(req.user.id, req.params.id);
  const { mapFilter } = require('../models/mappers');
  res.json({ success: true, message: 'Filter loaded.', data: mapFilter(data) });
}

async function create(req, res) {
  const data = await filterService.createFilter(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'Filter saved.', data });
}

async function update(req, res) {
  const data = await filterService.updateFilter(req.user.id, req.params.id, req.body);
  res.json({ success: true, message: 'Filter updated.', data });
}

async function remove(req, res) {
  await filterService.deleteFilter(req.user.id, req.params.id);
  res.json({ success: true, message: 'Filter deleted.' });
}

module.exports = { list, detail, create, update, remove };
