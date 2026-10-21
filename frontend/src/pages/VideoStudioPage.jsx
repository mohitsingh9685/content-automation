import React, { useEffect, useState } from 'react';
import {
  Save,
  Sparkles,
  Film,
  CheckCircle2,
  Download,
  ExternalLink,
  ShieldCheck,
  Play,
  Layers,
  UserCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trash2,
  EyeOff,
} from 'lucide-react';
import { api } from '../api/client';
import {
  StatusBadge,
  getSafeExpressionImage,
  normalizeExpressionId,
} from '../components/StatusBadge';

const EXPRESSION_OPTIONS = [
  { id: 'speaking', label: 'Speaking (Energetic)' },
  { id: 'explaining', label: 'Explaining (Deep Dive)' },
  { id: 'serious', label: 'Serious (Fact Check)' },
  { id: 'confident', label: 'Confident (Authoritative)' },
  { id: 'surprised', label: 'Surprised / Shock Hook' },
  { id: 'questioning', label: 'Curious / Questioning' },
  { id: 'smile', label: 'Warm Smile' },
  { id: 'neutral', label: 'Neutral' },
];

export function VideoStudioPage({ selectedVideoId, onSelectVideoId, onNavigate }) {
  const [videos, setVideos] = useState([]);
  const [activeVideo, setActiveVideo] = useState(null);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renderingSceneNum, setRenderingSceneNum] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [form, setForm] = useState({
    video_format: '9:16',
    hindi_title: '',
    opening_hook: '',
    what_happened: '',
    background_timeline: '',
    why_it_matters: '',
    conclusion_text: '',
    narration_script: '',
    storyboard: [],
    subtitles_srt: '',
    short_description: '',
    hashtagsText: '',
    thumbnail_concept: '',
    call_to_action: '',
    voice_settings: {
      provider: 'gemini_tts',
      voice: 'Gemini-Aoede-Hindi',
      gender: 'female',
      speed: 1.0,
    },
    visual_settings: {
      aspectRatio: '9:16',
      resolution: '1080x1920',
      theme: 'modern_dark',
      subtitleStyle: 'bold_yellow',
      bgMusic: 'newsroom_ambient',
    },
    presenter_settings: {
      presenter_id: 'aashi_official_v1',
      name_hindi: 'Aashi',
      default_outfit: 'black_blazer',
      default_look: 'news_anchor',
    },
  });

  const populateForm = (v) => {
    if (!v) return;
    setForm({
      video_format: v.video_format || '9:16',
      hindi_title: v.hindi_title || '',
      opening_hook: v.opening_hook || '',
      what_happened: v.what_happened || '',
      background_timeline: Array.isArray(v.background_timeline)
        ? v.background_timeline.join('\n')
        : v.background_timeline || '',
      why_it_matters: v.why_it_matters || '',
      conclusion_text: v.conclusion_text || '',
      narration_script: v.narration_script || '',
      storyboard: Array.isArray(v.storyboard) ? v.storyboard : [],
      subtitles_srt: v.subtitles_srt || '',
      short_description: v.short_description || '',
      hashtagsText: Array.isArray(v.hashtags) ? v.hashtags.join(' ') : '',
      thumbnail_concept: v.thumbnail_concept || '',
      call_to_action: v.call_to_action || '',
      voice_settings: v.voice_settings || {
        provider: 'gemini_tts',
        voice: 'Gemini-Aoede-Hindi',
        gender: 'female',
        speed: 1.0,
      },
      visual_settings: v.visual_settings || {
        presenterMode: 'faceless',
        aspectRatio: v.video_format || '9:16',
        resolution: '1080x1920',
        theme: 'indian_topic_explainer',
        subtitleStyle: 'bold_yellow',
        bgMusic: 'newsroom_ambient',
      },
      presenter_settings: v.presenter_settings || {
        presenter_id: 'aashi_official_v1',
        name_hindi: 'Aashi',
        default_outfit: 'black_blazer',
        default_look: 'news_anchor',
      },
    });
  };

  const loadStudioData = async (targetId = selectedVideoId, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const videosRes = await api.getVideos();
      const list = videosRes.videos || [];
      setVideos(list);

      const chosenId =
        targetId && list.some((v) => v.id === Number(targetId))
          ? Number(targetId)
          : list[0]?.id || null;

      if (chosenId) {
        const detail = await api.getVideoById(chosenId);
        setActiveVideo(detail.video);
        populateForm(detail.video);
        if (onSelectVideoId) onSelectVideoId(chosenId);

        if (detail.video.status === 'processing' || detail.video.render_progress?.active) {
          setIsPolling(true);
        } else {
          setIsPolling(false);
          setRenderingSceneNum(null);
        }
      } else {
        setActiveVideo(null);
        if (onSelectVideoId) onSelectVideoId(null);
      }
    } catch (err) {
      if (!silent) setFeedback({ type: 'error', message: err.message });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadStudioData(selectedVideoId);
  }, [selectedVideoId]);

  // Automatic live polling (every 2s) when a video or scene is rendering so 0-100% progress updates smoothly
  useEffect(() => {
    if (!isPolling || !activeVideo?.id) return;
    const timer = setInterval(async () => {
      try {
        const detail = await api.getVideoById(activeVideo.id);
        if (detail?.video) {
          setActiveVideo(detail.video);
          const stillActive =
            detail.video.status === 'processing' || detail.video.render_progress?.active;
          if (!stillActive) {
            populateForm(detail.video);
            setIsPolling(false);
            setRenderingSceneNum(null);
            setFeedback({
              type: 'success',
              message: '100% • Video render complete! Press Play on the video player to watch.',
            });
          }
        }
      } catch (_) {
        // ignore transient poll error
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [isPolling, activeVideo?.id]);

  const updateSceneField = (idx, field, value) => {
    const updated = [...form.storyboard];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
    };
    const syncedNarration = updated
      .map((s) => (s.narration_hindi || '').trim())
      .filter(Boolean)
      .join(' ');
    setForm({
      ...form,
      storyboard: updated,
      narration_script: syncedNarration || form.narration_script,
    });
  };

  const updateScenePresenterField = (idx, field, value) => {
    const updated = [...form.storyboard];
    const currentPresenter = updated[idx]?.presenter_config || {
      visible: true,
      presenter_id: 'aashi_official_v1',
      expression: 'explaining',
      look: 'news_anchor',
      outfit: 'black_blazer',
      framing: 'side_by_side',
    };
    updated[idx] = {
      ...updated[idx],
      presenter_config: {
        ...currentPresenter,
        [field]: value,
      },
    };
    setForm({ ...form, storyboard: updated });
  };

  const saveCurrentFormToBackend = async () => {
    const hashtags = form.hashtagsText
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const syncedNarration = form.storyboard
      .map((s) => (s.narration_hindi || '').trim())
      .filter(Boolean)
      .join(' ');

    return api.updateVideoScript(activeVideo.id, {
      video_format: form.video_format,
      hindi_title: form.hindi_title,
      opening_hook: form.storyboard[0]?.narration_hindi || form.opening_hook,
      what_happened: form.what_happened,
      background_timeline: form.background_timeline,
      why_it_matters: form.why_it_matters,
      conclusion_text: form.conclusion_text,
      narration_script: syncedNarration || form.narration_script,
      storyboard: form.storyboard,
      subtitles_srt: form.subtitles_srt,
      short_description: form.short_description,
      hashtags,
      thumbnail_concept: form.thumbnail_concept,
      call_to_action: form.call_to_action,
      voice_settings: form.voice_settings,
      visual_settings: form.visual_settings,
      presenter_settings: form.presenter_settings,
    });
  };

  const handleSaveScript = async () => {
    if (!activeVideo) return;
    try {
      setSaving(true);
      setFeedback(null);
      const res = await saveCurrentFormToBackend();
      setActiveVideo(res.video);
      populateForm(res.video);
      setFeedback({
        type: 'success',
        message: 'Saved! Click "Render Full Video" to update the MP4 with your changes.',
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleVideoPresenterMode = (nextMode) => {
    const isFaceless = nextMode === 'faceless';
    const updatedStoryboard = form.storyboard.map((sc, idx) => {
      const sceneNum = sc.scene_number || idx + 1;
      const showFace = !isFaceless && sceneNum === 1;
      return {
        ...sc,
        duration_seconds: isFaceless ? 9 : sceneNum === 1 ? 8 : 6,
        visual_template: showFace ? 'anchor_studio' : '3d_cutaway',
        presenter_Mode: showFace ? 'full_body_9_16' : 'b_roll_pip_only',
        presenter_config: {
          ...(sc.presenter_config || {}),
          visible: showFace,
          framing: showFace ? 'full_body_9_16' : 'hidden_3d_cutaway',
        },
      };
    });

    setForm({
      ...form,
      storyboard: updatedStoryboard,
      visual_settings: {
        ...(form.visual_settings || {}),
        presenterMode: nextMode,
      },
    });
  };

  const handleRegenerateScript = async () => {
    if (!activeVideo) return;
    const currentPresenterMode =
      form.visual_settings?.presenterMode === 'with_face' ? 'with_face' : 'faceless';
    try {
      setSaving(true);
      setIsPolling(true);
      setFeedback({
        type: 'success',
        message:
          currentPresenterMode === 'faceless'
            ? 'Writing a genuine 45-second (5 × 9s) Faceless 3D Hindi Topic Explainer script & rendering 3D scenes in parallel...'
            : 'Writing a fresh Hindi Topic Explainer script with Presenter & rendering Veo 3.1 scenes in parallel...',
      });
      await api.regenerateVideoScript(activeVideo.id, {
        customInstructions: regenInstructions,
        requestedModel: 'gemini-4-argon',
        videoFormat: '9:16',
        presenterMode: currentPresenterMode,
        autoRender: true,
      });
      setTimeout(() => loadStudioData(activeVideo.id, true), 1500);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
      setIsPolling(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRenderVideo = async (sceneNumber = null, sceneIdx = null) => {
    if (!activeVideo) return;
    const currentPresenterMode =
      form.visual_settings?.presenterMode === 'with_face' ? 'with_face' : 'faceless';
    try {
      setSaving(true);
      if (sceneNumber) setRenderingSceneNum(sceneNumber);
      setFeedback(null);

      await saveCurrentFormToBackend();

      const targetScene =
        sceneIdx !== null && form.storyboard[sceneIdx]
          ? form.storyboard[sceneIdx]
          : sceneNumber
            ? form.storyboard.find((s, i) => (s.scene_number || i + 1) === Number(sceneNumber))
            : null;

      await api.renderVideo(
        activeVideo.id,
        sceneNumber,
        targetScene
          ? {
              presenterMode: currentPresenterMode,
              visible: Boolean(targetScene.presenter_config?.visible),
              scenePrompt: targetScene.custom_prompt || targetScene.visual_description || '',
              visual_description: targetScene.visual_description || '',
              narration_hindi: targetScene.narration_hindi || '',
              on_screen_text: targetScene.on_screen_text || '',
              expression: targetScene.presenter_config?.expression || 'explaining',
              storyboard: form.storyboard,
            }
          : {
              presenterMode: currentPresenterMode,
              storyboard: form.storyboard,
            }
      );

      setIsPolling(true);
      setFeedback({
        type: 'success',
        message: sceneNumber
          ? `Fixing & Re-rendering Scene #${sceneNumber} (${currentPresenterMode === 'faceless' ? 'Faceless 3D Cutaway' : 'Studio Mode'})...`
          : `Rendering full ${currentPresenterMode === 'faceless' ? '45-second Faceless 3D Explainer' : '9:16 Explainer'} video in parallel...`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
      setRenderingSceneNum(null);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!activeVideo) return;
    try {
      setSaving(true);
      setFeedback(null);
      const res = await api.approveVideo(
        activeVideo.id,
        'Approved in Aashi AI Video Studio.'
      );
      setActiveVideo(res.video);
      setFeedback({
        type: 'success',
        message: 'Video Approved! Ready to download or publish.',
      });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!activeVideo) return;
    const confirmed = window.confirm(
      `Delete Video #${activeVideo.id} ("${activeVideo.hindi_title?.slice(0, 50)}")?`
    );
    if (!confirmed) return;
    try {
      setSaving(true);
      setIsPolling(false);
      await api.deleteVideo(activeVideo.id);
      setFeedback({
        type: 'success',
        message: `Video #${activeVideo.id} deleted.`,
      });
      await loadStudioData(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !activeVideo) {
    return (
      <div className="p-12 flex items-center justify-center text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2.5 text-indigo-400" />
        Loading Video Studio...
      </div>
    );
  }

  if (!activeVideo) {
    return (
      <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
        <p className="text-slate-300 text-base">No videos created yet.</p>
        <button
          onClick={() => onNavigate('trends')}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer"
        >
          Pick a Trending News Story
        </button>
      </div>
    );
  }

  const factCheck = activeVideo.fact_check_report || {};
  const sourceLinks = Array.isArray(activeVideo.source_links) ? activeVideo.source_links : [];
  const isProcessing =
    activeVideo.status === 'processing' ||
    Boolean(activeVideo.render_progress?.active) ||
    isPolling;
  const progressPercent = activeVideo.render_progress?.percent ?? (isProcessing ? 12 : 100);
  const progressStage =
    activeVideo.render_progress?.stage ||
    (renderingSceneNum
      ? `Re-rendering Scene #${renderingSceneNum} with Veo 3.1 + Aoede Hindi Voice...`
      : 'Rendering 3D Scenes & Veo 3.1 Video in Parallel...');

  return (
    <div className="space-y-6">
      {/* Clean Studio Top Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/95 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <select
            value={activeVideo.id}
            onChange={(e) => loadStudioData(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white max-w-md cursor-pointer"
          >
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                Video #{v.id}: {v.hindi_title?.slice(0, 55)}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={isProcessing ? 'processing' : activeVideo.status} />
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-medium">
              {activeVideo.ai_model_used || 'gemini-4-argon'} + Veo 3.1
            </span>

            {/* Quick Faceless vs With Face Toggle */}
            <div className="inline-flex items-center rounded-xl bg-slate-950 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => toggleVideoPresenterMode('faceless')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  form.visual_settings?.presenterMode !== 'with_face'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Remove face from all scenes — Pure 45s 3D Visual Explainer"
              >
                <EyeOff className="w-3 h-3" />
                Faceless 3D (No Face • 45s)
              </button>
              <button
                type="button"
                onClick={() => toggleVideoPresenterMode('with_face')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                  form.visual_settings?.presenterMode === 'with_face'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Show AI Presenter Aashi in Scene 1"
              >
                <UserCheck className="w-3 h-3" />
                With Face
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSaveScript}
            disabled={saving || isProcessing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs sm:text-sm font-semibold border border-slate-700 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Edits
          </button>

          <button
            onClick={() => handleRenderVideo(null)}
            disabled={saving || isProcessing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-950/60 transition cursor-pointer"
          >
            <Film className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? `Rendering (${progressPercent}%)...` : 'Render Full Video'}
          </button>

          {activeVideo.status !== 'approved' && (
            <button
              onClick={handleApprove}
              disabled={saving || factCheck.safe_to_publish === false}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
            </button>
          )}

          <button
            onClick={handleDeleteVideo}
            disabled={saving}
            title="Delete this Video"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-950/50 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Delete Video
          </button>
        </div>
      </div>

      {/* Live Creation Percentage Progress Bar (0% -> 100%) */}
      {isProcessing && (
        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-indigo-100">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>{progressStage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-extrabold tracking-wide shadow">
                {progressPercent}% Complete
              </span>
              <button
                onClick={() => loadStudioData(activeVideo.id, true)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-950 border border-indigo-500/30 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-500 rounded-full"
              style={{ width: `${Math.max(5, Math.min(100, progressPercent))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Fast Parallel Engine Active: 2 scenes render simultaneously with Aoede Hindi TTS + 3D Keyframe + Google Veo 3.1.
          </p>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && !isProcessing && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Workspace: Left = Phone Video Player, Right = Whole-Video Prompt + 5 Scene Prompt Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (4 Cols): Sticky 9:16 Video Player + Aashi Quick Card */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900/95 border border-slate-800 flex flex-col items-center space-y-4 shadow-xl">
            <div className="w-full flex items-center justify-between">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                Master 9:16 Video
              </span>
              <span className="text-xs text-slate-400">
                {activeVideo.duration_seconds || 45}s • Vertical Explainer
              </span>
            </div>

            {activeVideo.video_url ? (
              <div className="w-full flex flex-col items-center space-y-3">
                <video
                  key={activeVideo.video_url}
                  src={activeVideo.video_url}
                  controls
                  playsInline
                  className="w-[280px] sm:w-[300px] aspect-[9/16] rounded-2xl border-2 border-indigo-500/40 shadow-2xl bg-black object-cover"
                />

                <div className="w-full grid grid-cols-2 gap-2.5 pt-1">
                  <a
                    href={activeVideo.video_url}
                    download={`aashi-short-${activeVideo.id}.mp4`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    Download MP4
                  </a>

                  <button
                    onClick={() => onNavigate('publishing')}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Publish / Export
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-[280px] aspect-[9/16] rounded-2xl bg-slate-950 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <img
                  src="/assets/presenter/hero_anchor.jpg"
                  alt="Aashi"
                  className="w-24 h-28 object-cover object-top rounded-2xl border-2 border-indigo-400 shadow-lg"
                />
                <div className="text-sm font-bold text-white font-hindi">
                  {form.hindi_title}
                </div>
                <p className="text-xs text-slate-400">
                  Script & 5-scene storyboard are ready. Click below to render the MP4 video!
                </p>
                <button
                  onClick={() => handleRenderVideo(null)}
                  disabled={saving || isProcessing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow cursor-pointer"
                >
                  <Film className="w-4 h-4" />
                  Render 9:16 Video Now
                </button>
              </div>
            )}
          </div>

          {/* Compact Presenter Aashi Card (With Proper Portrait Framing!) */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/assets/presenter/hero_anchor.jpg"
                alt="Aashi"
                className="w-12 h-14 object-cover object-top rounded-xl border border-indigo-400/60 shrink-0"
              />
              <div>
                <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  Official AI Anchor
                </div>
                <div className="text-sm font-bold text-white">
                  Aashi (AI Explainer Host)
                </div>
                <div className="text-[11px] text-slate-400">
                  Voice: Gemini Aoede (Natural Desi Hindi)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (8 Cols): Whole-Video AI Fix Box + 5 Scene-by-Scene Prompt Editors */}
        <div className="lg:col-span-8 space-y-5">
          {/* 1. WHOLE-VIDEO AI PROMPT FIX / REMAKE PANEL */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/40 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Don&apos;t Like This Video? Fix or Remake Entire Video with AI Prompt
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Tell Gemini 4 Argon + Veo 3.1 how to change the whole video (tone, visuals, humor, or focus) and remake all 5 scenes.
                </p>
              </div>
            </div>

            {/* Quick 1-Click Prompt Presets */}
            <div className="flex flex-wrap gap-2">
              {[
                'Explain genuinely in 45 seconds (5 scenes × 9s) with pure 3D cutaway diagrams and zero human face',
                'Break down step-by-step with real Indian examples, numbers, and crystal-clear Hinglish terminology',
                'Focus on SSC/UPSC exam facts, constitutional articles, and simple visual analogies for students',
              ].map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRegenInstructions(preset)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-indigo-950/80 text-indigo-200 border border-indigo-500/30 transition cursor-pointer"
                >
                  + {preset.slice(0, 62)}...
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="text"
                value={regenInstructions}
                onChange={(e) => setRegenInstructions(e.target.value)}
                placeholder="Type your prompt to fix the whole video (e.g. 'Make it funnier in Desi Hindi, show 3D stadium cutaway')..."
                className="flex-1 bg-slate-950 border border-indigo-500/40 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none"
              />
              <button
                onClick={handleRegenerateScript}
                disabled={saving || isProcessing}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 text-white text-xs sm:text-sm font-semibold whitespace-nowrap shadow-lg shadow-indigo-950/50 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Fix & Remake Full Video
              </button>
            </div>

            {/* Editable Video Title */}
            <div className="pt-3 border-t border-slate-800/80">
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Video Title (Roman Hinglish + English)
              </label>
              <input
                type="text"
                value={form.hindi_title}
                onChange={(e) => setForm({ ...form, hindi_title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-sm sm:text-base font-bold text-white font-hindi focus:outline-none"
              />
            </div>
          </div>

          {/* 2. SCENE-BY-SCENE AI VISUAL & VOICEOVER PROMPT EDITOR (All 5 Scenes) */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Scene-by-Scene Prompt & Voiceover Editor ({form.storyboard.length} Scenes)
              </h2>
              <span className="text-xs text-indigo-300">
                Change the Visual Prompt or Hindi Dialogue in any scene and click &ldquo;Fix &amp; Re-Render Scene&rdquo;
              </span>
            </div>

            {form.storyboard.map((sc, idx) => {
              const sceneNum = sc.scene_number || idx + 1;
              const exprId = normalizeExpressionId(sc.presenter_config?.expression);
              const exprImg = getSafeExpressionImage(exprId);
              const isAashiOnCamera =
                sc.presenter_config?.visible === true &&
                form.visual_settings?.presenterMode === 'with_face';

              return (
                <div
                  key={sc.scene_id || idx}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900/95 border border-slate-800 hover:border-indigo-500/40 transition flex flex-col sm:flex-row gap-4 items-start shadow-md"
                >
                  {/* Left: 9:16 Scene Video or Keyframe Preview */}
                  <div className="w-full sm:w-36 shrink-0 flex flex-col items-center space-y-2.5">
                    {sc.rendered_clip_url ? (
                      <video
                        key={sc.rendered_clip_url}
                        src={sc.rendered_clip_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-32 sm:w-36 aspect-[9/16] rounded-xl bg-black border border-slate-700 object-cover shadow"
                      />
                    ) : sc.keyframe_url ? (
                      <img
                        src={sc.keyframe_url}
                        alt={`Scene ${sceneNum}`}
                        className="w-32 sm:w-36 aspect-[9/16] rounded-xl bg-slate-950 border border-slate-700 object-cover object-top shadow"
                      />
                    ) : (
                      <img
                        src={exprImg}
                        alt={`Scene ${sceneNum}`}
                        className="w-32 sm:w-36 aspect-[9/16] rounded-xl bg-slate-950 border border-slate-700 object-cover object-top opacity-80"
                      />
                    )}

                    <button
                      onClick={() => handleRenderVideo(sceneNum, idx)}
                      disabled={saving || isProcessing}
                      className="w-32 sm:w-36 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold shadow transition cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      {renderingSceneNum === sceneNum
                        ? 'Fixing Scene...'
                        : `Fix Scene #${sceneNum}`}
                    </button>
                  </div>

                  {/* Right: Scene Visual AI Prompt + Hindi Voiceover + On-Screen Callout */}
                  <div className="flex-1 w-full space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                          Scene {sceneNum}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateScenePresenterField(idx, 'visible', !isAashiOnCamera)
                          }
                          className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border cursor-pointer transition ${
                            isAashiOnCamera
                              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                          }`}
                          title="Click to toggle human face on/off in this scene"
                        >
                          {isAashiOnCamera
                            ? 'With Face (Click to Remove Face)'
                            : 'Faceless 3D Visual (No Face)'}
                        </button>
                        <span className="text-xs text-slate-400">
                          ~{sc.duration_seconds || 9}s
                        </span>
                      </div>

                      {/* Aashi Expression Selector with Safe Thumbnail */}
                      <div className="flex items-center gap-2">
                        <img
                          src={exprImg}
                          alt={exprId}
                          className="w-6 h-6 rounded-full object-cover object-top border border-indigo-400"
                        />
                        <select
                          value={exprId}
                          onChange={(e) =>
                            updateScenePresenterField(idx, 'expression', e.target.value)
                          }
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 cursor-pointer"
                        >
                          {EXPRESSION_OPTIONS.map((exp) => (
                            <option key={exp.id} value={exp.id}>
                              {exp.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* NEW: Scene AI Visual & Video Prompt Box */}
                    <div className="p-3 rounded-xl bg-indigo-950/25 border border-indigo-500/30 space-y-1.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-indigo-300">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          Scene {sceneNum} AI Visual &amp; Video Prompt (Tell AI what to show in this scene)
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          3D Cutaway + Veo 3.1 Motion
                        </span>
                      </label>
                      <textarea
                        rows={2}
                        value={sc.custom_prompt ?? sc.visual_description ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...form.storyboard];
                          updated[idx] = {
                            ...updated[idx],
                            custom_prompt: val,
                            visual_description: val,
                          };
                          setForm({ ...form, storyboard: updated });
                        }}
                        placeholder={`Describe what you want to see in Scene #${sceneNum} (e.g., "3D cutaway of cricket pitch showing 150 km/h ball trajectory with glowing red arrow while Aashi explains in foreground")...`}
                        className="w-full bg-slate-950 border border-indigo-500/30 focus:border-indigo-400 rounded-lg px-3 py-2 text-xs text-slate-100 leading-relaxed focus:outline-none"
                      />
                    </div>

                    {/* Hindi Voiceover Textarea */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Roman Hinglish Voiceover in Scene {sceneNum} (Casual Spoken Hinglish)
                      </label>
                      <textarea
                        rows={2}
                        value={sc.narration_hindi || ''}
                        onChange={(e) =>
                          updateSceneField(idx, 'narration_hindi', e.target.value)
                        }
                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-sm text-white font-hindi leading-relaxed focus:outline-none"
                      />
                    </div>

                    {/* On-screen Hindi Headline + Action Button Row */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
                      <div className="flex-1">
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          On-Screen Callout (Roman Hinglish / English)
                        </label>
                        <input
                          type="text"
                          value={sc.on_screen_text || ''}
                          onChange={(e) =>
                            updateSceneField(idx, 'on_screen_text', e.target.value)
                          }
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-1.5 text-xs text-amber-300 font-hindi focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => handleRenderVideo(sceneNum, idx)}
                        disabled={saving || isProcessing}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-xs font-semibold whitespace-nowrap transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        {renderingSceneNum === sceneNum
                          ? `Re-rendering Scene #${sceneNum}...`
                          : `Fix & Re-Render Scene #${sceneNum} from Prompt`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Extra Details (Description, Hashtags, Subtitles & Fact Check) */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Caption, Hashtags, Subtitles (.SRT) & Verified Sources
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-5 pt-2 border-t border-slate-800 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      YouTube / Reels Description (Roman Hinglish + English)
                    </label>
                    <textarea
                      rows={2}
                      value={form.short_description}
                      onChange={(e) =>
                        setForm({ ...form, short_description: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-hindi"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Hashtags</label>
                    <textarea
                      rows={2}
                      value={form.hashtagsText}
                      onChange={(e) =>
                        setForm({ ...form, hashtagsText: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-sky-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Synchronized Hindi Subtitles (.SRT)
                  </label>
                  <textarea
                    rows={4}
                    value={form.subtitles_srt}
                    onChange={(e) =>
                      setForm({ ...form, subtitles_srt: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 font-hindi"
                  />
                </div>

                {sourceLinks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span className="text-xs text-slate-400">Verified Sources:</span>
                    {sourceLinks.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
                      >
                        {src.source || src.title || 'Source'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
