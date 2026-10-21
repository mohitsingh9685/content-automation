const videoProgressMap = new Map();
const topicProgressMap = new Map();

/**
 * Updates live creation percentage (0..100) and human-readable stage for a video/topic.
 */
function setRenderProgress({
  videoId = null,
  topicId = null,
  percent = 0,
  stage = 'Starting...',
  sceneNumber = null,
  totalScenes = 5,
  active = true,
}) {
  const entry = {
    videoId: videoId ? Number(videoId) : null,
    topicId: topicId ? Number(topicId) : null,
    percent: Math.max(0, Math.min(100, Math.round(Number(percent) || 0))),
    stage: String(stage || ''),
    sceneNumber: sceneNumber ? Number(sceneNumber) : null,
    totalScenes: Number(totalScenes) || 5,
    active: Boolean(active),
    updatedAt: new Date().toISOString(),
  };

  if (entry.videoId) {
    videoProgressMap.set(entry.videoId, entry);
  }
  if (entry.topicId) {
    topicProgressMap.set(entry.topicId, entry);
  }
  return entry;
}

/**
 * Retrieves the current creation progress for a videoId or topicId.
 */
function getRenderProgress(videoId = null, topicId = null) {
  if (videoId && videoProgressMap.has(Number(videoId))) {
    return videoProgressMap.get(Number(videoId));
  }
  if (topicId && topicProgressMap.has(Number(topicId))) {
    return topicProgressMap.get(Number(topicId));
  }
  return null;
}

/**
 * Clears progress or marks it 100% complete.
 */
function clearRenderProgress(videoId = null, topicId = null) {
  if (videoId) videoProgressMap.delete(Number(videoId));
  if (topicId) topicProgressMap.delete(Number(topicId));
}

module.exports = {
  setRenderProgress,
  getRenderProgress,
  clearRenderProgress,
};
