const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { query } = require('../../config/db');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { synthesizeHindiSpeech } = require('../tts/ttsProvider');
const { segmentsToSrt } = require('../ai/geminiProvider');
const {
  generateProfessorOfHowSceneFrames,
  generateVeo31SceneVideo,
  generateVeo31NativeLipSyncScene,
} = require('./aiSceneProvider');
const { setRenderProgress, clearRenderProgress } = require('./renderProgressTracker');

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = env.ffmpegBin;
const SCENE_GENERATOR_PY = path.resolve(__dirname, './sceneGenerator.py');

function ensureStorageDirs(videoId) {
  const dirs = [
    path.join(env.storageDir, 'videos'),
    path.join(env.storageDir, 'audio'),
    path.join(env.storageDir, 'subtitles'),
    path.join(env.storageDir, 'scenes', `video_${videoId}`),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return {
    videosDir: dirs[0],
    audioDir: dirs[1],
    subtitlesDir: dirs[2],
    sceneWorkDir: dirs[3],
  };
}

/**
 * Formats seconds into ASS timestamp H:MM:SS.cc
 */
function formatAssTime(sec) {
  const totalCs = Math.max(0, Math.round(Number(sec || 0) * 100));
  const hours = Math.floor(totalCs / 360000);
  const minutes = String(Math.floor((totalCs % 360000) / 6000)).padStart(2, '0');
  const seconds = String(Math.floor((totalCs % 6000) / 100)).padStart(2, '0');
  const cs = String(totalCs % 100).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}.${cs}`;
}

/**
 * Splits a Roman Hinglish scene narration into punchy viral short subtitle cues
 * (3-4 words per cue, 1-2 lines max) and writes a high-visibility ASS subtitle file.
 * Positioned in the safe lower-middle zone (well above video player controls).
 * PERMANENT RULE: Zero Devanagari script — always clean Roman Hinglish + English.
 */
function buildSceneSubtitlesAndAss({ narrationText, clipDuration, assFilePath, isHorizontal = false }) {
  const clean = String(narrationText || '')
    .replace(/[\u0900-\u097F]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter(Boolean);
  const chunks = [];
  const wordsPerCue = 4;

  for (let i = 0; i < words.length; i += wordsPerCue) {
    chunks.push(words.slice(i, i + wordsPerCue).join(' '));
  }
  if (chunks.length === 0) {
    chunks.push(clean || 'Topic Explainer');
  }

  const totalWords = Math.max(1, words.length);
  let cursor = 0;
  const cues = chunks.map((chunkText, idx) => {
    const chunkWords = chunkText.split(' ').length;
    const isLast = idx === chunks.length - 1;
    const rawDur = (chunkWords / totalWords) * clipDuration;
    const end = isLast ? clipDuration : Math.min(clipDuration, Number((cursor + Math.max(0.75, rawDur)).toFixed(2)));
    const cue = {
      start: Number(cursor.toFixed(2)),
      end: Number(end.toFixed(2)),
      text: chunkText,
    };
    cursor = end;
    return cue;
  });

  // Format each cue with high-contrast viral styling and yellow/cyan highlight on key terms
  const playResX = isHorizontal ? 1920 : 1080;
  const playResY = isHorizontal ? 1080 : 1920;
  const fontSize = isHorizontal ? 62 : 74;
  // Raised well above the HTML5 video player controls & bottom gradient bar
  const marginV = isHorizontal ? 135 : 420;

  const dialogueLines = cues.map((cue, cueIdx) => {
    const w = cue.text.split(' ');
    const highlightColor = cueIdx % 2 === 0 ? '&H00FFFF&' : '&HFFFF00&'; // Bright Yellow or Electric Cyan in ASS BGR
    const formattedWords = w.map((word, wIdx) => {
      const isHighlight =
        /\d/.test(word) ||
        /[?!]/.test(word) ||
        wIdx === w.length - 1 ||
        (w.length >= 3 && wIdx === 0);
      const safeWord = word.replace(/[{}]/g, '');
      return isHighlight ? `{\\c${highlightColor}}${safeWord}{\\c&HFFFFFF&}` : safeWord;
    });

    let lineText;
    if (formattedWords.length >= 4) {
      const mid = Math.ceil(formattedWords.length / 2);
      lineText = `${formattedWords.slice(0, mid).join(' ')}\\N${formattedWords.slice(mid).join(' ')}`;
    } else {
      lineText = formattedWords.join(' ');
    }

    return `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},ProfHow,,0,0,0,,{\\fad(60,40)}${lineText}`;
  });

  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ProfHow,Arial Rounded MT Bold,${fontSize},&H00FFFFFF,&H0000FFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,1,0,1,7,4,2,65,65,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines.join('\n')}
`;

  fs.writeFileSync(assFilePath, assContent, 'utf8');
  return cues;
}

/**
 * Fallback 5-scene storyboard builder if a video record does not yet have one.
 * Uses 100% Casual Roman Hinglish + English and MAX-engaging full-frame 3D Pixar / Professor of How cutaway scenes.
 */
