const { assertRuntimeConfig } = require('../config/env');
const { initDatabase, closeDatabase } = require('../config/db');

async function main() {
  assertRuntimeConfig();
  await initDatabase();
  console.log('Database is ready.');
  await closeDatabase();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
