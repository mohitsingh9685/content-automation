const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { env, isGeminiConfigured } = require('../../config/env');
const { logger } = require('../../config/logger');

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = env.ffmpegBin;

const PYTHON_BIN = fs.existsSync('/usr/local/bin/python3')
  ? '/usr/local/bin/python3'
  : 'python3';

const VERTEX_PROJECT_ID = env.gemini.vertexProjectId;

const EMOTION_PROSODY = {
  neutral: {
    rate: '+7%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a high-energy, super interactive, punchy young Indian YouTuber voice — fast-paced, curious, and hooking your best friend into a viral Shorts story (NEVER sound slow, sleepy, or like an AI reading a script):',
  },
  explaining: {
    rate: '+8%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a high-energy, street-smart, super interactive Indian YouTuber voice — like a top Indian creator enthusiastically revealing an insider secret to a friend with punchy emphasis and zero robotic stiffness:',
  },
  speaking: {
    rate: '+8%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a catchy, fast-paced, viral Indian YouTuber voice hooking a viewer in the first 2 seconds:',
  },
  serious: {
    rate: '+6%',
    pitch: '+1Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in an intense, gripping, conversational Indian Hinglish voice — like a smart friend revealing the shocking truth behind a system:',
  },
  excited: {
    rate: '+9%',
    pitch: '+3Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in an excited, high-retention, viral Indian YouTuber voice sharing a mind-blowing twist with your best friend:',
  },
  curious: {
    rate: '+8%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a playful, high-energy, interactive Indian Hinglish voice asking a hook question to a friend:',
  },
  questioning: {
    rate: '+7%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a witty, interactive Indian Hinglish voice challenging the viewer with a direct question:',
  },
  surprised: {
    rate: '+8%',
    pitch: '+3Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in an expressive, shocked, high-energy Indian Hinglish voice revealing a jaw-dropping twist:',
  },
  confident: {
    rate: '+7%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a bold, confident, street-smart Indian creator voice:',
  },
  smile: {
    rate: '+7%',
    pitch: '+2Hz',
    stylePrompt:
      'Speak this Roman Hinglish and English text in a warm, energetic, smiling Indian YouTuber voice asking the viewer to comment their answer right now:',
  },
};

/**
 * Probes exact audio duration in seconds using ffmpeg -i
 */
async function probeAudioDurationSec(filePath) {
  try {
    await execFileAsync(FFMPEG_BIN, ['-i', filePath]);
  } catch (err) {
    const stderr = String(err.stderr || err.message || '');
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2]);
      const secs = Number(match[3]);
      return Number((hours * 3600 + mins * 60 + secs).toFixed(2));
    }
  }
  return 8.0;
}

/**
 * Synthesizes ultra-realistic human-like Hindi female speech using Gemini 2.5 Native Audio TTS
 * (`gemini-2.5-flash-preview-tts` on Google Cloud Vertex AI / AI Studio).
 */
async function synthesizeWithGeminiNativeTts(cleanText, outputMp3Path, emotion = 'explaining', geminiVoice = 'Aoede') {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key not configured for native TTS');
  }

  const apiKey = env.gemini.apiKey.trim();
  const isVertex = apiKey.startsWith('AQ.');
  const url = isVertex
    ? `https://aiplatform.googleapis.com/v1beta1/projects/${VERTEX_PROJECT_ID}/locations/global/publishers/google/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prosody = EMOTION_PROSODY[emotion] || EMOTION_PROSODY.explaining;
  const promptText = `${prosody.stylePrompt}\n\n"${cleanText}"`;

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoice,
                },
              },
            },
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini TTS HTTP ${res.status}: ${errText.slice(0, 250)}`);
      }

      const data = await res.json();
      const audioPart = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData && p.inlineData.data);
      if (!audioPart) {
        throw new Error('Gemini TTS response did not contain inline audio data');
      }

      const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
      const tempPcmPath = `${outputMp3Path}.temp.pcm`;
      fs.writeFileSync(tempPcmPath, pcmBuffer);

      try {
        // Convert 24kHz 16-bit mono PCM to studio-mastered 44.1kHz stereo MP3
        await execFileAsync(
          FFMPEG_BIN,
          [
            '-y',
            '-f',
            's16le',
            '-ar',
            '24000',
            '-ac',
            '1',
            '-i',
            tempPcmPath,
            '-af',
            'atempo=1.06,highpass=f=75,acompressor=threshold=-18dB:ratio=2.4:attack=10:release=120,loudnorm=I=-15:TP=-1.5:LRA=11',
            '-ar',
            '44100',
            '-ac',
            '2',
            '-b:a',
            '192k',
            outputMp3Path,
          ],
          { timeout: 25000 }
        );
      } finally {
        if (fs.existsSync(tempPcmPath)) {
          fs.unlinkSync(tempPcmPath);
        }
      }

      if (fs.existsSync(outputMp3Path) && fs.statSync(outputMp3Path).size > 1000) {
        const durationSec = await probeAudioDurationSec(outputMp3Path);
        return {
          audioPath: outputMp3Path,
          durationSec,
          durationSeconds: durationSec,
          providerUsed: 'gemini_native_tts',
          provider: 'gemini_native_tts',
          voiceUsed: `Gemini Native Hinglish (${geminiVoice} - Casual Explainer Voice)`,
          voice: `Gemini-${geminiVoice}-Hindi`,
        };
      }
      throw new Error('Converted Gemini TTS MP3 file was empty');
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr || new Error('Gemini Native TTS failed after retries');
}

