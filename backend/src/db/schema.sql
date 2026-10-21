-- ============================================================================
-- Hindi Trend AI — PostgreSQL Schema
-- Covers Sources, Trending Topics, Hindi Videos, Async Jobs, Publishing & Analytics
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS n8n;

-- 1. Configured News & RSS Sources
CREATE TABLE IF NOT EXISTS news_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  site_url TEXT,
  category VARCHAR(50) NOT NULL,
  trust_score INTEGER DEFAULT 85 CHECK (trust_score BETWEEN 0 AND 100),
  is_active BOOLEAN DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Discovered & Ranked Trending Topics
CREATE TABLE IF NOT EXISTS trending_topics (
  id SERIAL PRIMARY KEY,
  headline TEXT NOT NULL,
  fingerprint VARCHAR(160) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  primary_source VARCHAR(120) NOT NULL,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ NOT NULL,
  freshness_score NUMERIC(5,2) DEFAULT 0,
  relevance_score NUMERIC(5,2) DEFAULT 0,
  interest_score NUMERIC(5,2) DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  verification_status VARCHAR(40) DEFAULT 'verified'
    CHECK (verification_status IN ('verified', 'partially_verified', 'unverified', 'disputed', 'flagged')),
  verification_notes TEXT DEFAULT '',
  status VARCHAR(40) DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'generating', 'video_ready', 'published', 'flagged')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_category ON trending_topics(category);
CREATE INDEX IF NOT EXISTS idx_topics_score ON trending_topics(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_topics_published_at ON trending_topics(published_at DESC);

-- 3. Generated Hindi Video Packages
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES trending_topics(id) ON DELETE SET NULL,
  hindi_title TEXT NOT NULL,
  opening_hook TEXT NOT NULL,
  narration_script TEXT NOT NULL,
  subtitles_srt TEXT DEFAULT '',
  subtitles_segments JSONB DEFAULT '[]'::jsonb,
  short_description TEXT DEFAULT '',
  hashtags JSONB DEFAULT '[]'::jsonb,
  thumbnail_concept TEXT DEFAULT '',
  call_to_action TEXT DEFAULT '',
  source_links JSONB DEFAULT '[]'::jsonb,
  fact_check_report JSONB DEFAULT '{}'::jsonb,
  ai_model_used VARCHAR(120) DEFAULT '',
  voice_settings JSONB DEFAULT '{"provider": "edge_free", "voiceId": "hi-IN-MadhurNeural", "speed": 1.0, "pitch": "0Hz"}'::jsonb,
  visual_settings JSONB DEFAULT '{"aspectRatio": "9:16", "resolution": "1080x1920", "theme": "modern_dark", "subtitleStyle": "bold_yellow", "bgMusic": "none"}'::jsonb,
  audio_url TEXT,
  subtitles_url TEXT,
  video_url TEXT,
  duration_seconds NUMERIC(6,2) DEFAULT 45,
  status VARCHAR(40) DEFAULT 'awaiting_approval'
    CHECK (status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'rejected', 'publishing', 'published', 'failed')),
  reviewer_notes TEXT DEFAULT '',
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_topic_id ON videos(topic_id);

-- 4. Asynchronous Background Jobs Queue
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  idempotency_key VARCHAR(180) UNIQUE,
  job_type VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40),
  entity_id INTEGER,
  payload JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(40) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at ASC);

-- 5. Platform Publications (YouTube Shorts & Instagram Reels)
CREATE TABLE IF NOT EXISTS publications (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL CHECK (platform IN ('youtube_shorts', 'instagram_reels')),
  platform_title TEXT NOT NULL,
  platform_caption TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  platform_post_id VARCHAR(120),
  platform_url TEXT,
  status VARCHAR(40) DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'publishing', 'published', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, platform)
);

-- 6. Historical Analytics & Performance Metrics
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL,
  platform VARCHAR(40) NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  avg_view_duration_sec NUMERIC(6,2) DEFAULT 0,
  retention_pct NUMERIC(5,2) DEFAULT 0,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. API Usage & Spending Guard Logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  operation VARCHAR(80) NOT NULL,
  model_or_tier VARCHAR(100),
  units_used INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_provider_date ON api_usage_logs(provider, created_at);

-- ============================================================================
-- 8. Universal Hindi AI Animated News Explainer Schema Extensions (Idempotent)
-- ============================================================================

ALTER TABLE trending_topics
  ADD COLUMN IF NOT EXISTS credibility_score NUMERIC(5,2) DEFAULT 85,
  ADD COLUMN IF NOT EXISTS visual_storytelling_score NUMERIC(5,2) DEFAULT 85,
  ADD COLUMN IF NOT EXISTS explanatory_value_score NUMERIC(5,2) DEFAULT 85,
  ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS video_format VARCHAR(30) DEFAULT 'vertical_9_16',
  ADD COLUMN IF NOT EXISTS what_happened TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_timeline JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_it_matters TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS conclusion_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS storyboard JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS presenter_settings JSONB DEFAULT '{"personaId": "aashi_official_v1", "outfit": "black_blazer", "look": "news_anchor", "defaultExpression": "explaining", "avatarProvider": "local_expression_animator"}'::jsonb,
  ADD COLUMN IF NOT EXISTS synthetic_disclosure TEXT DEFAULT 'Aashi is our official AI explainer host; 3D educational visual cutaways are AI-generated.',
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,4) DEFAULT 0.0000;

ALTER TABLE api_usage_logs
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,4) DEFAULT 0.0000;

