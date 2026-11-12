const bcrypt = require('bcrypt');

const ROUNDS = 10;

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && password.length <= 128
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}

function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  isStrongPassword,
  hashPassword,
  verifyPassword
};
