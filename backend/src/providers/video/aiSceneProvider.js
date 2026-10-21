const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { env, isGeminiConfigured } = require('../../config/env');
const { logger } = require('../../config/logger');

const FFMPEG_BIN = env.ffmpegBin;

const VERTEX_PROJECT_ID = env.gemini.vertexProjectId;
const VERTEX_LOCATIONS = ['global', 'us-central1'];

const CATEGORY_3D_STYLE_GUIDE = {
  tech_auto:
    'a vibrant 3D Pixar and Zack D. Films style cutaway scene featuring an expressive 3D stylized Indian engineer/user beside a giant transparent 3D computer or neural brain core with glowing cyan and golden data streams racing through micro-pathways in a high-tech 3D lab',
  sports_viral:
    'a dramatic 3D Pixar and Zack D. Films style scene featuring an expressive 3D Indian graduate aspirant and a 3D central government officer in crisp uniform inside a grand 3D examination & officer headquarters diorama with glowing golden emblems and volumetric lighting',
  entertainment:
    'a vibrant 3D Zack D. Films and Professor of How style x-ray cutaway inside a giant futuristic 3D smartphone where glowing neon cyan high-speed RAM highways and golden storage vaults operate in real time while an expressive 3D Indian user interacts with it',
  bollywood_celeb:
    'a rich 3D Pixar and Professor of How style cutaway diorama of India’s digital payment & satellite infrastructure with expressive 3D Indian citizens, glowing fiber-optic energy bridges, and a giant 3D bank vault core',
  delhi_civic:
    'a dramatic 3D Zack D. Films and Professor of How style cutaway of the Indian Parliament, Supreme Court scales of justice, or transparent 3D EVM-VVPAT machine with expressive 3D Indian citizens and golden volumetric beams',
  business_facts:
    'a cinematic 3D Pixar and Professor of How style cutaway of the Reserve Bank vault and commercial banking pipeline with an expressive 3D Indian family, glowing golden coin streams, and a giant 3D interest-rate lever in action',
};

