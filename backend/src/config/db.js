const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { env } = require('./env');
const { toPostgres } = require('./sqlDialect');

const schemaPath = path.join(__dirname, '../../../database/schema.sql');
const postgresSchemaPath = path.join(__dirname, '../../../database/schema.pg.sql');
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

async function runSchema(targetPool, filePath = schemaPath) {
  const sql = fs.readFileSync(filePath, 'utf8');
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

const JSON_FIELDS = ['data', 'preferences', 'conditions', 'selected_columns', 'filter_snapshot', 'summary'];

function coerceJsonParams(sql, params) {
  if (!params || !params.length) return params;
  const lower = String(sql).toLowerCase();
  if (!JSON_FIELDS.some((field) => lower.includes(field))) return params;
  return params.map((value) => {
    if (typeof value !== 'string' || (!value.startsWith('{') && !value.startsWith('['))) return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  });
}

function createPostgresPool() {
  const { Pool } = require('pg');
  const { types } = require('pg');
  types.setTypeParser(20, (value) => Number(value));
  const pgPool = new Pool({
    connectionString: env.db.url,
    ssl: { rejectUnauthorized: false },
    max: 10
  });

  function wrap(client) {
    return {
      async query(sql, params = []) {
        const result = await client.query(toPostgres(sql), coerceJsonParams(sql, params));
        return [result.rows];
      },
      async beginTransaction() {
        await client.query('BEGIN');
      },
      async commit() {
        await client.query('COMMIT');
      },
      async rollback() {
        await client.query('ROLLBACK');
      },
      release() {
        client.release();
      }
    };
  }

  return {
    query(sql, params) {
      return wrap(pgPool).query(sql, params);
    },
    async getConnection() {
      return wrap(await pgPool.connect());
    },
    async end() {
      await pgPool.end();
    }
  };
}

async function initDatabase() {
  if (env.db.client === 'postgres') {
    pool = createPostgresPool();
    await runSchema(pool, postgresSchemaPath);
    await pool.query('SELECT 1 AS ok');
    return pool;
  }
  return initMysql();
}

async function initMysql() {
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
