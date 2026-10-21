const { logger } = require('../config/logger');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  logger.error('Request error', {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    error: err.message,
  });

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