const EXPRESSION_PROMPT_MAP = {
  speaking:
    'confident, engaging speaking expression behind the studio condenser microphone with hands resting calmly on the desk',
  explaining:
    'intelligent, articulate explaining expression behind the studio condenser microphone with calm studio posture',
  serious:
    'focused, serious investigative documentary expression, delivering verified facts into the studio condenser microphone',
  curious:
    'curious, analytical expression with raised eyebrows behind the studio condenser microphone',
  questioning:
    'thought-provoking analytical expression behind the studio condenser microphone',
  surprised:
    'expressive, insightful expression as she reveals a major data point behind the studio microphone',
  confident:
    'poised, authoritative and warm confident expression at the studio podcast desk',
  smile:
    'warm, intelligent conversational smile as she delivers the concluding insight into the studio microphone',
  excited:
    'engaged, articulate expression highlighting a key breakthrough behind the studio microphone',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ensures we have aspect-ratio-matched canonical reference canvases of Aashi
 * (`hero_anchor_9_16.jpg` and `hero_anchor_16_9.jpg`) so `gemini-2.5-flash-image`
 * generates true edge-to-edge 9:16 or 16:9 frames without black letterbox bars.
 */
function ensurePresenterReferenceCanvas(videoFormat = '9:16') {
  const presenterDir = path.join(env.assetsDir, 'presenter');
  const heroPath = path.join(presenterDir, 'hero_anchor.jpg');
  const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
  const targetRefPath = path.join(
    presenterDir,
    isHorizontal ? 'hero_anchor_16_9.jpg' : 'hero_anchor_9_16.jpg'
  );

  if (!fs.existsSync(targetRefPath) && fs.existsSync(heroPath)) {
    const dims = isHorizontal ? '1344:768' : '768:1344';
    try {
      execFileSync(FFMPEG_BIN, [
        '-y',
        '-i',
        heroPath,
        '-vf',
        `scale=${dims}:force_original_aspect_ratio=increase,crop=${dims}`,
        '-frames:v',
        '1',
        '-update',
        '1',
        targetRefPath,
      ]);
    } catch (err) {
      logger.warn('Could not pre-scale presenter reference canvas, using hero_anchor.jpg directly', {
        error: err.message,
      });
      return heroPath;
    }
  }
  return fs.existsSync(targetRefPath) ? targetRefPath : heroPath;
}

/**
 * Builds the Vertex AI or AI Studio endpoint URL for a given location
 */
function buildImageEndpointUrl(apiKey, location = 'global') {
  const isVertex = apiKey.startsWith('AQ.');
  if (!isVertex) {
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
  }
  const host =
    location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/${location}/publishers/google/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/**
 * Normalizes any generated PNG cleanly to full-bleed 9:16 (1080x1920) or 16:9 (1920x1080)
 * by automatically detecting and removing any black letterbox bars before Lanczos center-fill scaling.
 */
function normalizeFullBleedFrame(pngPath, isHorizontal = false) {
  const W = isHorizontal ? 1920 : 1080;
  const H = isHorizontal ? 1080 : 1920;
  const tmpOut = `${pngPath}.norm.png`;
  try {
    let cropFilter = '';
    try {
      const detectOut = execFileSync(
        FFMPEG_BIN,
        ['-i', pngPath, '-vf', 'cropdetect=limit=18:round=2:reset=0', '-f', 'null', '-'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const matches = [...String(detectOut || '').matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
      if (matches.length > 0) {
        const lastCrop = matches[matches.length - 1][1];
        const [cw, ch] = lastCrop.split(':').map(Number);
        if (cw >= 320 && ch >= 320) {
          cropFilter = `crop=${lastCrop},`;
        }
      }
    } catch (detectErr) {
      const stderr = String(detectErr?.stderr || '');
      const matches = [...stderr.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
      if (matches.length > 0) {
        const lastCrop = matches[matches.length - 1][1];
        const [cw, ch] = lastCrop.split(':').map(Number);
        if (cw >= 320 && ch >= 320) {
          cropFilter = `crop=${lastCrop},`;
        }
      }
    }

    execFileSync(FFMPEG_BIN, [
      '-y',
      '-i',
      pngPath,
      '-vf',
      `${cropFilter}scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`,
      '-frames:v',
      '1',
      '-update',
      '1',
      tmpOut,
    ]);
    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 5000) {
      fs.renameSync(tmpOut, pngPath);
    }
  } catch (err) {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

/**
 * Creates a complementary close-up 3D cutaway framing (`phase1Png`) from `phase0Png`
 * focusing closer on the 3D cutaway model & pointer arrow while keeping Aashi 100% in frame.
 */
function deriveCloseUp3DCutawayFrame(phase0Png, phase1Png, isHorizontal = false, sceneIndex = 0) {
  const W = isHorizontal ? 1920 : 1080;
  const H = isHorizontal ? 1080 : 1920;
  const zoomW = Math.round(W * 1.08);
  const zoomH = Math.round(H * 1.08);
  // Anchor crop toward Aashi's corner (bottom-right for even scenes, bottom-left for odd scenes)
  const cropX = sceneIndex % 2 === 0 ? zoomW - W : 0;
  const cropY = Math.round((zoomH - H) * 0.65);

  try {
    execFileSync(FFMPEG_BIN, [
      '-y',
      '-i',
      phase0Png,
      '-vf',
      `scale=${zoomW}:${zoomH}:flags=lanczos,crop=${W}:${H}:${cropX}:${cropY},eq=contrast=1.03:saturation=1.06`,
      '-frames:v',
      '1',
      '-update',
      '1',
      phase1Png,
    ]);
  } catch (err) {
    fs.copyFileSync(phase0Png, phase1Png);
  }
}

/**
 * Calls `gemini-2.5-flash-image` with an optional reference photo, rotating across
 * Vertex AI locations (`global`, `us-central1`) and retrying with exponential backoff on HTTP 429.
 */
async function callGemini3DSceneImage({
  refImagePath = null,
  prompt,
  aspectRatio = '9:16',
  outputPngPath,
  sceneIndex = 0,
}) {
  const apiKey = env.gemini.apiKey.trim();
  const refB64 = refImagePath && fs.existsSync(refImagePath) ? fs.readFileSync(refImagePath).toString('base64') : null;

  const userParts = [];
  if (refB64) {
    userParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: refB64,
      },
    });
  }
  userParts.push({ text: prompt });

  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const location = VERTEX_LOCATIONS[(sceneIndex + attempt) % VERTEX_LOCATIONS.length];
    const url = buildImageEndpointUrl(apiKey, location);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: userParts,
            },
          ],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              aspectRatio,
            },
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = new Error(`gemini-2.5-flash-image (${location}) HTTP ${res.status}: ${errText.slice(0, 220)}`);
        if (res.status === 429 || res.status >= 500) {
          const waitMs = 5500 * (attempt + 1);
          logger.warn(`gemini-2.5-flash-image rate limited on ${location}; retrying in ${waitMs}ms`, {
            attempt: attempt + 1,
            location,
          });
          clearTimeout(timeout);
          await sleep(waitMs);
          continue;
        }
        throw lastError;
      }

      const data = await res.json();
      const imgPart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData && p.inlineData.data);
      if (!imgPart) {
        throw new Error('gemini-2.5-flash-image response did not contain inline image data');
      }

      const rawBuf = Buffer.from(imgPart.inlineData.data, 'base64');
      fs.writeFileSync(outputPngPath, rawBuf);
      return outputPngPath;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(4000 * (attempt + 1));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Failed to generate 3D AI scene image after retries');
}

