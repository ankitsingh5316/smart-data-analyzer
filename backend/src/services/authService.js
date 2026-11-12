const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { env } = require('../config/env');
const { getPool } = require('../config/db');
const { AppError } = require('../utils/AppError');
const { DEFAULT_PREFERENCES } = require('../utils/constants');
const { hashPassword, verifyPassword } = require('../utils/passwords');
const { signAccessToken, createResetToken, hashResetToken } = require('../utils/tokens');
const { mapUser, normalizePreferences } = require('../models/mappers');

const RESET_MINUTES = 30;

async function accountCounts(userId) {
  const [rows] = await getPool().query(
    `SELECT
       (SELECT COUNT(*) FROM datasets WHERE user_id = ?) AS datasetCount,
       (SELECT COUNT(*) FROM reports WHERE user_id = ?) AS reportCount`,
    [userId, userId]
  );
  return rows[0];
}

async function findByEmail(email) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await getPool().query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

function authPayload(user) {
  return {
    token: signAccessToken(user),
    user: mapUser(user)
  };
}

const OTP_MINUTES = 10;

async function sendOtpEmail(email, otp) {
  if (!env.smtp.host) return false;
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
  });
  await transporter.sendMail({
    from: env.smtp.from,
    to: email,
    subject: 'Your Smart Data Analyzer code',
    text: `Your verification code is ${otp}. It expires in ${OTP_MINUTES} minutes.`
  });
  return true;
}

async function requestSignupOtp({ name, email, password }) {
  const existing = await findByEmail(email);
  if (existing) {
    throw new AppError('An account with that email already exists.', 409);
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const passwordHash = await hashPassword(password);
  await getPool().query('DELETE FROM signup_otps WHERE email = ?', [email]);
  await getPool().query(
    `INSERT INTO signup_otps (id, name, email, password_hash, otp_hash, expires_at, attempts)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), 0)`,
    [crypto.randomUUID(), name, email, passwordHash, otpHash, OTP_MINUTES]
  );
  const delivered = await sendOtpEmail(email, otp);
  const data = { otpRequired: true, email, delivered, expiresInMinutes: OTP_MINUTES };
  if (!delivered && (env.exposeAuthCodes || env.nodeEnv !== 'production')) data.devOtp = otp;
  return data;
}

async function verifySignupOtp({ email, otp }) {
  const code = String(otp || '').trim();
  const [rows] = await getPool().query(
    `SELECT * FROM signup_otps WHERE email = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const record = rows[0];
  if (!record) throw new AppError('This code is invalid or has expired. Request a new one.', 400);
  if (Number(record.attempts) >= 5) throw new AppError('Too many incorrect codes. Request a new one.', 429);
  const given = crypto.createHash('sha256').update(code).digest('hex');
  const matches = crypto.timingSafeEqual(Buffer.from(record.otp_hash, 'hex'), Buffer.from(given, 'hex'));
  if (!matches) {
    await getPool().query('UPDATE signup_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    throw new AppError('That code is incorrect.', 400);
  }
  const existing = await findByEmail(email);
  if (existing) throw new AppError('An account with that email already exists.', 409);

  const userId = crypto.randomUUID();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO users (id, name, email, password_hash, preferences) VALUES (?, ?, ?, ?, ?)`,
      [userId, record.name, record.email, record.password_hash, JSON.stringify(DEFAULT_PREFERENCES)]
    );
    await connection.query('DELETE FROM signup_otps WHERE email = ?', [email]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return authPayload(await findById(userId));
}

async function login({ email, password }) {
  const user = await findByEmail(email);
  const matches = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !matches) {
    throw new AppError('The email or password is incorrect.', 401);
  }
  await getPool().query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  const fresh = await findById(user.id);
  return authPayload(fresh);
}

async function getProfile(userId) {
  const user = await findById(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const counts = await accountCounts(userId);
  return mapUser(user, counts);
}

async function updateProfile(userId, { name, email }) {
  const current = await findById(userId);
  if (!current) throw new AppError('Account not found.', 404);
  if (email !== current.email) {
    const existing = await findByEmail(email);
    if (existing) throw new AppError('An account with that email already exists.', 409);
  }
  await getPool().query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId]);
  return getProfile(userId);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await findById(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const matches = await verifyPassword(currentPassword, user.password_hash);
  if (!matches) throw new AppError('The current password is incorrect.', 400);
  const passwordHash = await hashPassword(newPassword);
  await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

async function updatePreferences(userId, preferences) {
  const user = await findById(userId);
  if (!user) throw new AppError('Account not found.', 404);
  const next = normalizePreferences({ ...user.preferences, ...preferences });
  await getPool().query('UPDATE users SET preferences = ? WHERE id = ?', [JSON.stringify(next), userId]);
  return getProfile(userId);
}

async function deliverResetEmail(user, resetUrl) {
  if (!env.smtp.host) return false;
  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
  });
  await transporter.sendMail({
    from: env.smtp.from,
    to: user.email,
    subject: 'Reset your Smart Data Analyzer password',
    text: `A password reset was requested for your Smart Data Analyzer account.\n\n${resetUrl}\n\nThis link expires in ${RESET_MINUTES} minutes. If you did not request it, you can ignore this email.`
  });
  return true;
}

async function forgotPassword({ email }) {
  const user = await findByEmail(email);
  const response = { delivered: false };
  if (!user) return response;

  const { token, tokenHash } = createResetToken();
  const id = crypto.randomUUID();
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );
    await connection.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))`,
      [id, user.id, tokenHash, RESET_MINUTES]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const resetUrl = `${env.clientOrigin}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
  const delivered = await deliverResetEmail(user, resetUrl);
  response.delivered = delivered;
  if (!delivered && (env.exposeAuthCodes || env.nodeEnv !== 'production')) {
    response.resetUrl = resetUrl;
  }
  return response;
}

async function resetPassword({ email, token, password }) {
  const user = await findByEmail(email);
  if (!user) throw new AppError('This reset link is invalid or has expired.', 400);
  const tokenHash = hashResetToken(token);
  const [rows] = await getPool().query(
    `SELECT id, token_hash FROM password_reset_tokens
     WHERE user_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const record = rows[0];
  const stored = record ? Buffer.from(record.token_hash, 'hex') : null;
  const given = Buffer.from(tokenHash, 'hex');
  const matches = stored && stored.length === given.length && crypto.timingSafeEqual(stored, given);
  if (!matches) throw new AppError('This reset link is invalid or has expired.', 400);

  const passwordHash = await hashPassword(password);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
    await connection.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [record.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  requestSignupOtp,
  verifySignupOtp,
  login,
  getProfile,
  updateProfile,
  changePassword,
  updatePreferences,
  forgotPassword,
  resetPassword
};
