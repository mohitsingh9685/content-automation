const express = require('express');
const {
  updateScriptSchema,
  regenerateScriptSchema,
  approvalSchema,
  publishVideoSchema,
  listVideos,
  getVideoById,
  updateVideoScript,
  regenerateVideoScript,
  renderVideo,
  approveVideo,
  rejectVideo,
  publishVideo,
  deleteVideo,
} = require('../controllers/videosController');
const { validateBody, validateIdParam } = require('../middlewares/validate');
const { generationRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.get('/', listVideos);
router.get('/:id', validateIdParam('id'), getVideoById);
router.patch('/:id/script', validateIdParam('id'), validateBody(updateScriptSchema), updateVideoScript);
router.post(
  '/:id/regenerate',
  generationRateLimiter,
  validateIdParam('id'),
  validateBody(regenerateScriptSchema),
  regenerateVideoScript
);
router.post('/:id/render', generationRateLimiter, validateIdParam('id'), renderVideo);
router.post(
  '/:id/scenes/:sceneNumber/render',
  generationRateLimiter,
  validateIdParam('id'),
  renderVideo
);
router.post('/:id/approve', validateIdParam('id'), validateBody(approvalSchema), approveVideo);
router.post('/:id/reject', validateIdParam('id'), validateBody(approvalSchema), rejectVideo);
router.post(
  '/:id/publish',
  generationRateLimiter,
  validateIdParam('id'),
  validateBody(publishVideoSchema),
  publishVideo
);
router.delete('/:id', validateIdParam('id'), deleteVideo);

module.exports = router;