/**
 * Strips any Devanagari script and written-text/spreadsheet trigger words while preserving
 * rich 3D characters, environments, and cutaway action so visuals are MAX-engaging and 95%+ error-free.
 */
function cleanSimpleVisualPrompt(raw = '') {
  return String(raw || '')
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/\b(infographic|flowchart|spreadsheet|text labels|written text|hindi text|english text|captions|subtitles|watermark|banner text)\b/gi, '3D cutaway mechanism')
    .replace(/\b(no human figures|zero human figures|no people)\b/gi, 'expressive 3D stylized characters in action')
    .replace(/\b(single clean minimalist 3D object|minimalist dark studio background)\b/gi, 'vibrant full-frame 3D Pixar and Zack D. Films style cutaway scene')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Generates MAX-ENGAGING, 95%+ ERROR-FREE Cinematic 3D Storytelling & Cutaway keyframes for a storyboard scene:
 * - In Faceless mode (`isFaceless === true`): Full-frame Zack D. Films / Professor of How / Pixar 3D action scene
 *   with expressive 3D stylized characters, rich 3D environment, and glowing 3D x-ray cutaway mechanics (zero written text inside the image).
 * - In Studio Presenter mode (`isFaceless === false`): Canonical Scene 1 studio framing.
 */
async function generateProfessorOfHowSceneFrames({
  scene,
  sceneIndex,
  totalScenes,
  video,
  topic,
  phase0Png,
  phase1Png,
  videoFormat = '9:16',
}) {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key not configured for 3D AI scene generation');
  }

  const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
  const aspectRatio = isHorizontal ? '16:9' : '9:16';
  const isFaceless = video?.visual_settings?.presenterMode !== 'with_face';

  const category = topic?.category || 'tech_auto';
  const category3DGuide = CATEGORY_3D_STYLE_GUIDE[category] || CATEGORY_3D_STYLE_GUIDE.tech_auto;
  const customUserPrompt = cleanSimpleVisualPrompt(scene.custom_prompt || '');
  const rich3DSceneSubject =
    cleanSimpleVisualPrompt(scene.visual_description) || category3DGuide;
  const narrationContext = String(scene.narration_hindi || scene.narration_segment || '').slice(0, 180);

  if (isFaceless) {
    const facelessPrompt = `Generate a 100% full-bleed vertical ${aspectRatio} viral high-retention 3D animated explainer scene in the exact visual style of "Zack D. Films", "Professor of How", and Pixar / Unreal Engine 5 3D storytelling.
MAX VISUAL QUALITY & 95%+ ERROR-FREE RULES (MUST FOLLOW 100%):
1. 100% EDGE-TO-EDGE FULL-BLEED ${aspectRatio} VERTICAL COMPOSITION (ZERO BLACK BARS):
   Fill the entire ${aspectRatio} vertical canvas from the very top edge to the very bottom edge with a vibrant, dramatic, high-detail 3D environment, volumetric lighting, and towering 3D architecture/mechanisms. NEVER add black letterbox bars at the top or bottom.
   - Scene Visual Action: ${customUserPrompt ? `${customUserPrompt}. ` : ''}${rich3DSceneSubject}
   - Story Context Being Explained: "${narrationContext}"
   - Category Visual Style: ${category3DGuide}
2. 1 OR 2 LARGE EXPRESSIVE 3D PIXAR CHARACTERS + GIANT GLOWING 3D CUTAWAY MECHANISM:
   Feature 1 or 2 large, well-proportioned foreground/midground 3D Pixar-style Indian characters with expressive facial reactions and clean anatomy interacting with a giant 3D x-ray cutaway mechanism and glowing energy pathways. Do NOT add tiny distorted background stick figures.
3. 95%+ ERROR-FREE GUARANTEE — ABSOLUTELY ZERO WRITTEN TEXT OR LETTERS INSIDE THE IMAGE:
   Do NOT render any written text, letters, words, Hindi script, English labels, numbers, signs, or spreadsheet tables anywhere inside the 3D artwork. Communicate 100% through vivid 3D characters, physical objects, glowing cutaway mechanics, and visual storytelling.`;

    logger.info(`Generating MAX-Quality Cinematic 3D Storytelling keyframes for Scene #${sceneIndex + 1}`, {
      videoId: video?.id,
      sceneNumber: sceneIndex + 1,
      category,
      isFaceless: true,
    });

    await callGemini3DSceneImage({
      refImagePath: null,
      prompt: facelessPrompt,
      aspectRatio,
      outputPngPath: phase0Png,
      sceneIndex,
    });

    normalizeFullBleedFrame(phase0Png, isHorizontal);
    deriveCloseUp3DCutawayFrame(phase0Png, phase1Png, isHorizontal, sceneIndex);

    return {
      phase0Png,
      phase1Png,
      provider: 'gemini-2.5-flash-image-faceless-3d',
    };
  }

  const refImagePath = ensurePresenterReferenceCanvas(videoFormat);

  // Always preserve the exact canonical Scene 1 face and studio framing (s1_t78.png)
  // so no scene ever switches to a second face, even on fallback.
  if (fs.existsSync(refImagePath)) {
    fs.copyFileSync(refImagePath, phase0Png);
    normalizeFullBleedFrame(phase0Png, isHorizontal);
    fs.copyFileSync(phase0Png, phase1Png);
    return {
      phase0Png,
      phase1Png,
      provider: 'canonical-scene1-studio-reference',
    };
  }

  const expression = scene?.presenter_config?.expression || 'explaining';
  const expressionGuide = EXPRESSION_PROMPT_MAP[expression] || EXPRESSION_PROMPT_MAP.explaining;

  const promptPhase0 = `Generate a full-bleed ${aspectRatio} photorealistic YouTube Explainer Creator studio portrait, shot on Sony A7SIII 35mm f/1.4 prime lens, ultra-realistic skin texture, shallow depth of field.
CRITICAL STUDIO VISUAL RULES:
1. FULL-BLEED ${aspectRatio} VERTICAL CREATOR STUDIO: Fill the ENTIRE ${aspectRatio} frame from top edge to bottom edge with a cozy, high-end dark acoustic YouTube creator studio. Do NOT add black bars.
2. EXACT PHOTOREALISTIC CREATOR (Aashi): Preserve the exact identity of Aashi from the reference image — a genuine, intelligent 25-year-old Indian female YouTube explainer creator wearing a smart casual fitted black turtleneck sweater, seated at a sleek dark desk with a professional podcast microphone in front of her. She has a ${expressionGuide}.
3. CLEAN BACKGROUND: Behind her is a clean dark studio background with soft teal and warm amber accent lighting and a single simple 3D visual icon (${simpleVisualSubject}).
4. ABSOLUTELY ZERO TEXT: Do NOT render any text, letters, numbers, or labels anywhere in the image.`;

  logger.info(`Generating Option 7 Photorealistic Creator Studio keyframes for Scene #${sceneIndex + 1}`, {
    videoId: video?.id,
    sceneNumber: sceneIndex + 1,
    expression,
    category,
    hasCustomPrompt: Boolean(customUserPrompt),
  });

  await callGemini3DSceneImage({
    refImagePath,
    prompt: promptPhase0,
    aspectRatio,
    outputPngPath: phase0Png,
    sceneIndex,
  });

  // Normalize full-bleed 1080x1920 (or 1920x1080) and derive close-up angle for Shot 2
  normalizeFullBleedFrame(phase0Png, isHorizontal);
  deriveCloseUp3DCutawayFrame(phase0Png, phase1Png, isHorizontal, sceneIndex);

  return {
    phase0Png,
    phase1Png,
    provider: 'gemini-2.5-flash-image-creator-studio',
  };
}

