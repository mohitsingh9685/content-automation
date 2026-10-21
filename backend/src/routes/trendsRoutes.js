const express = require('express');
const {
  generateFromTrendSchema,
  createCustomTopicSchema,
  listTrends,
  discoverLiveTrends,
  createCustomTopic,
  getRecommendedTrend,
  generateVideoFromTrend,
  deleteTrend,
} = require('../controllers/trendsController');
const { validateBody, validateIdParam } = require('../middlewares/validate');
const { generationRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.get('/', listTrends);
router.get('/recommended', getRecommendedTrend);
router.post('/discover', generationRateLimiter, discoverLiveTrends);
router.post(
  '/custom',
  generationRateLimiter,
  validateBody(createCustomTopicSchema),
  createCustomTopic
);
router.post(
  '/:id/generate',
  generationRateLimiter,
  validateIdParam('id'),
  validateBody(generateFromTrendSchema),
  generateVideoFromTrend
);
router.delete('/:id', validateIdParam('id'), deleteTrend);

module.exports = router;
