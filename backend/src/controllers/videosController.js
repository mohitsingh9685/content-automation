const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/db');
const { enqueueJob } = require('../jobs/jobQueue');
const { segmentsToSrt, sanitizeToRomanHinglish } = require('../providers/ai/geminiProvider');
const {
  getRenderProgress,
  setRenderProgress,
  clearRenderProgress,
} = require('../providers/video/renderProgressTracker');

const updateScriptSchema = z.object({
  video_format: z.enum(['9:16', '16:9', 'vertical', 'horizontal', 'vertical_9_16', 'horizontal_16_9']).optional(),
  hindi_title: z.string().min(3).max(200).optional(),
  opening_hook: z.string().min(3).max(500).optional(),
  what_happened: z.string().max(2500).optional(),
  background_timeline: z.union([z.string().max(2500), z.array(z.string())]).optional(),
  why_it_matters: z.string().max(2500).optional(),
  conclusion_text: z.string().max(2000).optional(),
  narration_script: z.string().min(10).max(6000).optional(),
  storyboard: z.array(z.any()).optional(),
  subtitles_srt: z.string().max(15000).optional(),
  subtitles_segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
      })
    )
    .optional(),
  short_description: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).optional(),
  thumbnail_concept: z.string().max(1000).optional(),
  call_to_action: z.string().max(500).optional(),
  voice_settings: z.record(z.any()).optional(),
  visual_settings: z.record(z.any()).optional(),
  presenter_settings: z.record(z.any()).optional(),
  synthetic_disclosure: z.string().max(1000).optional(),
});

const regenerateScriptSchema = z.object({
  customInstructions: z.string().max(1000).optional(),
  requestedModel: z.string().max(120).optional(),
  videoFormat: z.enum(['9:16', '16:9']).optional(),
  presenterMode: z.enum(['faceless', 'with_face']).optional(),
  autoRender: z.boolean().optional(),
});

const approvalSchema = z.object({
  reviewerNotes: z.string().max(1000).optional(),
});

const publishVideoSchema = z.object({
  platforms: z.array(z.enum(['youtube_shorts', 'instagram_reels'])).min(1).optional(),
  platformTitle: z.string().max(200).optional(),
  platformCaption: z.string().max(2200).optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
});

function attachVideoRenderProgress(v) {
  if (!v) return v;
  const liveProgress = getRenderProgress(v.id, v.topic_id);
  if (liveProgress) {
    return { ...v, render_progress: liveProgress };
  }
  if (v.status === 'processing') {
    return {
      ...v,
      render_progress: {
        percent: 12,
        stage: 'Rendering 3D Scenes & Veo 3.1 Video...',
        active: true,
      },
    };
  }
  return { ...v, render_progress: null };
}

