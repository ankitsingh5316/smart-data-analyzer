const dashboardService = require('../services/dashboardService');

async function summary(req, res) {
  const data = await dashboardService.getDashboard(req.user.id);
  res.json({ success: true, message: 'Dashboard loaded.', data });
}

async function notifications(req, res) {
  const data = await dashboardService.listNotifications(req.user.id);
  res.json({ success: true, message: 'Notifications loaded.', data });
}

module.exports = { summary, notifications };