/**
 * Generates an 8-second 1080p Full HD Option 7 Photorealistic YouTube Creator / Podcast Studio video
 * (Dhruv Rathee / Nitish Rajput style, shot on Sony A7SIII 35mm f/1.4) where Indian female creator Aashi
 * (in black turtleneck behind a professional Shure SM7B podcast microphone on a boom arm, with teal/orange
 * RGB bookshelf lighting and a glowing 4K visual explainer display monitor behind her) speaks the exact
 * Hindi narration with 100% native frame-accurate lip-sync using Google Veo 3.1
 * (`veo-3.1-fast-generate-001` with `resolution: "1080p"`, `generateAudio: true`, `durationSeconds: 8`).
 */
async function generateVeo31NativeLipSyncScene({
  scene,
  sceneIndex = 0,
  totalScenes = 5,
  video = null,
  topic = null,
  outputMp4Path,
  phase0Png,
  phase1Png,
  sceneAudioMp3,
  videoFormat = '9:16',
  onProgress = null,
  veoModel = process.env.VEO_MODEL || 'veo-3.1-fast-generate-001',
}) {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini/Vertex API key not configured for Veo 3.1 1080p Creator Studio generation');
  }

  const apiKey = env.gemini.apiKey.trim();
  const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
  const aspectRatio = isHorizontal ? '16:9' : '9:16';

  const category = topic?.category || 'tech_auto';
  const categoryVisualGuide = CATEGORY_3D_STYLE_GUIDE[category] || CATEGORY_3D_STYLE_GUIDE.tech_auto;
  const expression = scene?.presenter_config?.expression || 'explaining';
  const expressionGuide = EXPRESSION_PROMPT_MAP[expression] || EXPRESSION_PROMPT_MAP.explaining;

  const narrationText = String(
    scene?.narration_hindi || scene?.narration_segment || scene?.on_screen_text || video?.hindi_title || ''
  )
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Sanitize visual descriptions so real-person/celebrity photo mentions never trigger Vertex AI RAI filters
  const sanitizeVisualHint = (str) =>
    String(str || '')
      .replace(/\b(photo|picture|portrait|image|face|likeness)\s+of\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/gi, '3D infographic icon and data chart')
      .replace(/\b([A-Z][a-z]+(\s+[A-Z][a-z]+)?)'s\s+(photo|picture|portrait|face|image|likeness)\b/gi, 'official brand icon and 3D data chart')
      .replace(/\b(Akash Ambani|Mukesh Ambani|Narendra Modi|Elon Musk|Donald Trump|Virat Kohli|Rohit Sharma|Shah Rukh Khan|Salman Khan)\b/gi, 'industry leader')
      .trim();

  const customUserPrompt = sanitizeVisualHint(scene?.custom_prompt || '');
  const visualDesc = sanitizeVisualHint(scene?.visual_description || topic?.headline || 'visual data breakdown');

  // Anchor EVERY scene to the exact canonical Scene 1 reference frame (hero_anchor_9_16.jpg / hero_anchor_16_9.jpg)
  // so all 5 scenes have the 100% identical Scene 1 face, identical microphone, identical lighting, and continuous framing.
  const refImagePath = ensurePresenterReferenceCanvas(videoFormat);
  const refB64 = fs.existsSync(refImagePath) ? fs.readFileSync(refImagePath).toString('base64') : null;

  // Attempt 1 prompt: Locked continuous tripod shot anchored to Scene 1 reference frame + scene-specific 4K monitor graphic
  const buildVeoCreatorPrompt = (includeScreenDetails = true) =>
    [
      `Continuous single-take locked tripod Sony A7SIII 35mm f/1.4 photorealistic 1080p Full HD YouTube creator studio shot, zero camera zoom or pan.`,
      `The exact same 25-year-old Indian female YouTube creator Aashi from the starting frame remains seated in the exact same position in her fitted black ribbed turtleneck sweater behind the centered silver-grille studio condenser microphone in its shockmount.`,
      includeScreenDetails
        ? `Her hands rest calmly on the dark studio desk (with minimal subtle movement and returning to her exact poised resting posture at the end of speaking, no erratic hand waving or foreground light flares), while the glowing 4K studio monitor behind her smoothly displays clean animated data graphics (${customUserPrompt ? `${customUserPrompt}. ` : ''}${visualDesc} — ${categoryVisualGuide}).`
        : `Her hands rest calmly on the dark studio desk (with minimal subtle movement and returning to her exact poised resting posture at the end of speaking, no erratic hand waving or foreground light flares) in her warm tungsten and teal backlit studio.`,
      `Aashi looks directly into the camera lens with a ${expressionGuide} and speaks in a consistent, clear young Indian female voice in casual, witty Gen-Z Hinglish with exact, frame-accurate lip-sync: "${narrationText}"`,
      `Clean broadcast podcast microphone acoustics, clear female voiceover, no background music, no text overlays or watermarks.`,
    ].join(' ');

  const startUrl = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/us-central1/publishers/google/models/${veoModel}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
  const pollUrl = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/us-central1/publishers/google/models/${veoModel}:fetchPredictOperation?key=${encodeURIComponent(apiKey)}`;

  logger.info(
    `Starting Veo 3.1 1080p Continuous Scene 1 Face Lip-Sync (${veoModel}) for Scene #${sceneIndex + 1}/${totalScenes}`,
    {
      aspectRatio,
      resolution: '1080p',
      anchoredToScene1Face: Boolean(refB64),
      narrationWords: narrationText.split(/\s+/).length,
    }
  );

  let videoBuf = null;
  let lastErr = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const promptForAttempt = buildVeoCreatorPrompt(attempt === 0);
      const instancePayload = { prompt: promptForAttempt };
      if (refB64) {
        instancePayload.image = {
          bytesBase64Encoded: refB64,
          mimeType: 'image/jpeg',
        };
      }

      const startRes = await fetch(startUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [instancePayload],
          parameters: {
            aspectRatio,
            sampleCount: 1,
            durationSeconds: 8,
            resolution: '1080p',
            personGeneration: 'allow_adult',
            generateAudio: true,
            seed: 424242,
          },
        }),
      });

      if (!startRes.ok) {
        const errText = await startRes.text();
        throw new Error(`Veo 3.1 1080p start HTTP ${startRes.status}: ${errText.slice(0, 240)}`);
      }

      const startData = await startRes.json();
      const operationName = startData.name;
      if (!operationName) {
        throw new Error('Veo 3.1 1080p did not return an operation name');
      }

      for (let poll = 0; poll < 45; poll += 1) {
        await sleep(3000);
        if (typeof onProgress === 'function') {
          try {
            onProgress(poll + 1);
          } catch (_) {
            // ignore callback error
          }
        }
        const pollRes = await fetch(pollUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        if (!pollRes.ok) continue;

        const pollData = await pollRes.json();
        if (!pollData.done) continue;

        if (pollData.error) {
          throw new Error(`Veo 3.1 1080p error: ${JSON.stringify(pollData.error).slice(0, 240)}`);
        }

        const videos = pollData.response?.videos || [];
        if (videos.length > 0 && videos[0].bytesBase64Encoded) {
          videoBuf = Buffer.from(videos[0].bytesBase64Encoded, 'base64');
          break;
        }

        const filteredCount = pollData.response?.raiMediaFilteredCount || 0;
        throw new Error(`Veo 3.1 1080p completed without video bytes (filtered=${filteredCount})`);
      }

      if (videoBuf) break;
      throw new Error('Veo 3.1 1080p timed out after 135 seconds');
    } catch (err) {
      lastErr = err;
      logger.warn(`Veo 3.1 1080p Option 7 attempt ${attempt + 1} failed for Scene #${sceneIndex + 1}`, {
        error: err.message,
      });
      if (attempt === 0) await sleep(2500);
    }
  }

  if (!videoBuf) {
    throw lastErr || new Error('Veo 3.1 1080p Option 7 generation failed');
  }

  fs.writeFileSync(outputMp4Path, videoBuf);

  // Extract native lip-synced audio track to sceneAudioMp3 (48kHz stereo for glitch-free continuity)
  if (sceneAudioMp3) {
    execFileSync(
      FFMPEG_BIN,
      ['-y', '-i', outputMp4Path, '-vn', '-acodec', 'libmp3lame', '-ac', '2', '-ar', '48000', '-q:a', '2', sceneAudioMp3],
      { stdio: 'ignore' }
    );
  }

  // Extract keyframes phase0Png (0.0s) and phase1Png (4.2s) directly from the 1080p Veo 3.1 video
  if (phase0Png) {
    execFileSync(
      FFMPEG_BIN,
      ['-y', '-ss', '0.0', '-i', outputMp4Path, '-frames:v', '1', '-update', '1', phase0Png],
      { stdio: 'ignore' }
    );
    normalizeFullBleedFrame(phase0Png, isHorizontal);
  }
  if (phase1Png) {
    execFileSync(
      FFMPEG_BIN,
      ['-y', '-ss', '4.2', '-i', outputMp4Path, '-frames:v', '1', '-update', '1', phase1Png],
      { stdio: 'ignore' }
    );
    normalizeFullBleedFrame(phase1Png, isHorizontal);
  }

  logger.info(`Veo 3.1 1080p Option 7 Creator Studio Lip-Sync Scene #${sceneIndex + 1} generated (${videoBuf.length} bytes)`, {
    outputMp4Path,
  });

  return {
    videoPath: outputMp4Path,
    audioPath: sceneAudioMp3,
    phase0Png,
    phase1Png,
    durationSeconds: 8.0,
    provider: `${veoModel}-1080p-creator-studio-lipsync`,
    hasNativeAudio: true,
  };
}

