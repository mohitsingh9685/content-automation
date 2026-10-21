const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

// Load from root .env first, then backend/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function resolveBinary(envVar, localName) {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) {
    return process.env[envVar];
  }
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', localName),
    `/opt/homebrew/bin/${localName}`,
    `/usr/local/bin/${localName}`,
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return localName;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5180',
  storageDir: path.resolve(__dirname, '../../../', process.env.STORAGE_DIR || './storage'),
  assetsDir: path.resolve(__dirname, '../../../assets'),
  ffmpegBin: resolveBinary('FFMPEG_BIN', 'ffmpeg'),
  ffprobeBin: resolveBinary('FFPROBE_BIN', 'ffprobe'),

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'hinditrend'}:${process.env.POSTGRES_PASSWORD || 'hinditrend_dev_pass'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'hindi_trend_ai'}`,
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    vertexProjectId: process.env.VERTEX_PROJECT_ID || '40838304284',
    model: process.env.GEMINI_MODEL === 'auto' || !process.env.GEMINI_MODEL ? 'gemini-2.5-flash' : process.env.GEMINI_MODEL,
    dailyLimit: parseInt(process.env.DAILY_GEMINI_LIMIT || '100', 10),
  },

  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY || '',
  },

  tts: {
    provider: process.env.TTS_PROVIDER || 'gemini_native_tts',
    voiceHindi: process.env.TTS_VOICE_HINDI === 'hi-IN-SwaraNeural' || !process.env.TTS_VOICE_HINDI ? 'Aoede' : process.env.TTS_VOICE_HINDI,
    googleApiKey: process.env.GOOGLE_TTS_API_KEY || '',
    sarvamApiKey: process.env.SARVAM_API_KEY || '',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  },

  avatar: {
    provider: process.env.AVATAR_PROVIDER === 'local_expression_animator' || !process.env.AVATAR_PROVIDER ? 'veo-3.1-fast-generate-001' : process.env.AVATAR_PROVIDER,
  },

  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:4000/api/publish/youtube/callback',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
  },

  instagram: {
    appId: process.env.INSTAGRAM_APP_ID || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
    userId: process.env.INSTAGRAM_USER_ID || '',
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  },
};

function isGeminiConfigured() {
  return Boolean(
    env.gemini.apiKey &&
      env.gemini.apiKey !== 'YOUR_GOOGLE_CLOUD_GEMINI_API_KEY_HERE' &&
      env.gemini.apiKey.trim().length > 10
  );
}

function isYoutubeConfigured() {
  return Boolean(env.youtube.clientId && env.youtube.clientSecret && env.youtube.refreshToken);
}

function isInstagramConfigured() {
  return Boolean(env.instagram.userId && env.instagram.accessToken);
}

module.exports = {
  env,
  isGeminiConfigured,
  isYoutubeConfigured,
  isInstagramConfigured,
};
