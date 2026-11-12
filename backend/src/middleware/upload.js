const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { AppError } = require('../utils/AppError');
const { MAX_FILE_BYTES } = require('../utils/constants');
const { uploadDir } = require('../utils/paths');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${extension}`);
  }
});

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
    cb(new AppError('Upload a CSV, XLSX, or XLS file.', 400));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

module.exports = { upload };
