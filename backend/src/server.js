const { app } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { runMigrations } = require('./db/migrate');
const { runSeed } = require('./db/seed');
const { startJobWorker } = require('./jobs/jobQueue');

async function bootstrap() {
  try {
    await runMigrations();
    await runSeed();
    startJobWorker(3000);

    app.listen(env.port, () => {
      logger.info(`Hindi Trend AI Backend running on http://localhost:${env.port}`);
    });
  } catch (err) {
    logger.error('Failed to bootstrap backend server', { error: err.message });
    process.exit(1);
  }
}

bootstrap();
