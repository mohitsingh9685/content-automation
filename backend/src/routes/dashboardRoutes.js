const express = require('express');
const {
  getDashboardSummary,
  getGeminiModels,
  getPresenterProfile,
} = require('../controllers/dashboardController');

const router = express.Router();

router.get('/summary', getDashboardSummary);
router.get('/ai-models', getGeminiModels);
router.get('/presenter', getPresenterProfile);

module.exports = router;