/**
 * Synthesizes Hindi female narration for a text segment or full script.
 * Primary: Gemini 2.5 Native Audio TTS (Aoede / Kore female voice) for realistic human-like Hindi inflection
 * Secondary Fallback: Microsoft Edge Neural Female Hindi Voice (hi-IN-SwaraNeural) via edge-tts
 * Offline Fallback: macOS native Hindi female voice (Lekha)
 */
async function synthesizeHindiSpeech(textOrOpts, maybeOutputPath, maybeOptions = {}) {
  let rawText = textOrOpts;
  let outputMp3Path = maybeOutputPath;
  let options = maybeOptions;

  if (textOrOpts && typeof textOrOpts === 'object') {
    rawText = textOrOpts.text;
    outputMp3Path = textOrOpts.outputPath || textOrOpts.outputMp3Path;
    options = textOrOpts;
  }

  const cleanText = String(rawText || '').trim();
  if (!cleanText) {
    throw new Error('Cannot synthesize empty Hindi narration text.');
  }

  fs.mkdirSync(path.dirname(outputMp3Path), { recursive: true });

  const emotion = options.emotion || 'explaining';
  const prosody = EMOTION_PROSODY[emotion] || EMOTION_PROSODY.explaining;

  // 1. Primary: Gemini 2.5 Flash Native Audio TTS (hyper-realistic human-like Hindi storytelling voice)
  if (isGeminiConfigured() && options.forceEdgeTts !== true) {
    const geminiVoice =
      options.geminiVoice ||
      (options.voice && ['Aoede', 'Kore', 'Leda', 'Zephyr'].includes(options.voice) ? options.voice : 'Aoede');
    try {
      return await synthesizeWithGeminiNativeTts(cleanText, outputMp3Path, emotion, geminiVoice);
    } catch (geminiTtsErr) {
      logger.warn('Gemini Native TTS failed; falling back to Edge Neural Hindi female voice', {
        error: geminiTtsErr.message,
      });
    }
  }

  const isRomanScript = !/[\u0900-\u097F]/.test(cleanText);
  const requestedVoice = options.voiceId || options.voice;
  const edgeVoiceId = isRomanScript
    ? 'en-IN-NeerjaNeural'
    : requestedVoice && requestedVoice.includes('Neural') && requestedVoice !== 'hi-IN-MadhurNeural'
      ? requestedVoice
      : 'hi-IN-SwaraNeural';

  // 2. Secondary: edge-tts (hi-IN-SwaraNeural)
  try {
    await execFileAsync(
      PYTHON_BIN,
      [
        '-m',
        'edge_tts',
        '--voice',
        edgeVoiceId,
        `--rate=${prosody.rate}`,
        `--pitch=${prosody.pitch}`,
        '--text',
        cleanText,
        '--write-media',
        outputMp3Path,
      ],
      { timeout: 30000 }
    );

    if (fs.existsSync(outputMp3Path) && fs.statSync(outputMp3Path).size > 500) {
      const durationSec = await probeAudioDurationSec(outputMp3Path);
      return {
        audioPath: outputMp3Path,
        durationSec,
        durationSeconds: durationSec,
        providerUsed: 'edge_neural',
        provider: 'edge_neural',
        voiceUsed: edgeVoiceId,
        voice: edgeVoiceId,
      };
    }
  } catch (edgeErr) {
    logger.warn('edge-tts synthesis failed or timed out; falling back to macOS Lekha Hindi female voice', {
      error: edgeErr.message,
    });
  }

  // 3. Offline Fallback: macOS built-in Hindi female voice 'Lekha' -> FFmpeg MP3
  const tempAiff = `${outputMp3Path}.temp.aiff`;
  try {
    await execFileAsync('/usr/bin/say', ['-v', 'Lekha', '-r', '175', '-o', tempAiff, cleanText], {
      timeout: 25000,
    });
    await execFileAsync(
      FFMPEG_BIN,
      ['-y', '-i', tempAiff, '-ar', '44100', '-ac', '2', '-b:a', '192k', outputMp3Path],
      { timeout: 25000 }
    );
    if (fs.existsSync(tempAiff)) fs.unlinkSync(tempAiff);

    const durationSec = await probeAudioDurationSec(outputMp3Path);
    return {
      audioPath: outputMp3Path,
      durationSec,
      durationSeconds: durationSec,
      providerUsed: 'macos_lekha_hindi',
      provider: 'macos_lekha_hindi',
      voiceUsed: 'Lekha (hi_IN Female)',
      voice: 'Lekha (hi_IN Female)',
    };
  } catch (fallbackErr) {
    if (fs.existsSync(tempAiff)) fs.unlinkSync(tempAiff);
    await execFileAsync(
      FFMPEG_BIN,
      ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '8', '-b:a', '128k', outputMp3Path],
      { timeout: 10000 }
    );
    return {
      audioPath: outputMp3Path,
      durationSec: 8.0,
      durationSeconds: durationSec,
      providerUsed: 'silent_fallback',
      provider: 'silent_fallback',
      voiceUsed: 'none',
      voice: 'none',
    };
  }
}

module.exports = {
  synthesizeHindiSpeech,
  synthesizeWithGeminiNativeTts,
  probeAudioDurationSec,
  FFMPEG_BIN,
  PYTHON_BIN,
};