function buildDefaultStoryboardFromVideo(video, topic) {
  const category = topic?.category || 'tech_auto';
  const defaultTemplateMap = {
    sports_viral: 'cricket_tactical',
    entertainment: 'entertainment_spotlight',
    bollywood_celeb: 'entertainment_spotlight',
    delhi_civic: 'public_affairs_data',
    tech_auto: 'tech_comparison',
    business_facts: 'timeline_explainer',
  };
  const primaryTemplate = defaultTemplateMap[category] || 'timeline_explainer';

  const sentences = String(video.narration_script || '')
    .replace(/[\u0900-\u097F]+/g, '')
    .split(/(?<=[?!.\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunk = (idx, fallback) => sentences[idx] || fallback;

  return [
    {
      scene_number: 1,
      scene_id: 'scene_1',
      title: 'Shock Hook: 90% Log Galat Jante Hain!',
      narration_hindi: video.opening_hook || chunk(0, video.hindi_title),
      on_screen_text: (video.opening_hook || video.hindi_title || '').slice(0, 80),
      visual_description:
        'A full-frame, ultra-detailed 3D Pixar and Zack D. Films style dramatic scene: an expressive 3D young Indian character looking shocked as the giant 3D subject splits open in a glowing x-ray cutaway with cyan and golden volumetric light beams in a rich 3D environment. Zero written text or letters.',
      visual_template: 'anchor_studio',
      visual_data: [topic?.primary_source || 'Verified Explainer Desk', 'Max 3D Cutaway Visual'],
      camera_angle: 'dynamic 3D wide-angle hero shot pushing into glowing cutaway',
      animation_action: 'Expressive 3D character reacting as glowing 3D cutaway mechanism opens in motion',
      transition: 'smooth_wipe',
      duration_seconds: 9,
      presenter_config: {
        visible: false,
        presenter_id: 'aashi_official_v1',
        expression: 'excited',
        look: 'explainer',
        outfit: 'black_blazer',
        framing: 'faceless_3d',
      },
      asset_source: 'Gemini Max 3D Cutaway Visual Generator (Text-Free)',
    },
    {
      scene_number: 2,
      scene_id: 'scene_2',
      title: 'Real-Life Indian Problem & Context',
      narration_hindi:
        video.what_happened ||
        chunk(1, 'Chaliye sabse pehle easy language mein samajhte hain ki iska asli background aur problem kya hai.'),
      on_screen_text: (video.what_happened || chunk(1, video.hindi_title)).slice(0, 85),
      visual_description:
        'A vibrant 3D animated Indian scene showing an expressive 3D character experiencing the real-world problem first-hand while a glowing translucent 3D holographic model reveals the hidden bottleneck inside the system. Zero written text or numbers.',
      visual_template: primaryTemplate,
      visual_data: [
        (video.what_happened || chunk(1, 'Core Concept')).slice(0, 60),
        `Source: ${topic?.primary_source || 'Official Guide'}`,
      ],
      camera_angle: 'cinematic 3D over-the-shoulder shot into glowing 3D mechanism',
      animation_action: 'Smooth camera orbit around the expressive 3D character and glowing 3D cutaway',
      transition: 'slide_left',
      duration_seconds: 9,
      presenter_config: {
        visible: false,
        presenter_id: 'aashi_official_v1',
        expression: 'explaining',
        look: 'explainer',
        outfit: 'black_blazer',
        framing: 'faceless_3d',
      },
      asset_source: 'Gemini Max 3D Cutaway Visual Generator (Text-Free)',
    },
    {
      scene_number: 3,
      scene_id: 'scene_3',
      title: 'Andar Ka Asli X-Ray Mechanism',
      narration_hindi:
        video.background_timeline ||
        chunk(2, 'Ab asli game samjho ki andar se yeh system step-by-step kaise kaam karta hai.'),
      on_screen_text: (video.background_timeline || chunk(2, 'Step-by-Step Mechanism')).slice(0, 85),
      visual_description:
        'A Professor of How style 3D x-ray cross-section cutaway exploding into layers in mid-air, showing glowing golden and cyan energy pulses flowing through intricate 3D gears, pipes, and circuits in a cinematic 3D chamber. Zero written text or labels.',
      visual_template: 'timeline_explainer',
      visual_data: ['Step 1: Input', 'Step 2: Core Process', 'Step 3: Final Output'],
      camera_angle: 'macro 3D x-ray cutaway fly-through',
      animation_action: 'High-speed glowing energy pulses traveling through the 3D cross-section cutaway',
      transition: 'crossfade',
      duration_seconds: 9,
      presenter_config: {
        visible: false,
        presenter_id: 'aashi_official_v1',
        expression: 'serious',
        look: 'explainer',
        outfit: 'black_blazer',
        framing: 'faceless_3d',
      },
      asset_source: 'Gemini Max 3D Cutaway Visual Generator (Text-Free)',
    },
    {
      scene_number: 4,
      scene_id: 'scene_4',
      title: 'Aapki Jeb Aur Daily Life Par Asar',
      narration_hindi:
        video.why_it_matters ||
        chunk(3, 'Daily life mein iska hum sab par kya seedha asar padta hai, ek simple example se dekho.'),
      on_screen_text: (video.why_it_matters || chunk(3, 'Real-Life Indian Impact')).slice(0, 85),
      visual_description:
        'A rich 3D Pixar-style Indian street and home split-scene where an expressive 3D Indian character uses a glowing 3D smartphone and shield as golden light waves transform their surroundings. Zero written text or letters.',
      visual_template: primaryTemplate,
      visual_data: ['Real-Life Indian Example', 'Direct Daily Impact'],
      camera_angle: 'dynamic 3D medium tracking shot with volumetric rim lighting',
      animation_action: 'Expressive 3D character interacting with glowing 3D energy shield and objects',
      transition: 'slide_up',
      duration_seconds: 9,
      presenter_config: {
        visible: false,
        presenter_id: 'aashi_official_v1',
        expression: 'confident',
        look: 'explainer',
        outfit: 'black_blazer',
        framing: 'faceless_3d',
      },
      asset_source: 'Gemini Max 3D Cutaway Visual Generator (Text-Free)',
    },
    {
      scene_number: 5,
      scene_id: 'scene_5',
      title: 'Smart Takeaway & Audience Question',
      narration_hindi:
        video.conclusion_text ||
        video.call_to_action ||
        'Ab aapko poora concept clear ho gaya hoga! Next kaunsa topic explain karein? Comments mein batao aur subscribe karo.',
      on_screen_text: video.call_to_action || 'Next Topic Comments Mein Batao • Subscribe',
      visual_description:
        'A triumphant 3D Pixar-style finale scene: an expressive confident 3D Indian character standing in a futuristic 3D command room as a giant glowing 3D golden trophy and holographic brain light up the entire room with volumetric beams. Zero written text.',
      visual_template: 'anchor_studio',
      visual_data: [topic?.primary_source || 'Verified Explainer Desk', '45s Topic Explainer'],
      camera_angle: 'heroic low-angle 3D crane shot with golden volumetric lighting',
      animation_action: 'Confident 3D character smiling as golden 3D energy beams pulse outward',
      transition: 'fade_out',
      duration_seconds: 9,
      presenter_config: {
        visible: false,
        presenter_id: 'aashi_official_v1',
        expression: 'smile',
        look: 'explainer',
        outfit: 'black_blazer',
        framing: 'faceless_3d',
      },
      asset_source: 'Gemini Max 3D Cutaway Visual Generator (Text-Free)',
    },
  ];
}

/**
 * Renders a single scene's 3D AI keyframes + realistic Gemini Hindi TTS + HarfBuzz-subtitled MP4 clip.
 */
async function renderSceneClip({
  scene,
  sceneIndex,
  totalScenes,
  video,
  topic,
  sceneWorkDir,
  videoFormat = '9:16',
  reuseExistingAudio = false,
  reuseExistingVisuals = false,
  onStage = null,
}) {
  const sceneNum = scene.scene_number || sceneIndex + 1;
  const phase0Png = path.join(sceneWorkDir, `scene_${sceneNum}_phase0.png`);
  const phase1Png = path.join(sceneWorkDir, `scene_${sceneNum}_phase1.png`);
  const sceneVeoMp4 = path.join(sceneWorkDir, `scene_${sceneNum}_veo.mp4`);
  const sceneAudioMp3 = path.join(sceneWorkDir, `scene_${sceneNum}.mp3`);
  const sceneAssPath = path.join(sceneWorkDir, `scene_${sceneNum}.ass`);
  const sceneClipMp4 = path.join(sceneWorkDir, `scene_${sceneNum}.mp4`);

  const voiceName = video.voice_settings?.voice || env.tts.voiceHindi || 'Aoede';
  const emotion = scene.presenter_config?.expression || 'explaining';

  const narrationText =
    scene.narration_hindi || scene.narration_segment || scene.on_screen_text || video.hindi_title;

  if (typeof onStage === 'function') {
    onStage('starting_scene', sceneNum);
  }

  const isFaceless = video?.visual_settings?.presenterMode !== 'with_face';

  let visualProvider = isFaceless ? 'gemini-2.5-flash-image-faceless-3d' : 'veo-3.1-fast-generate-001-native-lipsync';
  let hasVeoVideo = false;
  let hasNativeLipSyncVeo = false;
  let ttsRes = null;
  let clipDuration = isFaceless ? 9.0 : 8.0;

  // PRIMARY PATH (WITH FACE MODE ONLY): Veo 3.1 Native Hindi Lip-Sync (`veo-3.1-fast-generate-001` with `generateAudio: true`, 8s)
  // Generates Aashi in the 3D studio speaking the exact Hindi narration with 100% frame-accurate lip-sync.
  // When `isFaceless` is true ("remove face"), we skip talking-head lip-sync and go straight to 45s (5x9s) Hindi TTS + Faceless 3D Visuals.
  const canReuseNativeVeo =
    !isFaceless &&
    reuseExistingVisuals &&
    reuseExistingAudio &&
    fs.existsSync(sceneVeoMp4) &&
    fs.statSync(sceneVeoMp4).size > 50000 &&
    fs.existsSync(sceneAudioMp3) &&
    fs.statSync(sceneAudioMp3).size > 1000 &&
    String(scene.tts_provider || '').includes('veo-3.1-native-lipsync');

  if (canReuseNativeVeo) {
    hasVeoVideo = true;
    hasNativeLipSyncVeo = true;
    ttsRes = {
      audioPath: sceneAudioMp3,
      durationSec: 8.0,
      durationSeconds: 8.0,
      provider: 'veo-3.1-native-lipsync',
      voice: 'Aashi-Veo-3.1-Native-Hindi',
    };
    clipDuration = 8.0;
    if (typeof onStage === 'function') {
      onStage('keyframes_done', sceneNum);
      onStage('veo_done', sceneNum);
    }
  } else if (!isFaceless && !reuseExistingVisuals) {
    try {
      if (fs.existsSync(sceneVeoMp4)) {
        try {
          fs.unlinkSync(sceneVeoMp4);
        } catch (_) {
          // ignore unlink error
        }
      }
      const nativeVeoRes = await generateVeo31NativeLipSyncScene({
        scene: {
          ...scene,
          narration_hindi: narrationText,
          narration_segment: narrationText,
          scene_number: sceneNum,
        },
        sceneIndex,
        totalScenes,
        video,
        topic,
        outputMp4Path: sceneVeoMp4,
        phase0Png,
        phase1Png,
        sceneAudioMp3,
        videoFormat,
        onProgress: (pollTick) => {
          if (typeof onStage === 'function') {
            onStage('veo_polling', sceneNum, pollTick);
          }
        },
      });
      hasVeoVideo = fs.existsSync(sceneVeoMp4) && fs.statSync(sceneVeoMp4).size > 50000;
      hasNativeLipSyncVeo = hasVeoVideo && Boolean(nativeVeoRes?.hasNativeAudio);
      if (hasNativeLipSyncVeo) {
        ttsRes = {
          audioPath: sceneAudioMp3,
          durationSec: 8.0,
          durationSeconds: 8.0,
          provider: 'veo-3.1-native-lipsync',
          voice: 'Aashi-Veo-3.1-Native-Hindi',
        };
        clipDuration = 8.0;
        if (typeof onStage === 'function') {
          onStage('keyframes_done', sceneNum);
          onStage('veo_done', sceneNum);
        }
      }
    } catch (nativeVeoErr) {
      logger.warn('Veo 3.1 Native Hindi Lip-Sync failed for scene; falling back to Aoede TTS + 3D keyframes', {
        sceneNumber: sceneNum,
        error: nativeVeoErr.message,
      });
    }
  }

  // FALLBACK PATH: If Native Lip-Sync did not run or failed, run Aoede Hindi TTS + 3D Keyframes + Image-to-Video
  if (!hasNativeLipSyncVeo) {
    visualProvider = 'gemini-2.5-flash-image';

    const ttsPromise = (async () => {
      if (reuseExistingAudio && fs.existsSync(sceneAudioMp3) && fs.statSync(sceneAudioMp3).size > 1000) {
        const { probeAudioDurationSec } = require('../tts/ttsProvider');
        const dur = await probeAudioDurationSec(sceneAudioMp3);
        return {
          audioPath: sceneAudioMp3,
          durationSec: dur,
          durationSeconds: dur,
          provider: scene.tts_provider || 'gemini_native_tts',
          voice: scene.tts_voice || 'Gemini-Aoede-Hindi',
        };
      }
      return synthesizeHindiSpeech({
        text: narrationText,
        outputPath: sceneAudioMp3,
        voice: voiceName,
        emotion,
      });
    })();

    const keyframesPromise = (async () => {
      if (reuseExistingVisuals && fs.existsSync(phase0Png) && fs.existsSync(phase1Png)) {
        return;
      }
      let lastSceneErr = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await generateProfessorOfHowSceneFrames({
            scene: {
              ...scene,
              narration_hindi: narrationText,
              narration_segment: narrationText,
              scene_number: sceneNum,
            },
            sceneIndex,
            totalScenes,
            video,
            topic,
            phase0Png,
            phase1Png,
            videoFormat,
          });
          return;
        } catch (aiSceneErr) {
          lastSceneErr = aiSceneErr;
          logger.warn(`3D AI scene generation attempt ${attempt}/2 failed`, {
            sceneNumber: sceneNum,
            error: aiSceneErr.message,
          });
        }
      }
      logger.warn('3D AI scene generation exhausted retries; falling back to local sceneGenerator.py', {
        sceneNumber: sceneNum,
        error: lastSceneErr?.message,
      });
      visualProvider = 'local_fallback';
      const pyPayload = JSON.stringify({
        output_paths: [phase0Png, phase1Png],
        assets_dir: env.assetsDir,
        format: videoFormat,
        category: topic?.category || 'tech_auto',
        video_title: video.hindi_title,
        primary_source: topic?.primary_source || 'Verified Explainer Desk',
        total_scenes: totalScenes,
        scene: {
          ...scene,
          narration_hindi: narrationText,
          narration_segment: narrationText,
          scene_number: sceneNum,
        },
      });
      await execFileAsync('python3', [SCENE_GENERATOR_PY, pyPayload], { timeout: 30000 });
    })();

    const [fallbackTtsRes] = await Promise.all([ttsPromise, keyframesPromise]);
    ttsRes = fallbackTtsRes;
    clipDuration = Math.max(4.0, Math.min(28, Number((ttsRes.durationSeconds + 0.35).toFixed(2))));

    if (typeof onStage === 'function') {
      onStage('keyframes_done', sceneNum);
    }

    hasVeoVideo =
      reuseExistingVisuals && fs.existsSync(sceneVeoMp4) && fs.statSync(sceneVeoMp4).size > 50000;
    if (!hasVeoVideo && fs.existsSync(phase0Png)) {
      try {
        await generateVeo31SceneVideo({
          phase0Png,
          outputMp4Path: sceneVeoMp4,
          videoFormat,
          sceneIndex,
          scene,
          onProgress: (pollTick) => {
            if (typeof onStage === 'function') {
              onStage('veo_polling', sceneNum, pollTick);
            }
          },
        });
        hasVeoVideo = fs.existsSync(sceneVeoMp4) && fs.statSync(sceneVeoMp4).size > 50000;
      } catch (veoErr) {
        logger.warn('Veo 3.1 video animation failed for scene; falling back to 2-shot 3D keyframe motion', {
          sceneNumber: sceneNum,
          error: veoErr.message,
        });
      }
    }
    if (hasVeoVideo) {
      visualProvider = 'veo-3.1-fast-generate-001';
    }
    if (typeof onStage === 'function') {
      onStage('veo_done', sceneNum);
    }
  }

  // 3. Build HarfBuzz-compatible ASS subtitle file for this scene
  const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
  const sceneCues = buildSceneSubtitlesAndAss({
    narrationText,
    clipDuration,
    assFilePath: sceneAssPath,
    isHorizontal,
  });

  // 4. Render native 24fps animated MP4 clip using FFmpeg:
  //    - If `hasNativeLipSyncVeo` is true, render the 8s Veo 3.1 clip 1:1 at native 24fps with ZERO reverse looping
  //      so Aashi's lip movements match the spoken Hindi narration frame-for-frame without 24->30fps judder.
  //    - Otherwise if `hasVeoVideo` is true (Image-to-Video fallback), render forward-only at 24fps (no reverse glitch).
  //    - Otherwise fall back to smooth 24fps 3D keyframe camera motion (`phase0Png`).
  const W = isHorizontal ? 1920 : 1080;
  const H = isHorizontal ? 1080 : 1920;
  const escapedAssPath = sceneAssPath.replace(/\\/g, '/').replace(/:/g, '\\:');

  if (hasNativeLipSyncVeo) {
    const nativeLipSyncFilterComplex = [
      `[0:v]setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=24,ass='${escapedAssPath}',format=yuv420p[vout]`,
      `[0:a]asetpts=PTS-STARTPTS,aresample=48000:async=1,volume=1.08[voice]`,
      `[1:a]lowpass=f=180,volume=0.020[bgm]`,
      `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=1,aresample=48000[aout]`,
    ].join(';');

    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-i',
        sceneVeoMp4,
        '-f',
        'lavfi',
        '-t',
        String(clipDuration),
        '-i',
        'sine=frequency=98:sample_rate=48000',
        '-filter_complex',
        nativeLipSyncFilterComplex,
        '-map',
        '[vout]',
        '-map',
        '[aout]',
        '-r',
        '24',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-t',
        String(clipDuration),
        sceneClipMp4,
      ],
      { timeout: 120000 }
    );
  } else if (hasVeoVideo) {
    // Smoothly stretch 8s Veo 3.1 animation across clipDuration so the video NEVER freezes on a static frame
    const stretchFactor = clipDuration > 7.85 ? Number((clipDuration / 7.8).toFixed(4)) : 1.0;
    const veoFilterComplex = [
      `[0:v]setpts=${stretchFactor}*(PTS-STARTPTS),scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=24,tpad=stop_mode=clone:stop_duration=2,trim=duration=${clipDuration},setpts=PTS-STARTPTS,ass='${escapedAssPath}',format=yuv420p[vout]`,
      `[1:a]asetpts=PTS-STARTPTS,aresample=48000:async=1,volume=1.08[voice]`,
      `[2:a]lowpass=f=180,volume=0.024[bgm]`,
      `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=1,aresample=48000[aout]`,
    ].join(';');

    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-i',
        sceneVeoMp4,
        '-i',
        sceneAudioMp3,
        '-f',
        'lavfi',
        '-t',
        String(clipDuration),
        '-i',
        'sine=frequency=98:sample_rate=48000',
        '-filter_complex',
        veoFilterComplex,
        '-map',
        '[vout]',
        '-map',
        '[aout]',
        '-r',
        '24',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-t',
        String(clipDuration),
        sceneClipMp4,
      ],
      { timeout: 120000 }
    );
  } else {
    const scaledW = Math.round(W * 1.12);
    const scaledH = Math.round(H * 1.12);
    const halfDur = Math.max(2.0, Number((clipDuration * 0.52).toFixed(2)));
    const secondDur = Math.max(2.0, Number((clipDuration - halfDur + 0.6).toFixed(2)));
    const xfadeOffset = Math.max(1.5, Number((halfDur - 0.35).toFixed(2)));
    const secondImg = fs.existsSync(phase1Png) ? phase1Png : phase0Png;

    const filterComplex = [
      `[0:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},crop=${W}:${H}:'(${scaledW}-${W})/2':'(${scaledH}-${H})*(0.85-0.70*min(1,t/${halfDur}))',fps=24,format=yuv420p[v0]`,
      `[1:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},crop=${W}:${H}:'(${scaledW}-${W})*(0.18+0.64*min(1,t/${secondDur}))':'(${scaledH}-${H})/2',fps=24,format=yuv420p[v1]`,
      `[v0][v1]xfade=transition=fade:duration=0.45:offset=${xfadeOffset},trim=duration=${clipDuration},setpts=PTS-STARTPTS,ass='${escapedAssPath}',format=yuv420p[vout]`,
      `[2:a]asetpts=PTS-STARTPTS,aresample=48000:async=1,volume=1.08[voice]`,
      `[3:a]lowpass=f=180,volume=0.024[bgm]`,
      `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=1,aresample=48000[aout]`,
    ].join(';');

    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-loop',
        '1',
        '-t',
        String(Number((halfDur + 0.5).toFixed(2))),
        '-i',
        phase0Png,
        '-loop',
        '1',
        '-t',
        String(secondDur),
        '-i',
        secondImg,
        '-i',
        sceneAudioMp3,
        '-f',
        'lavfi',
        '-t',
        String(clipDuration),
        '-i',
        'sine=frequency=98:sample_rate=48000',
        '-filter_complex',
        filterComplex,
        '-map',
        '[vout]',
        '-map',
        '[aout]',
        '-r',
        '24',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-t',
        String(clipDuration),
        sceneClipMp4,
      ],
      { timeout: 120000 }
    );
  }

  if (typeof onStage === 'function') {
    onStage('clip_done', sceneNum);
  }

  const cacheBust = Date.now();
  return {
    ...scene,
    scene_number: sceneNum,
    narration_hindi: narrationText,
    narration_segment: narrationText,
    duration_seconds: Math.round(clipDuration),
    exact_duration_seconds: clipDuration,
    keyframe_url: `/storage/scenes/video_${video.id}/scene_${sceneNum}_phase0.png?v=${cacheBust}`,
    speaking_frame_url: `/storage/scenes/video_${video.id}/scene_${sceneNum}_phase1.png?v=${cacheBust}`,
    veo_clip_url: hasVeoVideo ? `/storage/scenes/video_${video.id}/scene_${sceneNum}_veo.mp4?v=${cacheBust}` : null,
    audio_url: `/storage/scenes/video_${video.id}/scene_${sceneNum}.mp3?v=${cacheBust}`,
    rendered_clip_url: `/storage/scenes/video_${video.id}/scene_${sceneNum}.mp4?v=${cacheBust}`,
    visual_provider: visualProvider,
    tts_provider: ttsRes.provider,
    tts_voice: ttsRes.voice,
    _scene_cues: sceneCues,
    _local_clip_path: sceneClipMp4,
    _local_audio_path: sceneAudioMp3,
  };
}