async function listVideos(req, res, next) {
  try {
    const { status } = req.query;
    const params = [];
    let whereClause = '';

    if (status && status !== 'all') {
      params.push(status);
      whereClause = `WHERE v.status = $1`;
    }

    const sql = `
      SELECT
        v.*,
        t.headline AS topic_headline,
        t.category AS topic_category,
        t.primary_source AS topic_source,
        t.verification_status AS topic_verification_status,
        (
          SELECT json_agg(p.*)
          FROM publications p
          WHERE p.video_id = v.id
        ) AS publications
      FROM videos v
      LEFT JOIN trending_topics t ON t.id = v.topic_id
      ${whereClause}
      ORDER BY (v.video_url IS NOT NULL) DESC, v.updated_at DESC, v.id ASC
    `;

    const result = await query(sql, params);
    res.json({
      success: true,
      data: {
        videos: result.rows.map(attachVideoRenderProgress),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getVideoById(req, res, next) {
  try {
    const videoId = req.numericId;
    const sql = `
      SELECT
        v.*,
        t.headline AS topic_headline,
        t.category AS topic_category,
        t.summary AS topic_summary,
        t.primary_source AS topic_source,
        t.verification_status AS topic_verification_status,
        t.verification_notes AS topic_verification_notes
      FROM videos v
      LEFT JOIN trending_topics t ON t.id = v.topic_id
      WHERE v.id = $1
    `;
    const videoRes = await query(sql, [videoId]);
    if (videoRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const [pubsRes, jobsRes] = await Promise.all([
      query('SELECT * FROM publications WHERE video_id = $1 ORDER BY created_at DESC', [videoId]),
      query(
        `SELECT * FROM jobs
         WHERE (entity_type = 'video' AND entity_id = $1)
            OR (entity_type = 'topic' AND entity_id = $2)
         ORDER BY created_at DESC
         LIMIT 15`,
        [videoId, videoRes.rows[0].topic_id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        video: attachVideoRenderProgress(videoRes.rows[0]),
        publications: pubsRes.rows,
        jobs: jobsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateVideoScript(req, res, next) {
  try {
    const videoId = req.numericId;
    const updates = req.validatedBody;

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const existing = existingRes.rows[0];

    const segments = updates.subtitles_segments || existing.subtitles_segments;
    const srt =
      updates.subtitles_srt !== undefined
        ? updates.subtitles_srt
        : updates.subtitles_segments
          ? segmentsToSrt(updates.subtitles_segments)
          : existing.subtitles_srt;

    // Editing script resets approval back to 'awaiting_approval' so unreviewed edits cannot slip through
    const nextStatus = existing.status === 'published' ? 'published' : 'awaiting_approval';

    const updateRes = await query(
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
         voice_settings = $16,
         visual_settings = $17,
         presenter_settings = $18,
         synthetic_disclosure = $19,
         status = $20,
         updated_at = NOW()
       WHERE id = $21
       RETURNING *`,
      [
        updates.video_format ?? existing.video_format ?? '9:16',
        sanitizeToRomanHinglish(updates.hindi_title ?? existing.hindi_title),
        sanitizeToRomanHinglish(updates.opening_hook ?? existing.opening_hook),
        sanitizeToRomanHinglish(updates.what_happened ?? existing.what_happened ?? ''),
        JSON.stringify(
          updates.background_timeline !== undefined
            ? Array.isArray(updates.background_timeline)
              ? updates.background_timeline.map((t) => sanitizeToRomanHinglish(t))
              : updates.background_timeline
                ? [sanitizeToRomanHinglish(updates.background_timeline)]
                : []
            : Array.isArray(existing.background_timeline)
              ? existing.background_timeline
              : existing.background_timeline
                ? [existing.background_timeline]
                : []
        ),
        sanitizeToRomanHinglish(updates.why_it_matters ?? existing.why_it_matters ?? ''),
        sanitizeToRomanHinglish(updates.conclusion_text ?? existing.conclusion_text ?? ''),
        sanitizeToRomanHinglish(updates.narration_script ?? existing.narration_script),
        JSON.stringify(updates.storyboard ?? existing.storyboard ?? []),
        srt,
        JSON.stringify(segments),
        sanitizeToRomanHinglish(updates.short_description ?? existing.short_description),
        JSON.stringify(updates.hashtags ?? existing.hashtags),
        sanitizeToRomanHinglish(updates.thumbnail_concept ?? existing.thumbnail_concept),
        sanitizeToRomanHinglish(updates.call_to_action ?? existing.call_to_action),
        JSON.stringify(updates.voice_settings ?? existing.voice_settings),
        JSON.stringify(updates.visual_settings ?? existing.visual_settings),
        JSON.stringify(updates.presenter_settings ?? existing.presenter_settings ?? {}),
        sanitizeToRomanHinglish(updates.synthetic_disclosure ?? existing.synthetic_disclosure ?? ''),
        nextStatus,
        videoId,
      ]
    );

    res.json({
      success: true,
      message: 'Hindi script, storyboard, and presenter settings saved. Status set to awaiting_approval.',
      data: {
        video: updateRes.rows[0],
      },
    });
  } catch (err) {
    next(err);
  }
}

async function regenerateVideoScript(req, res, next) {
  try {
    const videoId = req.numericId;
    const body = req.validatedBody || {};

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const video = existingRes.rows[0];

    setRenderProgress({
      videoId,
      topicId: video.topic_id,
      percent: 4,
      stage: 'Queued Script Rewrite & Veo 3.1 Video Regeneration...',
      active: true,
    });

    const { job, deduplicated } = await enqueueJob({
      jobType: 'script_generation',
      entityType: 'video',
      entityId: videoId,
      payload: {
        topicId: video.topic_id,
        videoId,
        customInstructions: body.customInstructions || '',
        requestedModel: body.requestedModel || 'auto',
        videoFormat: body.videoFormat || video.video_format || '9:16',
        presenterMode: body.presenterMode || video.visual_settings?.presenterMode || 'faceless',
        autoRender: body.autoRender,
      },
    });

    res.status(202).json({
      success: true,
      message: 'Hindi script & storyboard regeneration job queued.',
      data: { job, deduplicated },
    });
  } catch (err) {
    next(err);
  }
}

async function renderVideo(req, res, next) {
  try {
    const videoId = req.numericId;
    const sceneNumber = req.params.sceneNumber
      ? parseInt(req.params.sceneNumber, 10)
      : req.body?.sceneNumber
        ? parseInt(req.body.sceneNumber, 10)
        : null;

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const existing = existingRes.rows[0];
    const body = req.body || {};

    // If caller passed a scenePrompt or scene edits (or updated storyboard or presenterMode), persist them first!
    if (
      Array.isArray(body.storyboard) ||
      body.presenterMode !== undefined ||
      (Number.isFinite(sceneNumber) &&
        (body.scenePrompt !== undefined ||
          body.visual_description !== undefined ||
          body.narration_hindi !== undefined ||
          body.on_screen_text !== undefined ||
          body.expression !== undefined ||
          body.visible !== undefined))
    ) {
      let nextStoryboard = Array.isArray(body.storyboard)
        ? [...body.storyboard]
        : Array.isArray(existing.storyboard)
          ? [...existing.storyboard]
          : [];

      if (body.presenterMode === 'faceless' || body.presenterMode === 'with_face') {
        const showFace = body.presenterMode === 'with_face';
        nextStoryboard = nextStoryboard.map((s) => ({
          ...s,
          presenter_config: {
            ...(s.presenter_config || {}),
            visible: showFace,
          },
        }));
      }

      if (Number.isFinite(sceneNumber) && nextStoryboard.length > 0) {
        nextStoryboard = nextStoryboard.map((s, idx) => {
          const sNum = s.scene_number || idx + 1;
          if (Number(sNum) !== Number(sceneNumber)) return s;
          const updatedScene = { ...s };
          if (body.scenePrompt !== undefined && String(body.scenePrompt).trim()) {
            updatedScene.custom_prompt = String(body.scenePrompt).trim();
            updatedScene.visual_description = String(body.scenePrompt).trim();
          }
          if (body.visual_description !== undefined) {
            updatedScene.visual_description = String(body.visual_description);
          }
          if (body.narration_hindi !== undefined) {
            updatedScene.narration_hindi = String(body.narration_hindi);
            updatedScene.narration_segment = String(body.narration_hindi);
          }
          if (body.on_screen_text !== undefined) {
            updatedScene.on_screen_text = String(body.on_screen_text);
          }
          if (body.expression !== undefined) {
            updatedScene.presenter_config = {
              ...(updatedScene.presenter_config || {}),
              expression: String(body.expression),
            };
          }
          if (body.visible !== undefined) {
            updatedScene.presenter_config = {
              ...(updatedScene.presenter_config || {}),
              visible: Boolean(body.visible),
            };
          }
          return updatedScene;
        });
      }

      const nextNarration = nextStoryboard
        .map((s) => (s.narration_hindi || s.narration_segment || '').trim())
        .filter(Boolean)
        .join('\n\n');

      const nextVisualSettings = {
        ...(existing.visual_settings || {}),
        ...(body.presenterMode ? { presenterMode: body.presenterMode } : {}),
      };

      await query(
        `UPDATE videos
         SET storyboard = $1,
             narration_script = COALESCE(NULLIF($2, ''), narration_script),
             visual_settings = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [JSON.stringify(nextStoryboard), nextNarration, JSON.stringify(nextVisualSettings), videoId]
      );
    }

    setRenderProgress({
      videoId,
      topicId: existing.topic_id,
      percent: 6,
      stage: Number.isFinite(sceneNumber)
        ? `Queued Scene #${sceneNumber} Veo 3.1 Re-Render...`
        : 'Queued Parallel 3D Scene & Veo 3.1 Video Render...',
      active: true,
    });

    const { job, deduplicated } = await enqueueJob({
      jobType: 'video_render',
      entityType: 'video',
      entityId: videoId,
      payload: {
        videoId,
        sceneNumber: Number.isFinite(sceneNumber) ? sceneNumber : null,
      },
    });

    res.status(202).json({
      success: true,
      message: deduplicated
        ? 'Video render job is already in progress.'
        : sceneNumber
          ? `Scene #${sceneNumber} prompt saved & Veo 3.1 regeneration queued.`
          : 'Multi-scene Hindi animated video render job queued in background.',
      data: { job, deduplicated, sceneNumber },
    });
  } catch (err) {
    next(err);
  }
}

async function approveVideo(req, res, next) {
  try {
    const videoId = req.numericId;
    const body = req.validatedBody || {};

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const video = existingRes.rows[0];
    const factCheck = video.fact_check_report || {};
    if (factCheck.safe_to_publish === false) {
      const err = new Error(
        `Cannot approve video #${videoId}: Fact-check report flags this story as unverified or disputed (safe_to_publish = false).`
      );
      err.statusCode = 422;
      throw err;
    }

    const updateRes = await query(
      `UPDATE videos SET
         status = 'approved',
         reviewer_notes = $1,
         approved_at = NOW(),
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [body.reviewerNotes || 'Approved by human reviewer in Video Studio.', videoId]
    );

    res.json({
      success: true,
      message: 'Video approved for publishing.',
      data: { video: updateRes.rows[0] },
    });
  } catch (err) {
    next(err);
  }
}

async function rejectVideo(req, res, next) {
  try {
    const videoId = req.numericId;
    const body = req.validatedBody || {};

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const updateRes = await query(
      `UPDATE videos SET
         status = 'rejected',
         reviewer_notes = $1,
         rejected_at = NOW(),
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [body.reviewerNotes || 'Rejected during editorial review.', videoId]
    );

    res.json({
      success: true,
      message: 'Video marked as rejected and blocked from publishing.',
      data: { video: updateRes.rows[0] },
    });
  } catch (err) {
    next(err);
  }
}

async function publishVideo(req, res, next) {
  try {
    const videoId = req.numericId;
    const body = req.validatedBody || {};

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const video = existingRes.rows[0];

    if (video.status !== 'approved') {
      const err = new Error(
        `Publishing blocked: Video #${videoId} has status '${video.status}'. Explicit human approval is required before publishing.`
      );
      err.statusCode = 403;
      throw err;
    }

    const { job, deduplicated } = await enqueueJob({
      jobType: 'publish_video',
      entityType: 'video',
      entityId: videoId,
      payload: {
        videoId,
        platforms: body.platforms || ['youtube_shorts', 'instagram_reels'],
        platformTitle: body.platformTitle || video.hindi_title,
        platformCaption:
          body.platformCaption || `${video.short_description}\n\n${(video.hashtags || []).join(' ')}`,
        scheduledFor: body.scheduledFor || null,
      },
    });

    res.status(202).json({
      success: true,
      message: 'Publishing job queued for approved video.',
      data: { job, deduplicated },
    });
  } catch (err) {
    next(err);
  }
}

function cleanupVideoStorageArtifacts(videoId) {
  try {
    const storageDir = path.join(__dirname, '../../../storage');
    const filesToRemove = [
      path.join(storageDir, 'videos', `video_${videoId}.mp4`),
      path.join(storageDir, 'videos', `video-${videoId}-vertical.mp4`),
      path.join(storageDir, 'videos', `video-${videoId}-horizontal.mp4`),
      path.join(storageDir, 'audio', `video-${videoId}-hi.mp3`),
      path.join(storageDir, 'subtitles', `video-${videoId}-hi.srt`),
      path.join(storageDir, 'subtitles', `video_${videoId}.ass`),
    ];
    for (const filePath of filesToRemove) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    const scenesDir = path.join(storageDir, 'scenes', `video_${videoId}`);
    if (fs.existsSync(scenesDir)) {
      fs.rmSync(scenesDir, { recursive: true, force: true });
    }
  } catch (_) {
    // ignore file cleanup errors
  }
}

async function deleteVideo(req, res, next) {
  try {
    const videoId = req.numericId;

    const existingRes = await query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Video #${videoId} not found`);
      err.statusCode = 404;
      throw err;
    }
    const video = existingRes.rows[0];
    const topicId = video.topic_id;

    clearRenderProgress(videoId, topicId);

    // Clean up DB relations
    await query('DELETE FROM publications WHERE video_id = $1', [videoId]);
    await query(`DELETE FROM jobs WHERE entity_type = 'video' AND entity_id = $1`, [videoId]);
    await query('DELETE FROM videos WHERE id = $1', [videoId]);

    // If topic has no more videos, reset topic status back to 'discovered'
    if (topicId) {
      const remRes = await query('SELECT COUNT(*)::int AS cnt FROM videos WHERE topic_id = $1', [topicId]);
      if ((remRes.rows[0]?.cnt || 0) === 0) {
        await query(`UPDATE trending_topics SET status = 'discovered', updated_at = NOW() WHERE id = $1`, [topicId]);
      }
    }

    cleanupVideoStorageArtifacts(videoId);

    res.json({
      success: true,
      message: `Video #${videoId} deleted.`,
      data: { deletedVideoId: videoId, topicId },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
  cleanupVideoStorageArtifacts,
};
