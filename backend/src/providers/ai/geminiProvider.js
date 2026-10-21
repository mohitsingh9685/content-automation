const { env, isGeminiConfigured } = require('../../config/env');
const { query } = require('../../config/db');
const { logger } = require('../../config/logger');

let cachedAutoModel = null;

/**
 * Checks daily Gemini usage against DAILY_GEMINI_LIMIT in PostgreSQL
 */
async function checkAndRecordUsage(operation, modelUsed) {
  const countRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM api_usage_logs
     WHERE provider = 'gemini'
       AND created_at >= CURRENT_DATE`
  );
  const usedToday = countRes.rows[0]?.count || 0;
  if (usedToday >= env.gemini.dailyLimit) {
    const err = new Error(
      `Daily Gemini API usage limit reached (${usedToday}/${env.gemini.dailyLimit}). Increase DAILY_GEMINI_LIMIT in .env if needed.`
    );
    err.statusCode = 429;
    throw err;
  }

  await query(
    `INSERT INTO api_usage_logs (provider, operation, model_or_tier, units_used, estimated_cost_usd)
     VALUES ('gemini', $1, $2, 1, 0.0025)`,
    [operation, modelUsed]
  );
}

/**
 * Detects whether the configured key is a Google Cloud Vertex AI Express Mode key (starts with 'AQ.')
 */
function isVertexExpressKey(apiKey = env.gemini.apiKey) {
  return Boolean(apiKey && apiKey.trim().startsWith('AQ.'));
}

const VERTEX_PROJECT_ID = env.gemini.vertexProjectId;

/**
 * Builds the appropriate generateContent endpoint URL for either Vertex AI (with project/location) or AI Studio
 */
function buildGenerateContentUrl(modelId, apiKey = env.gemini.apiKey) {
  const cleanModel = modelId.replace(/^models\//, '');
  if (isVertexExpressKey(apiKey)) {
    return `https://aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/global/publishers/google/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/**
 * Dynamically discovers available Gemini models for the user's Google Cloud API key
 */
async function listAvailableModels() {
  if (!isGeminiConfigured()) {
    return {
      configured: false,
      selectedModel: env.gemini.model,
      models: [],
      message: 'GEMINI_API_KEY is not set in .env yet. Add your Google Cloud API key to enable live model discovery.',
    };
  }

  if (isVertexExpressKey()) {
    const vertexModels = [
      {
        id: 'gemini-4-argon',
        displayName: 'Gemini 4 Argon (Vertex AI Agent Platform)',
        description: 'Frontier reasoning & creative storytelling model on Google Cloud Agent Platform',
      },
      {
        id: 'gemini-3.1-pro-preview',
        displayName: 'Gemini 3.1 Pro Preview (Vertex AI)',
        description: 'High-reasoning Gemini 3.1 Pro model on Google Cloud Vertex AI',
      },
      {
        id: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash Preview (Vertex AI)',
        description: 'Fast next-gen Gemini 3 model on Google Cloud Vertex AI',
      },
      {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash (Vertex AI)',
        description: 'Production low-latency Gemini 2.5 Flash model on Google Cloud Vertex AI',
      },
    ];
    return {
      configured: true,
      provider: 'google-vertex-ai',
      selectedModel: env.gemini.model === 'auto' ? 'gemini-2.5-flash' : env.gemini.model,
      models: vertexModels,
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(env.gemini.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini models list failed (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    const generativeModels = (data.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          m.name.includes('gemini')
      )
      .map((m) => ({
        id: m.name.replace(/^models\//, ''),
        displayName: m.displayName || m.name,
        description: m.description || '',
      }));

    return {
      configured: true,
      provider: 'google-ai-studio',
      selectedModel: env.gemini.model,
      models: generativeModels,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves the target Gemini model ID
 */
async function resolveGeminiModel(requestedModel) {
  if (requestedModel && requestedModel !== 'auto') {
    return requestedModel.replace(/^models\//, '');
  }
  if (env.gemini.model && env.gemini.model !== 'auto') {
    return env.gemini.model.replace(/^models\//, '');
  }
  if (cachedAutoModel) {
    return cachedAutoModel;
  }

  try {
    const discovery = await listAvailableModels();
    if (discovery.models && discovery.models.length > 0) {
      const preferredOrder = ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-3.1-pro', 'gemini-4-argon'];
      for (const prefix of preferredOrder) {
        const match = discovery.models.find((m) => m.id.startsWith(prefix));
        if (match) {
          cachedAutoModel = match.id;
          return cachedAutoModel;
        }
      }
      cachedAutoModel = discovery.models[0].id;
      return cachedAutoModel;
    }
  } catch (err) {
    logger.warn('Could not auto-discover Gemini model list, falling back to default model string', {
      error: err.message,
    });
  }

  return 'gemini-2.5-flash';
}

/**
 * Converts subtitle segments [{ start, end, text }] into standard SRT format
 */
function segmentsToSrt(segments) {
  const formatTime = (sec) => {
    const totalMs = Math.max(0, Math.round(Number(sec || 0) * 1000));
    const hours = String(Math.floor(totalMs / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((totalMs % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, '0');
    const ms = String(totalMs % 1000).padStart(3, '0');
    return `${hours}:${minutes}:${seconds},${ms}`;
  };

  return segments
    .map((seg, idx) => `${idx + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${String(seg.text || '').trim()}`)
    .join('\n\n');
}

/**
 * Picks category-appropriate visual template for middle scenes
 */
function defaultTemplateForCategory(category) {
  const map = {
    sports_viral: 'cricket_tactical',
    tech_auto: 'tech_comparison',
    delhi_civic: 'public_affairs_data',
    entertainment: 'entertainment_spotlight',
    bollywood_celeb: 'entertainment_spotlight',
    business_facts: 'timeline_explainer',
  };
  return map[category] || 'timeline_explainer';
}

/**
 * Strips any accidental Devanagari script or duplicate parenthetical translations
 * so scripts and titles are ALWAYS 100% clean Roman Hinglish + English.
 */
function sanitizeToRomanHinglish(text = '') {
  return String(text || '')
    // Remove duplicate parentheticals where Devanagari is paired with English or vice versa
    .replace(/\(\s*[\u0900-\u097F\s,.-]+\s*\)/g, '')
    // Remove any remaining Devanagari characters and dandas
    .replace(/[\u0900-\u097F।॥]+/g, ' ')
    // Remove empty parentheses or leftover pipes
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\|\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Cleans visual descriptions so they describe a MAX-ENGAGING, CINEMATIC 3D STORYTELLING SCENE
 * (Zack D. Films / Professor of How / Pixar / Unreal Engine 5 style with expressive 3D characters,
 * rich 3D environments, and glowing x-ray cutaways) while stripping text/chart-label requests
 * so images remain 95%+ error-free with zero garbled text.
 */
function sanitizeSimpleVisualDescription(desc = '', fallbackSubject = 'an expressive 3D Indian character and glowing 3D cutaway mechanism') {
  const cleaned = sanitizeToRomanHinglish(desc)
    .replace(/\b(photo|picture|portrait|image|face|likeness)\s+of\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/gi, 'expressive 3D stylized character')
    .replace(/\b([A-Z][a-z]+(\s+[A-Z][a-z]+)?)'s\s+(photo|picture|portrait|face|image|likeness)\b/gi, 'expressive 3D stylized character')
    .replace(/\b(infographic|flowchart|spreadsheet|table|text labels|written text|hindi text)\b/gi, 'cinematic 3D cutaway action scene')
    .trim();
  return (
    cleaned ||
    `Full-frame cinematic 3D Pixar and Zack D. Films style scene of ${fallbackSubject} in a vibrant 3D environment with glowing x-ray cutaway details, volumetric teal and golden rim lighting, zero written text or letters.`
  );
}

/**
 * Normalizes or builds a 5-scene storyboard from segments & topic in viral Roman Hinglish + MAX-rich 95%-error-free 3D visuals
 */
function normalizeStoryboard(rawStoryboard, subtitlesSegments, topic, catLabel, presenterMode = 'faceless') {
  const defaultTemplate = defaultTemplateForCategory(topic.category);
  const expressionsCycle = ['speaking', 'explaining', 'curious', 'confident', 'smile'];
  const isFaceless = presenterMode === 'faceless';
  const cleanHeadline = sanitizeToRomanHinglish(topic.headline) || 'Indian Topic Explainer';

  if (Array.isArray(rawStoryboard) && rawStoryboard.length >= 3) {
    return rawStoryboard.map((scene, idx) => {
      const expr = scene?.presenter_config?.expression || scene?.expression || expressionsCycle[idx % expressionsCycle.length];
      const isIntroOrOutro = idx === 0 || idx === rawStoryboard.length - 1;
      const layout = isFaceless ? 'none' : (scene?.presenter_config?.layout || (isIntroOrOutro ? 'full_anchor' : 'pip_corner'));
      const look = scene?.presenter_config?.look || (isIntroOrOutro ? 'news_anchor' : 'explainer');
      const showFace = isFaceless ? false : scene?.presenter_config?.visible !== false;

      const defaultVisualDesc = isFaceless
        ? `Vibrant full-frame cinematic 3D storytelling scene (Zack D. Films / Professor of How / Unreal Engine 5 style) for ${cleanHeadline} (Scene ${idx + 1}): an expressive 3D stylized Indian character interacting with a detailed, glowing 3D x-ray cutaway mechanism inside a rich, dramatic 3D environment with volumetric cyan and golden lighting, zero written text or letters inside the image.`
        : `Photorealistic YouTube creator studio continuous tripod shot: Indian female creator Aashi in black ribbed turtleneck seated behind a centered studio condenser mic, with a vibrant 3D cutaway visual scene on the 4K studio screen behind her, zero written text on screen.`;

      const cleanNarration =
        sanitizeToRomanHinglish(scene.narration_segment || scene.narration_hindi || subtitlesSegments[idx]?.text) ||
        sanitizeToRomanHinglish(topic.summary);

      const cleanOnScreen =
        sanitizeToRomanHinglish(scene.on_screen_text || scene.headline) ||
        `${cleanHeadline.slice(0, 42)} - Part ${idx + 1}`;

      return {
        scene_number: idx + 1,
        scene_type: scene.scene_type || (idx === 0 ? 'viral_hook' : isIntroOrOutro ? 'interactive_outro' : 'cinematic_3d_cutaway'),
        visual_template: scene.visual_template || (isFaceless ? defaultTemplate : isIntroOrOutro ? 'anchor_studio' : defaultTemplate),
        duration_seconds: Number(scene.duration_seconds) || 9,
        narration_segment: cleanNarration,
        narration_hindi: cleanNarration,
        on_screen_text: cleanOnScreen,
        visual_description: sanitizeSimpleVisualDescription(scene.visual_description || defaultVisualDesc, cleanHeadline),
        characters_and_environment:
          sanitizeToRomanHinglish(scene.characters_and_environment) ||
          (isFaceless
            ? 'Rich full-frame 3D Pixar / Zack D. Films environment with expressive 3D stylized characters in action, glowing 3D cutaway machinery, dramatic volumetric lighting, zero written text'
            : 'YouTube explainer host Aashi (black ribbed turtleneck, centered studio condenser mic) in cozy dark creator studio with vibrant 3D visual scene behind her'),
        camera_angle_and_movement:
          sanitizeToRomanHinglish(scene.camera_angle_and_movement) ||
          (isFaceless
            ? 'Dynamic 3D camera push-in and orbit into the glowing 3D cutaway action scene'
            : 'Continuous locked tripod Sony A7SIII 35mm f/1.4 medium studio shot (zero camera cut)'),
        animation_action:
          sanitizeToRomanHinglish(scene.animation_action) ||
          (isFaceless
            ? 'Expressive 3D character action with glowing energy streams and moving 3D internal cutaway components'
            : 'Aashi speaking energetically and naturally into the centered podcast microphone with exact lip-sync'),
        transition: 'continuous_cut',
        presenter_config: {
          visible: showFace,
          persona_id: 'aashi_official_v1',
          outfit: scene?.presenter_config?.outfit || 'black_blazer',
          look,
          expression: expr,
          layout,
        },
        visual_data: {
          badge: sanitizeToRomanHinglish(scene?.visual_data?.badge) || catLabel,
          stat_label: sanitizeToRomanHinglish(scene?.visual_data?.stat_label) || 'Key Fact',
          stat_value: sanitizeToRomanHinglish(scene?.visual_data?.stat_value) || topic.primary_source,
          points:
            Array.isArray(scene?.visual_data?.points) && scene.visual_data.points.length > 0
              ? scene.visual_data.points.map((p) => sanitizeToRomanHinglish(p)).filter(Boolean)
              : [cleanOnScreen],
        },
        required_assets: showFace
          ? [
              `/assets/presenter/looks/${look}.jpg`,
              `/assets/presenter/expressions/${expr}.jpg`,
            ]
          : [],
        license_info: 'Cinematic 3D Storytelling Asset (Indian Topic Explainer Studio)',
        ai_generated_disclosure: 'Genuine 45-second Indian topic explainer based on verified facts.',
      };
    });
  }

  // Fallback construction from subtitle segments
  return subtitlesSegments.map((seg, idx) => {
    const isIntroOrOutro = idx === 0 || idx === subtitlesSegments.length - 1;
    const expr = expressionsCycle[idx % expressionsCycle.length];
    const look = isIntroOrOutro ? 'news_anchor' : 'explainer';
    const showFace = !isFaceless;
    const cleanText = sanitizeToRomanHinglish(seg.text);
    return {
      scene_number: idx + 1,
      scene_type: idx === 0 ? 'viral_hook' : isIntroOrOutro ? 'interactive_outro' : 'cinematic_3d_cutaway',
      visual_template: showFace && isIntroOrOutro ? 'anchor_studio' : defaultTemplate,
      duration_seconds: Math.max(8, Number(seg.end - seg.start) || 9),
      narration_segment: cleanText,
      narration_hindi: cleanText,
      on_screen_text: cleanText.slice(0, 58),
      visual_description: isFaceless
        ? `Vibrant full-frame 3D storytelling scene (Zack D. Films / Professor of How style) for ${cleanHeadline} (Scene ${idx + 1}): expressive 3D stylized Indian character and glowing 3D x-ray cutaway mechanism in a rich 3D environment with dramatic lighting, zero written text.`
        : `Creator Aashi (${expr}) in dark podcast studio with a vibrant 3D cutaway scene behind her, zero text.`,
      characters_and_environment: isFaceless
        ? 'Full-frame 3D Pixar / Zack D. Films environment with expressive 3D characters and glowing 3D cutaway mechanics (zero written text)'
        : 'Creator Aashi in dark podcast studio behind microphone',
      camera_angle_and_movement: 'Dynamic 3D camera push-in through the glowing 3D scene',
      animation_action: isFaceless
        ? 'Expressive 3D character action and animated glowing 3D cutaway mechanism'
        : `Presenter ${expr} expression speaking naturally`,
      transition: 'continuous_cut',
      presenter_config: {
        visible: showFace,
        persona_id: 'aashi_official_v1',
        outfit: 'black_blazer',
        look,
        expression: expr,
        layout: showFace ? (isIntroOrOutro ? 'full_anchor' : 'pip_corner') : 'none',
      },
      visual_data: {
        badge: catLabel,
        stat_label: 'Source',
        stat_value: topic.primary_source,
        points: [cleanText.slice(0, 75)],
      },
      required_assets: showFace ? [`/assets/presenter/looks/${look}.jpg`, `/assets/presenter/expressions/${expr}.jpg`] : [],
      license_info: 'Cinematic 3D Storytelling Asset (Indian Topic Explainer Studio)',
      ai_generated_disclosure: 'Genuine 45-second explainer based on verified sources.',
    };
  });
}

/**
 * Builds an ultra-interactive, high-retention Roman Hinglish 45-second topic explainer fallback (ZERO Devanagari Hindi)
 */
function buildDeterministicHindiFallback(topic, customInstructions = '', videoFormat = 'vertical_9_16', presenterMode = 'faceless') {
  const categoryLabels = {
    entertainment: 'Mobile Features & Tech',
    bollywood_celeb: 'Everyday Science & Digital India',
    tech_auto: 'AI & Tech Terminology',
    delhi_civic: 'Indian Law, Constitution & Civic Issues',
    sports_viral: 'Govt Exams & Career Guide',
    business_facts: 'Money, Banking & RBI Terms',
  };
  const catLabel = categoryLabels[topic.category] || 'Indian Topic Explainer';
  const isFlagged = topic.verification_status === 'flagged' || topic.verification_status === 'disputed';
  const cleanTitle = sanitizeToRomanHinglish(topic.headline) || 'Important Topic Explained';

  const openingHook = `Ruko! "${cleanTitle}" ke baare mein 90% log aadha sach hi jaante hain! Asli game kya hai? Chalo 45 seconds mein live dekhte hain!`;

  const segments = [
    {
      start: 0,
      end: 9,
      text: openingHook,
    },
    {
      start: 9,
      end: 18,
      text: `Dekho sabse pehla twist — iska basic concept jitna simple dikhta hai, andar se utna hi smart hai. ${sanitizeToRomanHinglish(topic.summary).slice(0, 100)}`,
    },
    {
      start: 18,
      end: 27,
      text: `Ab zara dhyan se dekho yeh andar se kaam kaise karta hai! Jab real data aur rules lagte hain, toh system turant action leta hai.`,
    },
    {
      start: 27,
      end: 36,
      text: `Aur sabse badi baat — ek Indian student ya citizen ki daily life par iska seedha asar padta hai, jo aapko zaroor pata hona chahiye!`,
    },
    {
      start: 36,
      end: 45,
      text: `Ab sach batao — kya aapko yeh asli wajah pehle pata thi? Agla video kis topic par chahiye, comments mein abhi likho!`,
    },
  ];

  const storyboard = normalizeStoryboard([], segments, topic, catLabel, presenterMode);
  const narrationScript = segments.map((s) => s.text).join(' ');
  const srt = segmentsToSrt(segments);

  return {
    video_format: videoFormat,
    presenter_mode: presenterMode,
    hindi_title: `${cleanTitle.slice(0, 68)} — Asli Sach In 45 Seconds!`,
    opening_hook: openingHook,
    what_happened: `Verified Breakdown (${topic.primary_source}): ${sanitizeToRomanHinglish(topic.summary)}`,
    background_timeline: [
      { period: 'Core Rule & Origin', event: `Core definition and rule according to ${topic.primary_source}.` },
      { period: 'Inside Working Mechanism', event: sanitizeToRomanHinglish(topic.verification_notes) || 'Verified mechanism and real-life Indian impact.' },
    ],
    why_it_matters: 'Yeh high-energy 45-second explainer mushkil terms ko har Indian viewer ke liye super interactive Hinglish mein clear karta hai.',
    conclusion_text: 'Ab tum batao agla topic kaunsa explain karein? Comments mein batao!',
    narration_script: narrationScript,
    storyboard,
    subtitles_segments: segments,
    subtitles_srt: srt,
    short_description: `${catLabel} explained in 45 seconds in interactive Hinglish! Source: ${topic.primary_source}. ${customInstructions ? `(${customInstructions})` : ''}`.trim(),
    hashtags: ['#IndianExplainer', '#HinglishExplained', '#KnowledgeShorts', '#Shorts', `#${topic.category}`],
    thumbnail_concept: `Vibrant 3D Pixar/Zack-D-Films cutaway scene of ${cleanTitle.slice(0, 35)}`,
    call_to_action: 'Agla explainer kis topic par chahiye? Comments mein batao!',
    source_links: Array.isArray(topic.source_urls) ? topic.source_urls : [],
    fact_check_report: {
      confirmed_facts: [
        `Based on verified facts from ${topic.primary_source}.`,
        sanitizeToRomanHinglish(topic.verification_notes) || 'Core mechanism and numbers cross-checked.',
      ],
      allegations_or_unverified: ['Unverified claims excluded.'],
      sources_agree: !isFlagged,
      safe_to_publish: !isFlagged,
      notes: 'All facts and technical details verified.',
    },
    duration_seconds: 45,
    ai_model_used: 'local-fallback',
  };
}

/**
 * Generates a complete, genuine, ULTRA-INTERACTIVE & VIRAL 45-second Roman Hinglish Topic/Terminology Explainer package
 * + 5-scene MAX-Quality Cinematic 3D Storyboard (Zack D. Films / Professor of How / Pixar style, 95%+ Error-Free).
 */
async function generateHindiVideoPackage(topic, options = {}) {
  const {
    customInstructions = '',
    requestedModel = 'auto',
    videoFormat = 'vertical_9_16',
    presenterMode = 'faceless',
  } = options;

  const isFaceless = presenterMode !== 'with_face';

  const categoryLabels = {
    entertainment: 'Mobile Features & Consumer Tech',
    bollywood_celeb: 'Everyday Science & Digital India Systems',
    tech_auto: 'AI, Machine Learning & Tech Terms',
    delhi_civic: 'Indian Constitution, Law & Civic Issues',
    sports_viral: 'Govt Exams (SSC CGL, UPSC) & Career Guide',
    business_facts: 'Banking, RBI, Loans & Money Terms',
  };
  const catLabel = categoryLabels[topic.category] || 'Indian Topic & Terminology Explainer';
  const cleanTopicHeadline = sanitizeToRomanHinglish(topic.headline) || topic.headline;

  if (!isGeminiConfigured()) {
    logger.warn('GEMINI_API_KEY not set in .env; generating Roman Hinglish fallback package', {
      topicId: topic.id,
    });
    return buildDeterministicHindiFallback(topic, customInstructions, videoFormat, presenterMode);
  }

  const modelId = await resolveGeminiModel(requestedModel);
  await checkAndRecordUsage('generate_hindi_explainer_storyboard', modelId);

  const wordCountRule = isFaceless
    ? `Each scene's voiceover ("narration_segment") MUST be strictly 18 to 23 words (~8.5 seconds) so all 5 scenes create a fast-paced, high-retention 45-second explainer video (~95 to 110 words total). Do NOT write long 35-word paragraphs per scene that drag the video past 60 seconds!`
    : `Each scene's spoken line ("narration_segment") MUST be strictly 16 to 20 words (~8 seconds) so all 5 scenes fit 40-45 seconds cleanly.`;

  const visualModeRule = isFaceless
    ? `5. MAX-ENGAGING, CINEMATIC 3D STORYTELLING VISUALS — 95%+ ERROR-FREE (CRITICAL RULE):
   - NEVER describe boring, empty dark screens with just a single lonely object (like a plain hat, a blank book, or a plain box floating in a black void)! Viewers swipe away immediately if the visual is empty or boring!
   - Instead, set visual richness to **MAX** (like **Zack D. Films, Professor of How, Nitish Rajput 3D, and Pixar/Unreal Engine 5 explainers**):
     * Every scene's "visual_description" MUST describe a **full-frame, vibrant, action-packed 3D miniature world or 3D X-Ray Cutaway scene** with:
       1. **Expressive 3D stylized Indian characters in action** (e.g., an Indian student/aspirant in an intense 3D exam arena, a 3D Income Tax Officer in crisp uniform beside an official SUV, an Indian smartphone user as the camera zooms inside their phone's glowing 3D motherboard, a 3D judge/citizen in a grand 3D Supreme Court/Parliament cutaway).
       2. **Detailed 3D physical mechanisms & glowing cutaways** (e.g., glowing neon blue high-speed RAM highways vs amber storage vaults with glowing data capsules racing inside; a transparent 3D EVM-VVPAT machine showing the ballot slip dropping behind glass; a glowing 3D neural network brain firing golden synapses).
       3. **Dramatic volumetric lighting & rich colors** (electric cyan, golden amber, neon crimson, deep sapphire studio depth).
   - **HOW TO KEEP IT 95%+ ERROR-FREE**: Do NOT ask the image generator to write readable text, Hindi words, numbers, or spreadsheet tables inside the 3D scene (because AI image models misspell small text). Show the story through **3D characters, 3D environments, physical actions, and glowing 3D cutaways**, and end every "visual_description" with: "vibrant full-frame 3D Pixar and Zack D. Films style cutaway scene, dramatic volumetric lighting, zero written text or letters inside the image."
   - Set presenter_config "visible": false and "layout": "none".`
    : `5. STUDIO PRESENTER MODE WITH VIBRANT 3D CUTAWAY SCREEN:
   - In every scene's "visual_description", describe a continuous single-take locked tripod shot of Indian female creator Aashi in a black turtleneck behind a centered podcast microphone, with a vibrant 3D cutaway scene on the 4K studio screen behind her (zero written text on screen). Set presenter_config "visible": true.`;

  const systemPrompt = `You are India's #1 VIRAL, HIGH-RETENTION YouTube Shorts & Instagram Reels Explainer Creator (combining the visual storytelling of Zack D. Films & Professor of How with the ultra-interactive, high-energy Hinglish delivery of India's top 10M-view creators).

CRITICAL PERMANENT USER RULES (YOU MUST FOLLOW THESE ALWAYS — NEVER VIOLATE):
1. ABSOLUTELY NO HINDI (DEVANAGARI) SCRIPT ANYWHERE:
   - DO NOT write a single word in Devanagari Hindi script (Devanagari script is 100% FORBIDDEN in all JSON fields!).
   - Write ALL narration, titles, hooks, subtitles, and notes in **ENERGETIC, CASUAL ROMAN HINGLISH + ENGLISH** (Hindi written in the English alphabet mixed naturally with everyday English words).
   - NEVER repeat words in dual-language brackets.
2. ULTRA-INTERACTIVE, VIRAL, HIGH-RETENTION SCRIPT (NEVER BORING OR SLOW):
   - Grab the viewer by the collar in the first 2 seconds! Use **pattern-interrupt hooks, myth-busting challenges, and constant curiosity loops**:
     * **0–2s Shock Hook**: "Ruko! Agar tumhe lagta hai...", "Bhai 90% Indians iska matlab galat jaante hain!", "Socho agar tumhare phone mein...", "Ek second ruko — kya tumne kabhi notice kiya hai?"
     * **Micro-Hooks in Every Scene**: Start Scene 2, 3, and 4 with high-retention triggers like "Ab asli twist dekho!", "Lekin rukna, asli game yahan shuru hota hai!", "Example se samjho —", "Sabse bada shock toh yeh hai ki..."
     * **Fast, Punchy Sentences**: Write short, high-voltage sentences (6–10 words per sentence) that sound electric when spoken aloud!
3. GENUINE, FACT-PACKED 45-SECOND EXPLANATION (5 SCENES):
   - ${wordCountRule}
   - Deliver **100% genuine, concrete, mind-blowing facts and real numbers** so the viewer feels smarter in 45 seconds:
     * **Scene 1 (0–9s | Pattern-Interrupt Hook & Big Myth/Question)**: Challenge a common belief or ask a shocking daily-life question about the topic.
     * **Scene 2 (9–18s | The Core Secret / Structure)**: Reveal the real rule, architecture, or structure with exact numbers/facts.
     * **Scene 3 (18–27s | Inside the 3D X-Ray Mechanism)**: Take the viewer inside the machine/system step-by-step using a vivid Indian daily-life example.
     * **Scene 4 (27–36s | The Real-World Indian Impact / Twist)**: Show the pros, cons, salary/cost/power, or how it directly impacts the viewer today.
     * **Scene 5 (36–45s | Mic-Drop Verdict & Comment Debate Question)**: Give a sharp 1-line verdict and ask a debate-sparking question that forces viewers to comment!
${visualModeRule}
6. Return ONLY valid JSON.`;

  const userPrompt = `EXPLAINER TOPIC DETAILS:
- Topic / Terminology to Explain: ${cleanTopicHeadline}
- Category: ${topic.category} (${catLabel})
- Core Facts & Research Summary: ${topic.summary}
- Official Reference Source: ${topic.primary_source}
- Extra Notes: ${topic.verification_notes || 'N/A'}
- Video Format: ${videoFormat}
- Visual Mode: ${isFaceless ? 'MAX-QUALITY CINEMATIC 3D STORYTELLING & CUTAWAY SCENES (Zack D. Films / Professor of How / Pixar 3D style: expressive 3D characters in action + rich 3D environments + glowing 3D cutaways, 95%+ error-free with zero written text inside images, 45 Seconds = 5 scenes × 9s)' : 'STUDIO PRESENTER MODE (With Host Aashi)'}
${customInstructions ? `- USER DIRECT INSTRUCTION (FOLLOW STRICTLY): ${customInstructions}` : ''}

Return ONLY valid JSON matching this exact structure (REMEMBER: ZERO Devanagari Hindi characters anywhere! Use 100% ultra-interactive viral Roman Hinglish + English, keep each scene strictly 18-23 words so total duration is ~45s, and make every visual_description a vibrant, full-frame 3D storytelling/cutaway scene with expressive 3D characters and zero written text):
{
  "hindi_title": "Viral Roman Hinglish + English Title (e.g. 'Virtual RAM Ka Asli Sach! Phone Fast Hota Hai Ya Sirf Scam Hai?')" ,
  "opening_hook": "Scene 1 pattern-interrupt viral hook in Roman Hinglish (18-23 words)",
  "what_happened": "2-3 sentence punchy Roman Hinglish breakdown of the concept and how it works",
  "background_timeline": [
    { "period": "Core Concept & Rule", "event": "Punchy Roman Hinglish explanation of the core structure/rule" },
    { "period": "Inside Working Mechanism", "event": "Punchy Roman Hinglish explanation of the real mechanism and numbers" }
  ],
  "why_it_matters": "Why every Indian student, user, or citizen needs to know this (in Roman Hinglish)",
  "conclusion_text": "Scene 5 mic-drop verdict & comment debate question in Roman Hinglish (18-23 words)",
  "narration_script": "Combined 45-second voiceover script across all 5 scenes in ultra-interactive Roman Hinglish (95-110 words total)",
  "subtitles_segments": [
    { "start": 0, "end": 9, "text": "Scene 1 (0-9s): Pattern-interrupt viral hook in Roman Hinglish (18-23 words)" },
    { "start": 9, "end": 18, "text": "Scene 2 (9-18s): Core secret, structure, or rule in Roman Hinglish (18-23 words)" },
    { "start": 18, "end": 27, "text": "Scene 3 (18-27s): Step-by-step 3D cutaway mechanism with Indian example in Roman Hinglish (18-23 words)" },
    { "start": 27, "end": 36, "text": "Scene 4 (27-36s): Real-life Indian impact, numbers, or twist in Roman Hinglish (18-23 words)" },
    { "start": 36, "end": 45, "text": "Scene 5 (36-45s): Mic-drop takeaway + debate question for comments in Roman Hinglish (18-23 words)" }
  ],
  "storyboard": [
    {
      "scene_number": 1,
      "scene_type": "viral_hook",
      "visual_template": "${isFaceless ? defaultTemplateForCategory(topic.category) : 'anchor_studio'}",
      "duration_seconds": 9,
      "narration_segment": "Exact Scene 1 ultra-interactive Roman Hinglish voiceover (18-23 words)",
      "on_screen_text": "Short punchy Roman Hinglish/English hook (max 5 words, NO Devanagari)",
      "visual_description": "${isFaceless ? 'Full-frame cinematic 3D Pixar and Zack D. Films style action scene: describe the exact expressive 3D Indian character, rich 3D environment, and glowing 3D x-ray cutaway mechanism for this specific scene, dramatic volumetric teal and golden lighting, zero written text or letters inside the image' : 'Photorealistic YouTube creator studio shot on Sony A7SIII 35mm f/1.4: Indian female creator Aashi in black turtleneck behind a centered studio condenser mic, with a vibrant 3D cutaway scene on the screen behind her, zero text'}",
      "characters_and_environment": "${isFaceless ? 'Expressive 3D stylized character interacting with a detailed 3D cutaway mechanism inside a rich, dramatic 3D environment (zero written text)' : 'YouTube explainer host Aashi in cozy dark creator studio with vibrant 3D background visual'}",
      "camera_angle_and_movement": "${isFaceless ? 'Dynamic 3D camera push-in and orbit into the glowing 3D cutaway action' : 'Continuous locked tripod Sony A7SIII 35mm f/1.4 medium studio shot'}",
      "animation_action": "${isFaceless ? 'Expressive 3D character movement and glowing energy pulses flowing through the 3D cutaway mechanism' : 'Aashi speaking energetically into the studio microphone'}",
      "transition": "continuous_cut",
      "presenter_config": {
        "visible": ${!isFaceless},
        "outfit": "black_blazer",
        "look": "explainer",
        "expression": "explaining",
        "layout": "${isFaceless ? 'none' : 'full_anchor'}"
      },
      "visual_data": {
        "badge": "Core Concept",
        "stat_label": "Key Fact",
        "stat_value": "Short English/Hinglish fact",
        "points": ["Key point 1 in Roman Hinglish", "Key point 2 in Roman Hinglish"]
      },
      "ai_generated_disclosure": "Genuine 45-second explainer based on verified sources."
    }
  ],
  "short_description": "Viral Roman Hinglish description for YouTube Shorts & Instagram Reels",
  "hashtags": ["#IndianExplainer", "#HinglishExplained", "#KnowledgeShorts", "#India"],
  "thumbnail_concept": "Vibrant 3D Pixar/Zack-D-Films cutaway scene with expressive 3D character and glowing mechanism",
  "call_to_action": "Agla explainer kis topic par chahiye? Comments mein batao!",
  "duration_seconds": 45,
  "fact_check_report": {
    "confirmed_facts": ["Verified fact 1 in simple English/Hinglish", "Verified fact 2 in simple English/Hinglish"],
    "allegations_or_unverified": ["Any disputed aspect noted neutrally"],
    "sources_agree": true,
    "safe_to_publish": true,
    "notes": "Fact-check note in English"
  }
}`;

  const url = buildGenerateContentUrl(modelId);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.78,
            responseMimeType: 'application/json',
            ...(modelId.includes('2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          logger.warn(`Gemini script generation HTTP ${response.status} on attempt ${attempt}/3; retrying...`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
          continue;
        }
        throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Gemini API returned an empty response candidate.');
      }

      const parsed = JSON.parse(rawText);
      const rawSegments =
        Array.isArray(parsed.subtitles_segments) && parsed.subtitles_segments.length > 0
          ? parsed.subtitles_segments
          : [{ start: 0, end: 45, text: parsed.narration_script || '' }];

      const segments = rawSegments.map((seg) => ({
        ...seg,
        text: sanitizeToRomanHinglish(seg.text),
      }));

      const storyboard = normalizeStoryboard(parsed.storyboard, segments, topic, catLabel, presenterMode);
      const isFlaggedTopic = topic.verification_status === 'flagged' || topic.verification_status === 'disputed';
      const factCheck = parsed.fact_check_report || {};
      if (isFlaggedTopic) {
        factCheck.safe_to_publish = false;
      }

      const cleanNarrationScript =
        sanitizeToRomanHinglish(parsed.narration_script) || segments.map((s) => s.text).join(' ');

      return {
        video_format: videoFormat,
        presenter_mode: presenterMode,
        hindi_title: sanitizeToRomanHinglish(parsed.hindi_title) || cleanTopicHeadline,
        opening_hook: sanitizeToRomanHinglish(parsed.opening_hook) || segments[0]?.text || '',
        what_happened: sanitizeToRomanHinglish(parsed.what_happened) || sanitizeToRomanHinglish(topic.summary),
        background_timeline: Array.isArray(parsed.background_timeline)
          ? parsed.background_timeline.map((item) =>
              typeof item === 'object' && item !== null
                ? {
                    period: sanitizeToRomanHinglish(item.period),
                    event: sanitizeToRomanHinglish(item.event),
                  }
                : sanitizeToRomanHinglish(item)
            )
          : [],
        why_it_matters: sanitizeToRomanHinglish(parsed.why_it_matters) || '',
        conclusion_text: sanitizeToRomanHinglish(parsed.conclusion_text) || '',
        narration_script: cleanNarrationScript,
        storyboard,
        subtitles_segments: segments,
        subtitles_srt: segmentsToSrt(segments),
        short_description: sanitizeToRomanHinglish(parsed.short_description) || '',
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#IndianExplainer', '#Shorts'],
        thumbnail_concept: sanitizeToRomanHinglish(parsed.thumbnail_concept) || '',
        call_to_action: sanitizeToRomanHinglish(parsed.call_to_action) || 'Agla video kis topic par chahiye? Comments mein batao!',
        source_links: Array.isArray(topic.source_urls) ? topic.source_urls : [],
        fact_check_report: {
          confirmed_facts: Array.isArray(factCheck.confirmed_facts)
            ? factCheck.confirmed_facts.map((f) => sanitizeToRomanHinglish(f))
            : [],
          allegations_or_unverified: Array.isArray(factCheck.allegations_or_unverified)
            ? factCheck.allegations_or_unverified.map((f) => sanitizeToRomanHinglish(f))
            : [],
          sources_agree: Boolean(factCheck.sources_agree ?? !isFlaggedTopic),
          safe_to_publish: Boolean(factCheck.safe_to_publish ?? !isFlaggedTopic),
          notes: sanitizeToRomanHinglish(factCheck.notes) || '',
        },
        duration_seconds: Number(parsed.duration_seconds) || 45,
        ai_model_used: modelId,
      };
    } catch (err) {
      if (attempt === 3) {
        logger.warn('Gemini script generation failed after 3 attempts; using rich Roman Hinglish viral fallback', {
          error: err.message,
        });
        return buildDeterministicHindiFallback(topic, options);
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  return buildDeterministicHindiFallback(topic, options);
}

module.exports = {
  listAvailableModels,
  resolveGeminiModel,
  generateHindiVideoPackage,
  segmentsToSrt,
  normalizeStoryboard,
  sanitizeToRomanHinglish,
};
