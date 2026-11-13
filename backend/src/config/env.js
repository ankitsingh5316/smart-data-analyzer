const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

function databaseName() {
  const value = process.env.DB_NAME || 'smart_data_analyzer';
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error('DB_NAME must contain only letters, numbers, and underscores.');
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:4200',
  db: {
    client: process.env.DB_CLIENT || 'mysql',
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: databaseName(),
    ssl: process.env.DB_SSL === 'true',
    sslCa: process.env.DB_SSL_CA || ''
  },
  exposeAuthCodes: process.env.EXPOSE_AUTH_CODES === 'true',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Smart Data Analyzer <noreply@localhost>'
  }
};

function assertRuntimeConfig() {
  if (!env.jwtSecret || env.jwtSecret === 'your_secret' || env.jwtSecret.length < 24) {
    throw new Error('Set a unique JWT_SECRET of at least 24 characters in backend/.env.');
  }
  if (!Number.isFinite(env.port) || env.port <= 0) {
    throw new Error('PORT must be a positive number.');
  }
  if (env.db.client === 'postgres') {
    if (!env.db.url) throw new Error('Set DATABASE_URL for the hosted Postgres database.');
    return;
  }
  if (!Number.isFinite(env.db.port) || env.db.port <= 0) {
    throw new Error('DB_PORT must be a positive number.');
  }
}

module.exports = { env, assertRuntimeConfig };
