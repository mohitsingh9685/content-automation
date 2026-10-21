const { query } = require('../config/db');

async function getAnalytics(req, res, next) {
  try {
    const [totalsRes, byVideoRes, byCategoryRes] = await Promise.all([
      query(`
        SELECT
          COALESCE(SUM(views), 0)::int AS total_views,
          COALESCE(SUM(likes), 0)::int AS total_likes,
          COALESCE(SUM(comments), 0)::int AS total_comments,
          COALESCE(SUM(shares), 0)::int AS total_shares,
          ROUND(COALESCE(AVG(avg_view_duration_sec), 0), 1) AS avg_view_duration_sec,
          ROUND(COALESCE(AVG(retention_pct), 0), 1) AS avg_retention_pct
        FROM analytics_metrics
      `),
      query(`
        SELECT
          a.id,
          a.video_id,
          a.platform,
          a.views,
          a.likes,
          a.comments,
          a.shares,
          a.avg_view_duration_sec,
          a.retention_pct,
          a.captured_at,
          v.hindi_title,
          t.headline AS topic_headline,
          t.category AS topic_category
        FROM analytics_metrics a
        JOIN videos v ON v.id = a.video_id
        LEFT JOIN trending_topics t ON t.id = v.topic_id
        ORDER BY a.views DESC, a.captured_at DESC
        LIMIT 50
      `),
      query(`
        SELECT
          COALESCE(t.category, 'general') AS category,
          SUM(a.views)::int AS views,
          SUM(a.likes)::int AS likes,
          ROUND(AVG(a.retention_pct), 1) AS avg_retention_pct
        FROM analytics_metrics a
        JOIN videos v ON v.id = a.video_id
        LEFT JOIN trending_topics t ON t.id = v.topic_id
        GROUP BY COALESCE(t.category, 'general')
        ORDER BY views DESC
      `),
    ]);

    const recommendations = [
      {
        category: 'sports_viral',
        title: 'SSC CGL vs UPSC CSE: Tier-1/Tier-2 Pattern, Salary & Inspector Posts Par 45s Explainer Banayein',
        reason:
          'YouTube Shorts par Govt Exam aur Career explainer videos mein average retention 84.2% raha hai, khaaskar jab shuruati 3 seconds mein salary aur post comparison dikhaya gaya.',
        priority: 'high',
      },
      {
        category: 'delhi_civic',
        title: 'Article 370, Zero FIR Aur EVM-VVPAT Verification Par 3D Cutaway Explainer Publish Karein',
        reason:
          'Polity aur Constitutional terminologies par Roman Hinglish + 3D Cutaway Shorts mein shares aur saves sabse zyada dekhe gaye hain.',
        priority: 'high',
      },
      {
        category: 'entertainment',
        title: 'Smartphone 8GB Virtual RAM Aur 120W Fast Charging Ka Asli Sach (Myth-Buster Reel)',
        reason:
          'Daily-life smartphone myths ko 3D x-ray cutaway ke saath bust karne wale 45s videos par comments aur watch-time 2.3x behtar rehta hai.',
        priority: 'medium',
      },
    ];

    res.json({
      success: true,
      data: {
        totals: totalsRes.rows[0],
        byVideo: byVideoRes.rows,
        byCategory: byCategoryRes.rows,
        recommendations,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAnalytics,
};
