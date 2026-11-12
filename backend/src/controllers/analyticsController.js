const analyticsService = require('../services/analyticsService');

async function show(req, res) {
  const data = await analyticsService.getAnalytics(req.user.id, req.params.id, {
    numeric: req.query.numeric,
    category: req.query.category,
    date: req.query.date
  });
  res.json({ success: true, message: 'Analytics ready.', data });
}

module.exports = { show };
