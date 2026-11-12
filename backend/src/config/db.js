const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { env } = require('./env');

const schemaPath = path.join(__dirname, '../../../database/schema.sql');
let pool;

function sslOptions() {
  if (!env.db.ssl) return undefined;
  const ca = env.db.sslCa || decodeCa(process.env.DB_SSL_CA_BASE64);
  if (!ca) return { rejectUnauthorized: false };
  return { ca, rejectUnauthorized: true };
}

function decodeCa(value) {
  if (!value) return '';
  return Buffer.from(value, 'base64').toString('utf8');
}

function connectionOptions(includeDatabase) {
  const options = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: includeDatabase ? env.db.database : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    decimalNumbers: true,
    timezone: 'Z',
    multipleStatements: false
  };
  const ssl = sslOptions();
  if (ssl) options.ssl = ssl;
  return options;
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool is not initialized.');
  }
  return pool;
}

function splitSql(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runSchema(targetPool) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSql(sql);
  for (const statement of statements) {
    await targetPool.query(statement);
  }
}

function connectionError(error) {
  if (error && error.code === 'ER_ACCESS_DENIED_ERROR') {
    return new Error(
      'MySQL refused the login. Set DB_USER and DB_PASSWORD to the hosted database account.'
    );
  }
  return new Error(`Could not connect to MySQL at ${env.db.host}:${env.db.port}. ${error.message}`);
}

async function initDatabase() {
  try {
    pool = mysql.createPool(connectionOptions(true));
    await pool.query('SELECT 1 AS ok');
  } catch (error) {
    if (pool) {
      await pool.end();
      pool = null;
    }
    if (!error || error.code !== 'ER_BAD_DB_ERROR') throw connectionError(error);
    let admin;
    try {
      admin = await mysql.createConnection(connectionOptions(false));
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } catch (createError) {
      throw connectionError(createError);
    } finally {
      if (admin) await admin.end();
    }
    pool = mysql.createPool(connectionOptions(true));
    await pool.query('SELECT 1 AS ok');
  }

  await runSchema(pool);
  return pool;
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  initDatabase,
  closeDatabase,
  runSchema
};
