const { z } = require('zod');
const { query } = require('../config/db');
const { enqueueJob } = require('../jobs/jobQueue');
const {
  discoverAndStoreTrends,
  createCustomExplainerTopic,
} = require('../providers/news/rssFetcher');
const {
  getRenderProgress,
  setRenderProgress,
  clearRenderProgress,
} = require('../providers/video/renderProgressTracker');
const { cleanupVideoStorageArtifacts } = require('./videosController');

const generateFromTrendSchema = z.object({
  customInstructions: z.string().max(1000).optional(),
  requestedModel: z.string().max(120).optional(),
  videoFormat: z.enum(['9:16', '16:9']).optional(),
  presenterMode: z.enum(['faceless', 'with_face']).optional(),
  autoRender: z.boolean().optional(),
  allowFlaggedDraft: z.boolean().optional(),
});

const createCustomTopicSchema = z
  .object({
    query: z.string().min(2).max(300).optional(),
    headline: z.string().min(2).max(300).optional(),
    summary: z.string().max(1000).optional(),
    category: z.string().max(60).optional(),
    presenterMode: z.enum(['faceless', 'with_face']).optional(),
    generateNow: z.boolean().optional(),
    autoGenerateVideo: z.boolean().optional(),
    customInstructions: z.string().max(1000).optional(),
  })
  .refine((data) => Boolean((data.query && data.query.trim()) || (data.headline && data.headline.trim())), {
    message: 'Either query or headline is required',
  });

