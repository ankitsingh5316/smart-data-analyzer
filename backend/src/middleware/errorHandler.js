const multer = require('multer');

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'API route not found.' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File exceeds the 25 MB limit.'
      : 'The upload could not be accepted.';
    res.status(400).json({ success: false, message });
    return;
  }
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Request body must be valid JSON.' });
    return;
  }

  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error(err);
  }
  const message = status >= 500 && !err.isOperational
    ? 'Something went wrong. Please try again.'
    : err.message;
  res.status(status).json({
    success: false,
    message,
    errors: err.errors || undefined
  });
}

module.exports = { notFound, errorHandler };