/**
 * Concatenates all scene MP4s and MP3s into the master video, audio, and SRT files.
 */
async function assembleMasterVideo({ videoId, updatedScenes, dirs, videoFormat }) {
  const concatVideoListPath = path.join(dirs.sceneWorkDir, 'concat_videos.txt');
  const concatAudioListPath = path.join(dirs.sceneWorkDir, 'concat_audios.txt');

  const sortedScenes = [...updatedScenes].sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));

  const videoLines = sortedScenes
    .map((s) => {
      const p = s._local_clip_path || path.join(dirs.sceneWorkDir, `scene_${s.scene_number}.mp4`);
      return `file '${p.replace(/'/g, "'\\''")}'`;
    })
    .join('\n');

  const audioLines = sortedScenes
    .map((s) => {
      const p = s._local_audio_path || path.join(dirs.sceneWorkDir, `scene_${s.scene_number}.mp3`);
      return `file '${p.replace(/'/g, "'\\''")}'`;
    })
    .join('\n');

  fs.writeFileSync(concatVideoListPath, videoLines, 'utf8');
  fs.writeFileSync(concatAudioListPath, audioLines, 'utf8');

  const suffix = videoFormat === '16:9' ? 'horizontal' : 'vertical';
  const masterVideoFilename = `video-${videoId}-${suffix}.mp4`;
  const masterVideoPath = path.join(dirs.videosDir, masterVideoFilename);
  const canonicalVideoAliasPath = path.join(dirs.videosDir, `video_${videoId}.mp4`);

  const masterAudioFilename = `video-${videoId}-hi.mp3`;
  const masterAudioPath = path.join(dirs.audioDir, masterAudioFilename);

  const masterSubtitlesFilename = `video-${videoId}-hi.srt`;
  const masterSubtitlesPath = path.join(dirs.subtitlesDir, masterSubtitlesFilename);

  // Concatenate MP4 scenes with continuous PTS timestamps and gapless 24fps H.264 / 48kHz AAC encoding
  // so transitions between scenes are 100% continuous with zero packet boundary freezes or audio pops
  await execFileAsync(
    FFMPEG_BIN,
    [
      '-y',
      '-fflags',
      '+genpts',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatVideoListPath,
      '-vf',
      'setpts=PTS-STARTPTS,fps=24,format=yuv420p',
      '-af',
      'asetpts=PTS-STARTPTS,aresample=48000:async=1',
      '-r',
      '24',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      masterVideoPath,
    ],
    { timeout: 120000 }
  );

  fs.copyFileSync(masterVideoPath, canonicalVideoAliasPath);

  // Concatenate MP3 scene audio tracks
  await execFileAsync(
    FFMPEG_BIN,
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatAudioListPath,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      masterAudioPath,
    ],
    { timeout: 60000 }
  );

  // Build synchronized Devanagari SRT subtitles from scene cues
  let cursor = 0;
  const subtitleSegments = [];
  for (const s of sortedScenes) {
    const dur = Number(s.exact_duration_seconds || s.duration_seconds || 6);
    if (Array.isArray(s._scene_cues) && s._scene_cues.length > 0) {
      for (const cue of s._scene_cues) {
        subtitleSegments.push({
          start: Number((cursor + cue.start).toFixed(2)),
          end: Number((cursor + cue.end).toFixed(2)),
          text: cue.text,
        });
      }
    } else {
      const narration = String(s.narration_hindi || s.narration_segment || s.on_screen_text || '').trim();
      subtitleSegments.push({
        start: Number(cursor.toFixed(2)),
        end: Number((cursor + dur).toFixed(2)),
        text: narration,
      });
    }
    cursor += dur;
  }

  const srtContent = segmentsToSrt(subtitleSegments);
  fs.writeFileSync(masterSubtitlesPath, srtContent, 'utf8');

  const cacheBust = Date.now();
  return {
    videoUrl: `/storage/videos/${masterVideoFilename}?v=${cacheBust}`,
    audioUrl: `/storage/audio/${masterAudioFilename}?v=${cacheBust}`,
    subtitlesUrl: `/storage/subtitles/${masterSubtitlesFilename}?v=${cacheBust}`,
    subtitlesSrt: srtContent,
    subtitlesSegments: subtitleSegments,
    totalDurationSeconds: Math.round(cursor),
  };
}

