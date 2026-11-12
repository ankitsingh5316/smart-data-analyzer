const { env, assertRuntimeConfig } = require('./config/env');
const { initDatabase, closeDatabase } = require('./config/db');
const { createApp } = require('./app');
const { resumeImports } = require('./services/importService');
const { resumeReports } = require('./services/reportService');

async function main() {
  assertRuntimeConfig();
  await initDatabase();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Smart Data Analyzer API listening on http://localhost:${env.port}`);
  });
  await resumeImports();
  await resumeReports();

  async function shutdown() {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
