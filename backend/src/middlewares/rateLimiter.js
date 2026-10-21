const rateLimit = require('express-rate-limit');

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many API requests from this IP, please wait a moment and try again.',
  },
});

const generationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Rate limit reached for AI/video generation triggers. Please wait 60 seconds.',
  },
});

module.exports = {
  apiRateLimiter,
  generationRateLimiter,
};