async function listTrends(req, res, next) {
  try {
    const { category, verification_status, search } = req.query;
    const conditions = [];
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      conditions.push(`t.category = $${params.length}`);
    }

    if (verification_status && verification_status !== 'all') {
      params.push(verification_status);
      conditions.push(`t.verification_status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(t.headline ILIKE $${params.length} OR t.summary ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        t.*,
        (
          SELECT v.id
          FROM videos v
          WHERE v.topic_id = t.id
          ORDER BY (v.video_url IS NOT NULL) DESC, v.id ASC
          LIMIT 1
        ) AS latest_video_id,
        (
          SELECT v.status
          FROM videos v
          WHERE v.topic_id = t.id
          ORDER BY (v.video_url IS NOT NULL) DESC, v.id ASC
          LIMIT 1
        ) AS latest_video_status
      FROM trending_topics t
      ${whereClause}
      ORDER BY t.is_recommended DESC, t.overall_score DESC, t.published_at DESC
      LIMIT 100
    `;

    const result = await query(sql, params);
    const sourcesRes = await query('SELECT * FROM news_sources ORDER BY trust_score DESC');

    const topicsWithProgress = result.rows.map((t) => {
      const liveProgress = getRenderProgress(t.latest_video_id, t.id);
      return {
        ...t,
        render_progress: liveProgress || null,
      };
    });

    const recommended =
      topicsWithProgress.find((r) => r.is_recommended && r.verification_status === 'verified') ||
      topicsWithProgress.find((r) => r.verification_status === 'verified') ||
      null;

    res.json({
      success: true,
      data: {
        topics: topicsWithProgress,
        sources: sourcesRes.rows,
        recommendedTopic: recommended,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function discoverLiveTrends(req, res, next) {
  try {
    const customTopicQuery = req.body?.query || req.query?.query || null;
    const categoryFilter =
      req.body?.category && req.body.category !== 'all' ? req.body.category : null;
    const stats = await discoverAndStoreTrends({ customTopicQuery, categoryFilter });
    const topRes = await query(
      `SELECT * FROM trending_topics
       ORDER BY is_recommended DESC, overall_score DESC, published_at DESC
       LIMIT 50`
    );
    res.json({
      success: true,
      message: `Discovered & AI-curated ${stats.deduplicatedCount} high-impact public stories from ${stats.rawArticlesFetched} live articles (${stats.inserted} new, ${stats.updated} updated).`,
      data: {
        stats,
        topics: topRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getRecommendedTrend(req, res, next) {
  try {
    const recRes = await query(
      `SELECT * FROM trending_topics
       WHERE verification_status = 'verified'
       ORDER BY is_recommended DESC, overall_score DESC, explanatory_value_score DESC
       LIMIT 1`
    );
    res.json({
      success: true,
      data: {
        recommendedTopic: recRes.rows[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function generateVideoFromTrend(req, res, next) {
  try {
    const topicId = req.numericId;
    const body = req.validatedBody || {};

    const topicRes = await query('SELECT * FROM trending_topics WHERE id = $1', [topicId]);
    if (topicRes.rows.length === 0) {
      const err = new Error(`Trending topic #${topicId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const topic = topicRes.rows[0];
    if (
      (topic.verification_status === 'flagged' || topic.verification_status === 'disputed') &&
      !body.allowFlaggedDraft
    ) {
      const err = new Error(
        `Topic #${topicId} is marked as '${topic.verification_status}' due to unverified or conflicting claims. Automatic video generation is blocked to prevent spreading unverified news.`
      );
      err.statusCode = 422;
      throw err;
    }

    const presenterMode = body.presenterMode || 'faceless';

    setRenderProgress({
      topicId,
      percent: 4,
      stage:
        presenterMode === 'faceless'
          ? 'Queued 45s Genuine Topic Explainer Script & Faceless 3D Visuals...'
          : 'Queued 45s Genuine Topic Explainer Script & Studio Presenter Video...',
      active: true,
    });

    const { job, deduplicated } = await enqueueJob({
      jobType: 'script_generation',
      entityType: 'topic',
      entityId: topicId,
      payload: {
        topicId,
        customInstructions: body.customInstructions || '',
        requestedModel: body.requestedModel || 'auto',
        videoFormat: body.videoFormat || '9:16',
        presenterMode,
        autoRender: body.autoRender,
      },
    });

    res.status(202).json({
      success: true,
      message: deduplicated
        ? 'A Hindi video generation job is already running for this topic.'
        : 'Hindi animated explainer generation job queued in the background.',
      data: {
        job,
        topicId,
        deduplicated,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteTrend(req, res, next) {
  try {
    const topicId = req.numericId;
    const existingRes = await query('SELECT * FROM trending_topics WHERE id = $1', [topicId]);
    if (existingRes.rows.length === 0) {
      const err = new Error(`Trending topic #${topicId} not found`);
      err.statusCode = 404;
      throw err;
    }

    // Find any videos associated with this topic and clean them up
    const videosRes = await query('SELECT id FROM videos WHERE topic_id = $1', [topicId]);
    const videoIds = videosRes.rows.map((v) => v.id);

    for (const vId of videoIds) {
      clearRenderProgress(vId, topicId);
      await query('DELETE FROM publications WHERE video_id = $1', [vId]);
      await query(`DELETE FROM jobs WHERE entity_type = 'video' AND entity_id = $1`, [vId]);
      cleanupVideoStorageArtifacts(vId);
    }

    clearRenderProgress(null, topicId);
    await query('DELETE FROM videos WHERE topic_id = $1', [topicId]);
    await query(`DELETE FROM jobs WHERE entity_type = 'topic' AND entity_id = $1`, [topicId]);
    await query('DELETE FROM trending_topics WHERE id = $1', [topicId]);

    res.json({
      success: true,
      message: `Idea #${topicId} and associated drafts deleted.`,
      data: { deletedTopicId: topicId, deletedVideoIds: videoIds },
    });
  } catch (err) {
    next(err);
  }
}

async function createCustomTopic(req, res, next) {
  try {
    const body = req.validatedBody || req.body || {};
    const topic = await createCustomExplainerTopic({
      queryText: body.query || body.headline,
      category: body.category && body.category !== 'all' ? body.category : null,
    });

    let job = null;
    const shouldGenerateNow = Boolean(body.generateNow || body.autoGenerateVideo);
    if (shouldGenerateNow) {
      const presenterMode = body.presenterMode || 'faceless';
      setRenderProgress({
        topicId: topic.id,
        percent: 4,
        stage:
          presenterMode === 'faceless'
            ? 'Queued 45s Genuine Topic Explainer Script & Faceless 3D Visuals...'
            : 'Queued 45s Genuine Topic Explainer Script & Studio Presenter Video...',
        active: true,
      });

      const enq = await enqueueJob({
        jobType: 'script_generation',
        entityType: 'topic',
        entityId: topic.id,
        payload: {
          topicId: topic.id,
          customInstructions: body.customInstructions || '',
          requestedModel: 'auto',
          videoFormat: '9:16',
          presenterMode,
          autoRender: true,
        },
      });
      job = enq.job;
    }

    res.status(201).json({
      success: true,
      message: shouldGenerateNow
        ? `Created explainer topic "${topic.headline}" and started 45s video generation.`
        : `Added explainer topic "${topic.headline}".`,
      data: {
        topic,
        job,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateFromTrendSchema,
  createCustomTopicSchema,
  listTrends,
  discoverLiveTrends,
  createCustomTopic,
  getRecommendedTrend,
  generateVideoFromTrend,
  deleteTrend,
};
