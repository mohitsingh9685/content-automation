const fs = require('fs');
const path = require('path');
const { query, checkDbHealth } = require('../config/db');
const { env, isGeminiConfigured, isYoutubeConfigured, isInstagramConfigured } = require('../config/env');
const { listAvailableModels } = require('../providers/ai/geminiProvider');

function loadPresenterManifest() {
  try {
    const profilePath = path.join(env.assetsDir, 'presenter', 'presenter_profile.json');
    if (fs.existsSync(profilePath)) {
      return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }
  } catch (_) {
    // fallback below
  }
  return {
    id: 'aashi_official_v1',
    name_hindi: 'Aashi',
    name_english: 'Aashi',
    role: 'Official AI Topic Explainer Host',
    canonical_sheet: '/assets/presenter/character_sheet_master.jpg',
    hero_anchor: '/assets/presenter/hero_anchor.jpg',
    voice_config: {
      default_voice: env.tts.voiceHindi || 'Aoede',
    },
  };
}

async function getDashboardSummary(req, res, next) {
  try {
    const [
      topicsCountRes,
      videosCountRes,
      awaitingApprovalRes,
      publishedCountRes,
      failedJobsRes,
      recentJobsRes,
      usageTodayRes,
      recommendedTopicRes,
      dbHealth,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM trending_topics'),
      query('SELECT COUNT(*)::int AS count FROM videos'),
      query(`SELECT COUNT(*)::int AS count FROM videos WHERE status = 'awaiting_approval'`),
      query(`SELECT COUNT(*)::int AS count FROM videos WHERE status = 'published'`),
      query(
        `SELECT id, job_type, entity_type, entity_id, error_message, attempts, updated_at
         FROM jobs
         WHERE status = 'failed'
         ORDER BY updated_at DESC
         LIMIT 10`
      ),
      query(
        `SELECT id, job_type, entity_type, entity_id, status, attempts, error_message, created_at, completed_at
         FROM jobs
         ORDER BY created_at DESC
         LIMIT 10`
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM api_usage_logs
         WHERE provider = 'gemini'
           AND created_at >= CURRENT_DATE`
      ),
      query(
        `SELECT id, headline, category, primary_source, overall_score, explanatory_value_score, visual_storytelling_score
         FROM trending_topics
         WHERE verification_status = 'verified'
         ORDER BY is_recommended DESC, overall_score DESC
         LIMIT 1`
      ),
      checkDbHealth(),
    ]);

    const presenter = loadPresenterManifest();

    res.json({
      success: true,
      data: {
        metrics: {
          totalTopicsDiscovered: topicsCountRes.rows[0].count,
          videosGenerated: videosCountRes.rows[0].count,
          videosAwaitingApproval: awaitingApprovalRes.rows[0].count,
          videosPublished: publishedCountRes.rows[0].count,
          recentFailuresCount: failedJobsRes.rows.length,
        },
        recommendedTopic: recommendedTopicRes.rows[0] || null,
        presenter,
        recentFailures: failedJobsRes.rows,
        recentJobs: recentJobsRes.rows,
        systemStatus: {
          database: dbHealth,
          gemini: {
            configured: isGeminiConfigured(),
            configuredModel: env.gemini.model,
            dailyUsed: usageTodayRes.rows[0].count,
            dailyLimit: env.gemini.dailyLimit,
          },
          tts: {
            provider: env.tts.provider,
            voiceHindi: env.tts.voiceHindi,
          },
          presenter: {
            id: presenter.id,
            name: presenter.name_hindi,
            avatarProvider: env.avatar.provider,
            heroImage: presenter.hero_anchor,
          },
          publishing: {
            youtubeConfigured: isYoutubeConfigured(),
            instagramConfigured: isInstagramConfigured(),
          },
          n8n: {
            webhookUrl: env.n8n.webhookUrl,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getGeminiModels(req, res, next) {
  try {
    const modelsInfo = await listAvailableModels();
    res.json({
      success: true,
      data: modelsInfo,
    });
  } catch (err) {
    next(err);
  }
}

async function getPresenterProfile(req, res, next) {
  try {
    const presenter = loadPresenterManifest();
    res.json({
      success: true,
      data: { presenter },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardSummary,
  getGeminiModels,
  getPresenterProfile,
};
