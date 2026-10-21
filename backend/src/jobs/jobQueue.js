const { pool, query } = require('../config/db');
const { logger } = require('../config/logger');
const { generateHindiVideoPackage } = require('../providers/ai/geminiProvider');
const { renderExplainerVideo } = require('../providers/video/videoRenderer');
const { setRenderProgress, clearRenderProgress } = require('../providers/video/renderProgressTracker');

let activeWorkerPromise = null;
let pollInterval = null;

/**
 * Enqueues a background job with idempotency protection so duplicate jobs are never created.
 */
async function enqueueJob({ idempotencyKey, jobType, entityType, entityId, payload = {} }) {
  // Check if an active (pending/processing) job already exists for this entity & type
  const activeCheck = await query(
    `SELECT * FROM jobs
     WHERE job_type = $1
       AND entity_type = $2
       AND entity_id = $3
       AND status IN ('pending', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
    [jobType, entityType, entityId]
  );

  if (activeCheck.rows.length > 0) {
    logger.info('Reusing existing active job to prevent duplicate processing', {
      jobId: activeCheck.rows[0].id,
      jobType,
      entityId,
    });
    return { job: activeCheck.rows[0], deduplicated: true };
  }

  const key = idempotencyKey || `${jobType}-${entityType}-${entityId}-${Date.now()}`;
  const insertRes = await query(
    `INSERT INTO jobs (idempotency_key, job_type, entity_type, entity_id, payload, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [key, jobType, entityType, entityId, JSON.stringify(payload)]
  );

  const job = insertRes.rows[0];
  logger.info('Enqueued background job', { jobId: job.id, jobType, entityId });

  // Trigger worker asynchronously without blocking the HTTP response
  setImmediate(() => {
    processNextJobs().catch((err) => logger.error('Worker trigger error', { error: err.message }));
  });

  return { job, deduplicated: false };
}

/**
 * Handler for 'script_generation': calls Gemini API to produce Hindi explainer package + storyboard
 */
async function handleScriptGenerationJob(job) {
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload || {};
  const {
    topicId,
    videoId,
    customInstructions,
    requestedModel,
    videoFormat = '9:16',
    presenterMode = 'faceless',
    autoRender,
  } = payload;

  const topicRes = await query('SELECT * FROM trending_topics WHERE id = $1', [topicId]);
  if (topicRes.rows.length === 0) {
    throw new Error(`Topic ID ${topicId} not found`);
  }
  const topic = topicRes.rows[0];

  setRenderProgress({
    videoId,
    topicId,
    percent: 6,
    stage: 'Writing Genuine 45s Topic Explainer Script & 5-Scene Storyboard (Gemini)...',
    active: true,
  });

  await query(`UPDATE trending_topics SET status = 'generating', updated_at = NOW() WHERE id = $1`, [topicId]);
  if (videoId) {
    await query(`UPDATE videos SET status = 'processing', updated_at = NOW() WHERE id = $1`, [videoId]);
  }

  const pkg = await generateHindiVideoPackage(topic, {
    customInstructions,
    requestedModel,
    videoFormat,
    presenterMode,
  });

  const resolvedPresenterMode = pkg.presenter_mode || presenterMode || 'faceless';
  const visualSettingsJson = JSON.stringify({
    aspectRatio: pkg.video_format || videoFormat,
    resolution: (pkg.video_format || videoFormat).includes('16:9') ? '1920x1080' : '1080x1920',
    presenterMode: resolvedPresenterMode,
    theme: 'indian_topic_explainer',
    subtitlesBurnedIn: true,
  });

  let finalVideoId = videoId;
  if (!finalVideoId) {
    const existingForTopic = await query(
      'SELECT id FROM videos WHERE topic_id = $1 ORDER BY id ASC LIMIT 1',
      [topicId]
    );
    if (existingForTopic.rows.length > 0) {
      finalVideoId = existingForTopic.rows[0].id;
    }
  }

  if (finalVideoId) {
    await query(
      `UPDATE videos SET
         video_format = $1,
         hindi_title = $2,
         opening_hook = $3,
         what_happened = $4,
         background_timeline = $5,
         why_it_matters = $6,
         conclusion_text = $7,
         narration_script = $8,
         storyboard = $9,
         subtitles_srt = $10,
         subtitles_segments = $11,
         short_description = $12,
         hashtags = $13,
         thumbnail_concept = $14,
         call_to_action = $15,
         source_links = $16,
         fact_check_report = $17,
         ai_model_used = $18,
         duration_seconds = $19,
         visual_settings = $20,
         status = 'awaiting_approval',
         updated_at = NOW()
       WHERE id = $21`,
      [
        pkg.video_format || videoFormat,
        pkg.hindi_title,
        pkg.opening_hook,
        pkg.what_happened || '',
        JSON.stringify(
          Array.isArray(pkg.background_timeline)
            ? pkg.background_timeline
            : pkg.background_timeline
              ? [pkg.background_timeline]
              : []
        ),
        pkg.why_it_matters || '',
        pkg.conclusion_text || '',
        pkg.narration_script,
        JSON.stringify(pkg.storyboard || []),
        pkg.subtitles_srt,
        JSON.stringify(pkg.subtitles_segments),
        pkg.short_description,
        JSON.stringify(pkg.hashtags),
        pkg.thumbnail_concept,
        pkg.call_to_action,
        JSON.stringify(pkg.source_links),
        JSON.stringify(pkg.fact_check_report),
        pkg.ai_model_used,
        pkg.duration_seconds,
        visualSettingsJson,
        finalVideoId,
      ]
    );
  } else {
    const insertVideo = await query(
      `INSERT INTO videos (
         topic_id, video_format, hindi_title, opening_hook,
         what_happened, background_timeline, why_it_matters, conclusion_text,
         narration_script, storyboard, subtitles_srt, subtitles_segments,
         short_description, hashtags, thumbnail_concept, call_to_action,
         source_links, fact_check_report, ai_model_used, duration_seconds, visual_settings, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'awaiting_approval')
       RETURNING id`,
      [
        topicId,
        pkg.video_format || videoFormat,
        pkg.hindi_title,
        pkg.opening_hook,
        pkg.what_happened || '',
        JSON.stringify(
          Array.isArray(pkg.background_timeline)
            ? pkg.background_timeline
            : pkg.background_timeline
              ? [pkg.background_timeline]
              : []
        ),
        pkg.why_it_matters || '',
        pkg.conclusion_text || '',
        pkg.narration_script,
        JSON.stringify(pkg.storyboard || []),
        pkg.subtitles_srt,
        JSON.stringify(pkg.subtitles_segments),
        pkg.short_description,
        JSON.stringify(pkg.hashtags),
        pkg.thumbnail_concept,
        pkg.call_to_action,
        JSON.stringify(pkg.source_links),
        JSON.stringify(pkg.fact_check_report),
        pkg.ai_model_used,
        pkg.duration_seconds,
        visualSettingsJson,
      ]
    );
    finalVideoId = insertVideo.rows[0].id;
  }

  setRenderProgress({
    videoId: finalVideoId,
    topicId,
    percent: 14,
    stage: 'Hindi Script Ready! Starting Parallel 3D Scene & Veo 3.1 Video Render...',
    active: true,
  });

  await query(
    `UPDATE trending_topics SET status = $1, updated_at = NOW() WHERE id = $2`,
    [topic.verification_status === 'flagged' ? 'flagged' : 'video_ready', topicId]
  );

  // Automatically trigger animated scene + female Hindi TTS video render in non-test environments unless disabled
  const shouldAutoRender = autoRender !== undefined ? Boolean(autoRender) : process.env.NODE_ENV !== 'test';
  let renderSummary = null;
  if (shouldAutoRender) {
    try {
      renderSummary = await renderExplainerVideo(finalVideoId);
    } catch (renderErr) {
      logger.warn('Auto-render after script generation encountered an issue; script saved cleanly', {
        videoId: finalVideoId,
        error: renderErr.message,
      });
      clearRenderProgress(finalVideoId, topicId);
    }
  } else {
    clearRenderProgress(finalVideoId, topicId);
  }

  return {
    videoId: finalVideoId,
    topicId,
    aiModelUsed: pkg.ai_model_used,
    renderedVideoUrl: renderSummary?.videoUrl || null,
    status: 'awaiting_approval',
  };
}

/**
 * Handler for 'video_render': synthesizes female Hindi voice-over (SwaraNeural) +
 * generates canonical presenter Aashi scene keyframes + renders animated MP4 via FFmpeg.
 */
async function handleVideoRenderJob(job) {
  const videoId = job.entity_id;
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload || {};
  const videoRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
  if (videoRes.rows.length === 0) {
    throw new Error(`Video ID ${videoId} not found`);
  }

  await query(`UPDATE videos SET status = 'processing', updated_at = NOW() WHERE id = $1`, [videoId]);

  setRenderProgress({
    videoId,
    topicId: videoRes.rows[0].topic_id,
    percent: 10,
    stage: payload.sceneNumber
      ? `Re-rendering Scene #${payload.sceneNumber} with Veo 3.1...`
      : 'Starting Parallel 3D Scene & Veo 3.1 Video Render...',
    active: true,
  });

  if (process.env.NODE_ENV === 'test' && !payload.forceRealRender) {
    const audioUrl = `/storage/audio/video-${videoId}-hi.mp3`;
    const subtitlesUrl = `/storage/subtitles/video-${videoId}-hi.srt`;
    const videoUrl = `/storage/videos/video-${videoId}-vertical.mp4`;
    await query(
      `UPDATE videos SET
         audio_url = $1,
         subtitles_url = $2,
         video_url = $3,
         status = 'awaiting_approval',
         updated_at = NOW()
       WHERE id = $4`,
      [audioUrl, subtitlesUrl, videoUrl, videoId]
    );
    clearRenderProgress(videoId, videoRes.rows[0].topic_id);
    return {
      videoId,
      audioUrl,
      subtitlesUrl,
      videoUrl,
      status: 'awaiting_approval',
    };
  }

  const rendered = await renderExplainerVideo(videoId, {
    onlySceneNumber: payload.sceneNumber || null,
  });

  return rendered;
}

/**
 * Handler for 'publish_video': enforces human approval gate & publishes to configured platforms
 */
async function handlePublishVideoJob(job) {
  const videoId = job.entity_id;
  const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload || {};
  const { platforms = ['youtube_shorts'], scheduledFor = null } = payload;

  const videoRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
  if (videoRes.rows.length === 0) {
    throw new Error(`Video ID ${videoId} not found`);
  }
  const video = videoRes.rows[0];

  if (video.status !== 'approved' && video.status !== 'publishing') {
    throw new Error(`Cannot publish video #${videoId}: current status is '${video.status}'. Human approval is required first.`);
  }

  const factCheck = video.fact_check_report || {};
  if (factCheck.safe_to_publish === false) {
    throw new Error(`Blocked from publishing: Video #${videoId} is flagged as unverified or disputed in fact_check_report.`);
  }

  const results = [];
  for (const platform of platforms) {
    const pubStatus = scheduledFor ? 'scheduled' : 'pending';
    const pubRes = await query(
      `INSERT INTO publications (
         video_id, platform, platform_title, platform_caption, scheduled_for, status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (video_id, platform) DO UPDATE SET
         platform_title = EXCLUDED.platform_title,
         platform_caption = EXCLUDED.platform_caption,
         scheduled_for = EXCLUDED.scheduled_for,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        videoId,
        platform,
        payload.platformTitle || video.hindi_title,
        payload.platformCaption || `${video.short_description}\n\n${(video.hashtags || []).join(' ')}`,
        scheduledFor,
        pubStatus,
      ]
    );
    results.push(pubRes.rows[0]);
  }

  return {
    videoId,
    publications: results,
    note: 'Queued for official platform API upload (Credentials required in .env for live upload in Phase 4/5).',
  };
}

/**
 * Worker loop that claims and executes pending jobs sequentially
 */
async function runWorkerLoop() {
  while (true) {
    const client = await pool.connect();
    let job = null;

    try {
      await client.query('BEGIN');
      const claimRes = await client.query(
        `SELECT * FROM jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );

      if (claimRes.rows.length === 0) {
        await client.query('COMMIT');
        break;
      }

      job = claimRes.rows[0];
      await client.query(
        `UPDATE jobs SET
           status = 'processing',
           attempts = attempts + 1,
           started_at = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    if (!job) break;

    try {
      logger.info('Processing background job', { jobId: job.id, jobType: job.job_type });
      let result = {};

      if (job.job_type === 'script_generation') {
        result = await handleScriptGenerationJob(job);
      } else if (job.job_type === 'video_render') {
        result = await handleVideoRenderJob(job);
      } else if (job.job_type === 'publish_video') {
        result = await handlePublishVideoJob(job);
      } else {
        result = { message: `Completed job type ${job.job_type}` };
      }

      await query(
        `UPDATE jobs SET
           status = 'completed',
           result = $1,
           error_message = NULL,
           completed_at = NOW(),
           updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(result), job.id]
      );
      logger.info('Completed background job', { jobId: job.id, jobType: job.job_type });
    } catch (jobErr) {
      logger.error('Background job failed', {
        jobId: job.id,
        jobType: job.job_type,
        error: jobErr.message,
      });

      await query(
        `UPDATE jobs SET
           status = 'failed',
           error_message = $1,
           completed_at = NOW(),
           updated_at = NOW()
         WHERE id = $2`,
        [jobErr.message, job.id]
      );

      if (job.entity_type === 'video' && job.entity_id) {
        await query(`UPDATE videos SET status = 'failed', updated_at = NOW() WHERE id = $1`, [job.entity_id]);
      }
    }
  }
}

async function processNextJobs() {
  if (activeWorkerPromise) {
    return activeWorkerPromise;
  }
  activeWorkerPromise = runWorkerLoop().finally(() => {
    activeWorkerPromise = null;
  });
  return activeWorkerPromise;
}

function startJobWorker(intervalMs = 4000) {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    processNextJobs().catch((err) => logger.error('Periodic worker error', { error: err.message }));
  }, intervalMs);
  logger.info('Background job queue worker started', { intervalMs });
}

function stopJobWorker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

module.exports = {
  enqueueJob,
  processNextJobs,
  startJobWorker,
  stopJobWorker,
};
