const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { env } = require('./env');

const schemaPath = path.join(__dirname, '../../../database/schema.sql');
let pool;

function connectionOptions(includeDatabase) {
  return {
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

async function initDatabase() {
  let admin;
  try {
    admin = await mysql.createConnection(connectionOptions(false));
  } catch (error) {
    if (error && error.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error(
        'MySQL refused the login in backend/.env. Set DB_USER and DB_PASSWORD to your local MySQL account. The server is running, but this app does not have the password.'
      );
    }
    throw new Error(`Could not connect to MySQL at ${env.db.host}:${env.db.port}. ${error.message}`);
  }

  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }

  pool = mysql.createPool(connectionOptions(true));
  await runSchema(pool);
  await pool.query('SELECT 1 AS ok');
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
