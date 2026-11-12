const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/authenticate');
const { upload } = require('../middleware/upload');
const { validateBody } = require('../middleware/validate');
const authValidators = require('../validators/authValidators');
const authController = require('../controllers/authController');
const datasetController = require('../controllers/datasetController');
const filterController = require('../controllers/filterController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const dashboardController = require('../controllers/dashboardController');
const { getPool } = require('../config/db');
const { env } = require('../config/env');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in a few minutes.' }
});

router.get('/health', asyncHandler(async (req, res) => {
  await getPool().query('SELECT 1 AS ok');
  res.json({
    success: true,
    message: 'ok',
    data: { service: 'smart-data-analyzer', database: env.db.database }
  });
}));

router.post('/auth/signup', authLimiter, validateBody(authValidators.validateSignup), asyncHandler(authController.signup));
router.post('/auth/signup/verify', authLimiter, validateBody(authValidators.validateVerifyOtp), asyncHandler(authController.verifySignup));
router.post('/auth/login', authLimiter, validateBody(authValidators.validateLogin), asyncHandler(authController.login));
router.post('/auth/forgot-password', authLimiter, validateBody(authValidators.validateForgot), asyncHandler(authController.forgotPassword));
router.post('/auth/reset-password', authLimiter, validateBody(authValidators.validateReset), asyncHandler(authController.resetPassword));
router.get('/auth/me', authenticate, asyncHandler(authController.me));
router.put('/auth/profile', authenticate, validateBody(authValidators.validateProfile), asyncHandler(authController.updateProfile));
router.put('/auth/password', authenticate, validateBody(authValidators.validatePasswordChange), asyncHandler(authController.changePassword));
router.put('/auth/preferences', authenticate, validateBody(authValidators.validatePreferences), asyncHandler(authController.updatePreferences));

router.get('/dashboard', authenticate, asyncHandler(dashboardController.summary));
router.get('/notifications', authenticate, asyncHandler(dashboardController.notifications));

router.post('/datasets/upload', authenticate, upload.single('file'), asyncHandler(datasetController.upload));
router.get('/datasets', authenticate, asyncHandler(datasetController.list));
router.get('/datasets/:id', authenticate, asyncHandler(datasetController.detail));
router.get('/datasets/:id/status', authenticate, asyncHandler(datasetController.status));
router.patch('/datasets/:id', authenticate, asyncHandler(datasetController.rename));
router.delete('/datasets/:id', authenticate, asyncHandler(datasetController.remove));
router.post('/datasets/:id/records/query', authenticate, asyncHandler(datasetController.query));
router.post('/datasets/:id/filters/preview', authenticate, asyncHandler(datasetController.previewCount));
router.post('/datasets/:id/export', authenticate, datasetController.exportFile);
router.get('/datasets/:id/analytics', authenticate, asyncHandler(analyticsController.show));

router.get('/filters', authenticate, asyncHandler(filterController.list));
router.post('/filters', authenticate, asyncHandler(filterController.create));
router.get('/filters/:id', authenticate, asyncHandler(filterController.detail));
router.put('/filters/:id', authenticate, asyncHandler(filterController.update));
router.delete('/filters/:id', authenticate, asyncHandler(filterController.remove));

router.post('/reports', authenticate, asyncHandler(reportController.create));
router.get('/reports', authenticate, asyncHandler(reportController.list));
router.get('/reports/history', authenticate, asyncHandler(reportController.history));
router.get('/reports/:id', authenticate, asyncHandler(reportController.detail));
router.get('/reports/:id/download', authenticate, reportController.download);
router.delete('/reports/:id', authenticate, asyncHandler(reportController.remove));

module.exports = router;
