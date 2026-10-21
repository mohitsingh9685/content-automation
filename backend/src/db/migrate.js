const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { logger } = require('../config/logger');

async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  logger.info('Running PostgreSQL schema migrations...');
  await pool.query(sql);
  logger.info('PostgreSQL schema migrations completed successfully.');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { runMigrations };