/**
 * Full multi-scene explainer video renderer (or single-scene re-renderer).
 * Uses parallel batching (2 scenes at a time + parallel TTS & 3D keyframes) and real-time 0-100% progress tracking.
 */
async function renderExplainerVideo(videoId, options = {}) {
  const {
    onlySceneNumber = null,
    reuseExistingAudio = false,
    reuseExistingVisuals = false,
  } = options;

  const videoRes = await query(
    `SELECT v.*, t.headline AS topic_headline, t.category AS topic_category,
            t.primary_source, t.verification_status
     FROM videos v
     LEFT JOIN trending_topics t ON t.id = v.topic_id
     WHERE v.id = $1`,
    [videoId]
  );

  if (videoRes.rows.length === 0) {
    throw new Error(`Video #${videoId} not found`);
  }

  const video = videoRes.rows[0];
  const topicId = video.topic_id;
  const topic = {
    id: topicId,
    headline: video.topic_headline,
    category: video.topic_category || 'tech_auto',
    primary_source: video.primary_source || 'Verified News Desk',
    verification_status: video.verification_status || 'verified',
  };

  const dirs = ensureStorageDirs(videoId);
  const videoFormat = video.video_format || '9:16';

  let storyboard =
    Array.isArray(video.storyboard) && video.storyboard.length > 0
      ? video.storyboard
      : buildDefaultStoryboardFromVideo(video, topic);

  const totalScenes = storyboard.length;

  logger.info('Starting Professor-of-How 3D Hindi animated explainer render', {
    videoId,
    scenesCount: totalScenes,
    videoFormat,
    onlySceneNumber,
  });

  // Determine which scenes need rendering vs reusing cached scene clips
  const updatedScenes = new Array(totalScenes);
  const renderQueue = [];

  for (let i = 0; i < totalScenes; i += 1) {
    const scene = storyboard[i];
    const sceneNum = scene.scene_number || i + 1;
    const localClipPath = path.join(dirs.sceneWorkDir, `scene_${sceneNum}.mp4`);
    const localAudioPath = path.join(dirs.sceneWorkDir, `scene_${sceneNum}.mp3`);

    const shouldRenderThisScene =
      !onlySceneNumber ||
      Number(onlySceneNumber) === Number(sceneNum) ||
      !fs.existsSync(localClipPath) ||
      !fs.existsSync(localAudioPath);

    if (shouldRenderThisScene) {
      renderQueue.push({ scene, sceneIndex: i, sceneNum });
    } else {
      const narrationText = (
        scene.narration_hindi ||
        scene.narration_segment ||
        scene.on_screen_text_hindi ||
        video.hindi_title ||
        ''
      ).trim();
      const clipDuration = Number(scene.duration_seconds) || 10;
      const sceneAssPath = path.join(dirs.sceneWorkDir, `scene_${sceneNum}.ass`);
      const isHorizontal = videoFormat === '16:9' || videoFormat === 'horizontal';
      const sceneCues = buildSceneSubtitlesAndAss({
        narrationText,
        clipDuration,
        assFilePath: sceneAssPath,
        isHorizontal,
      });
      updatedScenes[i] = {
        ...scene,
        scene_number: sceneNum,
        _local_clip_path: localClipPath,
        _local_audio_path: localAudioPath,
        _scene_cues: sceneCues,
      };
    }
  }

  // Track fractional progress (0.0 to 1.0) for each scene in renderQueue
  const sceneProgressMap = new Map();
  for (const item of renderQueue) {
    sceneProgressMap.set(item.sceneNum, 0.05);
  }

  const updateOverallProgress = (stageMessage, activeSceneNum = null) => {
    const totalToRender = Math.max(1, renderQueue.length);
    let sum = 0;
    for (const val of sceneProgressMap.values()) {
      sum += val;
    }
    const avgFraction = sum / totalToRender;
    // Map scene rendering across 15% -> 90%
    const pct = Math.min(91, Math.max(15, Math.round(15 + avgFraction * 75)));
    setRenderProgress({
      videoId,
      topicId,
      percent: pct,
      stage: stageMessage,
      sceneNumber: activeSceneNum,
      totalScenes,
      active: true,
    });
  };

  updateOverallProgress(
    onlySceneNumber
      ? `Scene #${onlySceneNumber}: Generating 3D Visual + Aoede Hindi Voiceover...`
      : `Generating ${renderQueue.length} Scenes in Parallel (3D Visuals + Aoede Hindi Voice + Veo 3.1)...`,
    onlySceneNumber || 1
  );

  // Process scenes with parallel concurrency = 2 (2x faster while avoiding Vertex 429 limits)
  const SCENE_CONCURRENCY = 2;
  let cursorIdx = 0;

  async function sceneWorker() {
    while (cursorIdx < renderQueue.length) {
      const myIdx = cursorIdx;
      cursorIdx += 1;
      const { scene, sceneIndex, sceneNum } = renderQueue[myIdx];

      const renderedScene = await renderSceneClip({
        scene,
        sceneIndex,
        totalScenes,
        video,
        topic,
        sceneWorkDir: dirs.sceneWorkDir,
        videoFormat,
        reuseExistingAudio,
        reuseExistingVisuals,
        onStage: (stageKey, sNum, pollTick = 0) => {
          if (stageKey === 'starting_scene') {
            sceneProgressMap.set(sNum, 0.1);
            updateOverallProgress(
              `Scene ${sNum}/${totalScenes}: Generating 3D Cutaway Visual & Aoede Hindi Voice...`,
              sNum
            );
          } else if (stageKey === 'keyframes_done') {
            sceneProgressMap.set(sNum, 0.38);
            updateOverallProgress(
              `Scene ${sNum}/${totalScenes}: 3D Visual & Voice Ready! Starting Veo 3.1 Video Animation...`,
              sNum
            );
          } else if (stageKey === 'veo_polling') {
            const pollFrac = Math.min(0.85, 0.38 + pollTick * 0.045);
            sceneProgressMap.set(sNum, pollFrac);
            updateOverallProgress(
              `Scene ${sNum}/${totalScenes}: Animating Aashi & 3D Scene with Google Veo 3.1...`,
              sNum
            );
          } else if (stageKey === 'veo_done') {
            sceneProgressMap.set(sNum, 0.9);
            updateOverallProgress(
              `Scene ${sNum}/${totalScenes}: Burning Hindi Subtitles & Mixing Studio Audio...`,
              sNum
            );
          } else if (stageKey === 'clip_done') {
            sceneProgressMap.set(sNum, 1.0);
            updateOverallProgress(
              `Scene ${sNum}/${totalScenes} Complete!`,
              sNum
            );
          }
        },
      });

      updatedScenes[sceneIndex] = renderedScene;
    }
  }

  const workers = Array.from(
    { length: Math.min(SCENE_CONCURRENCY, Math.max(1, renderQueue.length)) },
    () => sceneWorker()
  );
  await Promise.all(workers);

  setRenderProgress({
    videoId,
    topicId,
    percent: 95,
    stage: '95% • Merging All 5 Scenes, Audio & Synchronized Hindi Subtitles into Master 9:16 MP4...',
    sceneNumber: null,
    totalScenes,
    active: true,
  });

  const assembled = await assembleMasterVideo({
    videoId,
    updatedScenes,
    dirs,
    videoFormat,
  });

  // Strip internal _local_* paths before saving storyboard JSONB
  const cleanStoryboard = updatedScenes.map(
    ({ _local_clip_path, _local_audio_path, _scene_cues, ...rest }) => rest
  );

  await query(
    `UPDATE videos SET
       video_url = $1,
       audio_url = $2,
       subtitles_url = $3,
       subtitles_srt = $4,
       subtitles_segments = $5,
       storyboard = $6,
       duration_seconds = $7,
       status = CASE WHEN status = 'published' THEN 'published' ELSE 'awaiting_approval' END,
       updated_at = NOW()
     WHERE id = $8`,
    [
      assembled.videoUrl,
      assembled.audioUrl,
      assembled.subtitlesUrl,
      assembled.subtitlesSrt,
      JSON.stringify(assembled.subtitlesSegments),
      JSON.stringify(cleanStoryboard),
      assembled.totalDurationSeconds,
      videoId,
    ]
  );

  setRenderProgress({
    videoId,
    topicId,
    percent: 100,
    stage: '100% Complete! Video Ready to Watch',
    sceneNumber: null,
    totalScenes,
    active: false,
  });
  setTimeout(() => clearRenderProgress(videoId, topicId), 15000);

  logger.info('Completed Professor-of-How 3D Hindi animated explainer render', {
    videoId,
    videoUrl: assembled.videoUrl,
    totalDurationSeconds: assembled.totalDurationSeconds,
  });

  return {
    videoId,
    videoUrl: assembled.videoUrl,
    audioUrl: assembled.audioUrl,
    subtitlesUrl: assembled.subtitlesUrl,
    durationSeconds: assembled.totalDurationSeconds,
    storyboard: cleanStoryboard,
    status: 'awaiting_approval',
  };
}

module.exports = {
  renderExplainerVideo,
  buildDefaultStoryboardFromVideo,
};