/**
 * Animates a 3D scene keyframe (`phase0Png`, containing Aashi + 3D cutaway model)
 * into a real moving MP4 video clip using Google Veo 3.1 (`veo-3.1-fast-generate-001`)
 * on Vertex AI (`projects/40838304284/locations/us-central1`).
 */
async function generateVeo31SceneVideo({
  phase0Png,
  outputMp4Path,
  videoFormat = '9:16',
  sceneIndex = 0,
  scene = null,
  onProgress = null,
  veoModel = process.env.VEO_MODEL || 'veo-3.1-fast-generate-001',
}) {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini/Vertex API key not configured for Veo 3.1 video generation');
  }
  if (!fs.existsSync(phase0Png)) {
    throw new Error(`Input keyframe not found for Veo 3.1: ${phase0Png}`);
  }

  const apiKey = env.gemini.apiKey.trim();
  const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
  const aspectRatio = isHorizontal ? '16:9' : '9:16';

  const imgB64 = fs.readFileSync(phase0Png).toString('base64');
  const startUrl = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/us-central1/publishers/google/models/${veoModel}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
  const pollUrl = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/us-central1/publishers/google/models/${veoModel}:fetchPredictOperation?key=${encodeURIComponent(apiKey)}`;

  const isFaceless = scene?.presenter_config?.visible !== true || scene?.presenter_config?.framing === 'faceless_3d';
  const actionHint = cleanSimpleVisualPrompt(
    scene?.animation_action || scene?.custom_prompt || scene?.visual_description || ''
  )
    .replace(/[^\w\s,.-]/g, '')
    .trim()
    .slice(0, 140);

  const veoPrompt = isFaceless
    ? `Ultra-detailed 1080p Full HD 3D Pixar / Unreal Engine 5 / Zack D. Films / Professor of How animation (zero written text, zero letters, zero numbers): dynamic cinematic 3D camera push-in and fluid 3D motion where expressive 3D stylized characters and glowing 3D cutaway mechanisms come alive in action (${actionHint || 'expressive 3D character and glowing 3D cutaway mechanism in motion with volumetric lighting'}).`
    : actionHint
      ? `Photorealistic 1080p YouTube creator studio shot on Sony A7SIII 35mm f/1.4. The Indian female creator Aashi in a black turtleneck seated behind a Shure SM7B podcast microphone gestures naturally with her hands, moves her head subtly, and speaks while the vibrant 3D holographic cutaway scene (${actionHint}) behind her animates smoothly with zero text.`
      : 'Photorealistic 1080p YouTube creator studio shot on Sony A7SIII 35mm f/1.4. The Indian female creator Aashi in a black turtleneck seated behind a Shure SM7B podcast microphone gestures naturally with her hands, moves her head subtly, and speaks.';

  logger.info(`Starting Veo 3.1 1080p (${veoModel}) Image-to-Video generation for Scene #${sceneIndex + 1}`, {
    aspectRatio,
    phase0Png,
    actionHint: actionHint || 'default',
  });

  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [
        {
          prompt: veoPrompt,
          image: {
            bytesBase64Encoded: imgB64,
            mimeType: 'image/png',
          },
        },
      ],
      parameters: {
        aspectRatio,
        sampleCount: 1,
        durationSeconds: 8,
        resolution: '1080p',
        personGeneration: 'allow_adult',
      },
    }),
  });

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Veo 3.1 start HTTP ${startRes.status}: ${errText.slice(0, 240)}`);
  }

  const startData = await startRes.json();
  const operationName = startData.name;
  if (!operationName) {
    throw new Error('Veo 3.1 did not return an operation name');
  }

  for (let poll = 0; poll < 36; poll += 1) {
    await sleep(3000);
    if (typeof onProgress === 'function') {
      try {
        onProgress(poll + 1);
      } catch (_) {
        // ignore callback error
      }
    }
    const pollRes = await fetch(pollUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName }),
    });
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (!pollData.done) continue;

    if (pollData.error) {
      throw new Error(`Veo 3.1 operation error: ${JSON.stringify(pollData.error).slice(0, 240)}`);
    }

    const videos = pollData.response?.videos || [];
    if (videos.length > 0 && videos[0].bytesBase64Encoded) {
      const videoBuf = Buffer.from(videos[0].bytesBase64Encoded, 'base64');
      fs.writeFileSync(outputMp4Path, videoBuf);
      logger.info(`Veo 3.1 Scene #${sceneIndex + 1} video generated (${videoBuf.length} bytes)`, {
        outputMp4Path,
      });
      return {
        videoPath: outputMp4Path,
        provider: veoModel,
      };
    }

    throw new Error(
      `Veo 3.1 completed without video bytes (filtered=${pollData.response?.raiMediaFilteredCount || 0})`
    );
  }

  throw new Error('Veo 3.1 operation timed out after 120 seconds');
}

module.exports = {
  generateProfessorOfHowSceneFrames,
  generateVeo31SceneVideo,
  generateVeo31NativeLipSyncScene,
  ensurePresenterReferenceCanvas,
  normalizeFullBleedFrame,
  deriveCloseUp3DCutawayFrame,
};

