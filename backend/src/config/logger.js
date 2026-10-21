function formatLog(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  };
  return JSON.stringify(payload);
}

const logger = {
  info(message, meta = {}) {
    console.log(formatLog('INFO', message, meta));
  },
  warn(message, meta = {}) {
    console.warn(formatLog('WARN', message, meta));
  },
  error(message, meta = {}) {
    console.error(formatLog('ERROR', message, meta));
  },
  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatLog('DEBUG', message, meta));
    }
  },
};

module.exports = { logger };
