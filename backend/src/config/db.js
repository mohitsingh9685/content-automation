const { Pool } = require('pg');
const { env } = require('./env');
const { logger } = require('./logger');

const pool = new Pool({
  connectionString: env.db.connectionString,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function checkDbHealth() {
  try {
    const res = await pool.query('SELECT NOW() AS now');
    return { healthy: true, timestamp: res.rows[0].now };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

module.exports = {
  pool,
  query,
  checkDbHealth,
};
