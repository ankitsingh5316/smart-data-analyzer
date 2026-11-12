const path = require('path');
const { AppError } = require('./AppError');

const storageRoot = path.join(__dirname, '../../storage');
const uploadDir = path.join(storageRoot, 'uploads');
const reportDir = path.join(storageRoot, 'reports');

function assertInside(root, filePath) {
  const resolved = path.resolve(filePath);
  const base = path.resolve(root);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppError('Stored file path is not allowed.', 400);
  }
  return resolved;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

module.exports = {
  storageRoot,
  uploadDir,
  reportDir,
  assertInside,
  isUuid
};
