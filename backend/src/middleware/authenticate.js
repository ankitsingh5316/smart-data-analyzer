const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new AppError('Sign in to continue.', 401);
    }
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (error) {
      throw new AppError('Your session has expired. Sign in again.', 401);
    }
    const [rows] = await getPool().query('SELECT id, email FROM users WHERE id = ?', [payload.sub]);
    if (!rows[0]) {
      throw new AppError('Sign in to continue.', 401);
    }
    req.user = { id: rows[0].id, email: rows[0].email };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
